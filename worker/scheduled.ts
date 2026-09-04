// Cron handler: check reminders and send push notifications
import type { Bindings } from './index';
import { sendPush, type PushSub, type VapidKeys } from './lib/webpush';
import { scrapeAndSync, shouldSync } from './lib/scraper';
import { ensureVaccineSchema } from './lib/vaccine-schema';

interface PushPayload {
  title: string;
  body: string;
  tag: string;
  data: Record<string, unknown>;
}

// Hong Kong time (UTC+8) — booking reminders are date-based, so they must use local dates.
const HK_OFFSET_MS = 8 * 60 * 60 * 1000;
// Earliest local hour at which a "tomorrow's booking" reminder may be sent.
const BOOKING_REMINDER_HOUR = 9;

export async function handleScheduled(env: Bindings): Promise<void> {
  const db = env.DB;

  // Daily baby care rooms data sync
  try {
    if (await shouldSync(db)) {
      await scrapeAndSync(db);
    }
  } catch (e) {
    console.error('Baby rooms sync error:', e);
  }

  // Ensure notification_log table exists (dedup tracking)
  await db.prepare('CREATE TABLE IF NOT EXISTS notification_log (reminder_type TEXT PRIMARY KEY, last_notified_at TEXT NOT NULL)').run();

  // Get all push subscriptions
  const { results: subRows } = await db.prepare(
    'SELECT * FROM push_subscriptions'
  ).all();
  if (!subRows?.length) return;

  const subs: PushSub[] = subRows.map((sub) => ({
    endpoint: sub.endpoint as string,
    p256dh: sub.p256dh as string,
    auth: sub.auth as string,
  }));

  const vapid: VapidKeys = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };

  // Vaccine booking reminders (預約日前一天) — independent of the reminder toggles,
  // since a booking date is set explicitly by the user for that vaccine.
  try {
    await checkVaccineBookingReminders(db, subs, vapid);
  } catch (e) {
    console.error('Vaccine booking reminder error:', e);
  }

  // Get enabled reminders
  const { results: reminders } = await db.prepare(
    'SELECT * FROM reminders WHERE enabled = 1'
  ).all();
  if (!reminders?.length) return;

  const now = Date.now();

  for (const reminder of reminders) {
    const type = reminder.type as string;
    let message = '';

    switch (type) {
      case 'feed': {
        message = await checkFeedReminder(db, now, reminder.interval_minutes as number);
        break;
      }
      case 'diaper': {
        message = await checkDiaperReminder(db, now, reminder.interval_minutes as number);
        break;
      }
      case 'vaccine': {
        message = await checkVaccineReminder(db, reminder.advance_days as number);
        break;
      }
      case 'awake_time': {
        message = await checkAwakeReminder(db, now, reminder.max_awake_minutes as number);
        break;
      }
    }

    if (!message) continue;

    // Check dedup: only notify once per overdue period
    const log = await db.prepare(
      'SELECT last_notified_at FROM notification_log WHERE reminder_type = ?'
    ).bind(type).first();

    const lastNotified = log?.last_notified_at
      ? new Date(log.last_notified_at as string).getTime()
      : 0;

    // Get the "anchor" time (last event time) to compare against last_notified_at
    const anchor = await getAnchorTime(db, type);
    if (anchor && lastNotified >= anchor) continue; // Already notified for this period

    // Send to all subscribers
    const titles: Record<string, string> = {
      feed: '餵奶提醒',
      diaper: '換片提醒',
      vaccine: '疫苗提醒',
      awake_time: '清醒時間提醒',
    };

    await broadcast(db, subs, vapid, {
      title: titles[type] || '可樂仔健康記錄',
      body: message,
      tag: type,
      data: { type, url: '/' },
    });

    await markNotified(db, type);
  }
}

/* ── Push helpers ── */

// Send one payload to every subscriber, pruning subscriptions the push service reports as gone.
async function broadcast(
  db: D1Database, subs: PushSub[], vapid: VapidKeys, payload: PushPayload
): Promise<void> {
  const staleEndpoints: string[] = [];

  for (const sub of subs) {
    try {
      const result = await sendPush(sub, payload, vapid);
      if (result.status === 410 || result.status === 404) {
        staleEndpoints.push(sub.endpoint);
      }
    } catch (e) {
      console.error(`Push failed for ${payload.tag}:`, e);
    }
  }

  // Clean up expired subscriptions
  for (const ep of staleEndpoints) {
    await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(ep).run();
    const idx = subs.findIndex((s) => s.endpoint === ep);
    if (idx >= 0) subs.splice(idx, 1);
  }
}

async function markNotified(db: D1Database, key: string): Promise<void> {
  await db.prepare(`
    INSERT INTO notification_log (reminder_type, last_notified_at)
    VALUES (?, datetime('now'))
    ON CONFLICT(reminder_type) DO UPDATE SET last_notified_at = datetime('now')
  `).bind(key).run();
}

/* ── Vaccine booking reminders (預約日前一天推送) ── */

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDateZh(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

async function checkVaccineBookingReminders(
  db: D1Database, subs: PushSub[], vapid: VapidKeys
): Promise<void> {
  // Work in Hong Kong local time so "tomorrow" matches the date the user entered.
  const hkNow = new Date(Date.now() + HK_OFFSET_MS);
  if (hkNow.getUTCHours() < BOOKING_REMINDER_HOUR) return;

  const tomorrow = new Date(hkNow);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = toDateStr(tomorrow);

  await ensureVaccineSchema(db);

  const { results: bookings } = await db.prepare(`
    SELECT id, name, dose, booking_date, location FROM vaccines
    WHERE status != 'done' AND booking_date = ?
    ORDER BY id ASC
  `).bind(tomorrowStr).all();
  if (!bookings?.length) return;

  for (const v of bookings) {
    // One notification per vaccine per booking date; re-booking to a new date re-arms it.
    const key = `vaccine_booking:${v.id}:${v.booking_date}`;
    const log = await db.prepare(
      'SELECT last_notified_at FROM notification_log WHERE reminder_type = ?'
    ).bind(key).first();
    if (log) continue;

    const label = `${v.name}${v.dose ? '（' + v.dose + '）' : ''}`;
    const where = v.location ? `，地點：${v.location}` : '';
    const message = `${label} 已預約於明天 ${fmtDateZh(v.booking_date as string)} 接種${where}，請記得準時前往！`;

    await broadcast(db, subs, vapid, {
      title: '疫苗預約提醒',
      body: message,
      tag: 'vaccine_booking',
      data: { type: 'vaccine_booking', vaccineId: v.id, url: '/' },
    });

    await markNotified(db, key);
    if (!subs.length) return;
  }
}

/* ── Reminder checks ── */

async function checkFeedReminder(
  db: D1Database, now: number, intervalMin: number
): Promise<string> {
  const last = await db.prepare(
    'SELECT time FROM feeds ORDER BY time DESC LIMIT 1'
  ).first();
  if (!last?.time) return '';

  const lastTime = new Date(last.time as string).getTime();
  const elapsed = now - lastTime;
  const intervalMs = intervalMin * 60 * 1000;
  const advanceMs = 15 * 60 * 1000; // 提前 15 分鐘通知

  if (elapsed < intervalMs - advanceMs) return '';

  if (elapsed < intervalMs) {
    const remaining = Math.round((intervalMs - elapsed) / 60000);
    return `再過約 ${remaining} 分鐘就到餵奶時間，請準備喔！`;
  }

  const mins = Math.round(elapsed / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `距離上次餵奶已經 ${h > 0 ? h + '小時' : ''}${m}分鐘，記得餵奶喔！`;
}

async function checkDiaperReminder(
  db: D1Database, now: number, intervalMin: number
): Promise<string> {
  const last = await db.prepare(
    'SELECT time FROM diapers ORDER BY time DESC LIMIT 1'
  ).first();
  if (!last?.time) return '';

  const lastTime = new Date(last.time as string).getTime();
  const elapsed = now - lastTime;
  const intervalMs = intervalMin * 60 * 1000;

  if (elapsed < intervalMs) return '';

  const mins = Math.round(elapsed / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `距離上次換片已經 ${h > 0 ? h + '小時' : ''}${m}分鐘，記得檢查尿片喔！`;
}

async function checkVaccineReminder(
  db: D1Database, advanceDays: number
): Promise<string> {
  const upcoming = await db.prepare(`
    SELECT name, dose, scheduled_date FROM vaccines
    WHERE status = 'pending'
      AND scheduled_date <= date('now', '+' || ? || ' days')
      AND scheduled_date >= date('now')
    ORDER BY scheduled_date ASC
    LIMIT 1
  `).bind(advanceDays).first();

  if (!upcoming) return '';
  return `${upcoming.name}${upcoming.dose ? '(' + upcoming.dose + ')' : ''} 預定於 ${upcoming.scheduled_date}，請準備預約接種！`;
}

async function checkAwakeReminder(
  db: D1Database, now: number, maxMin: number
): Promise<string> {
  // Check if baby is currently awake (last sleep has an end_time, or no sleep records)
  const last = await db.prepare(
    'SELECT end_time FROM sleeps ORDER BY start_time DESC LIMIT 1'
  ).first();

  if (!last?.end_time) return ''; // Currently sleeping or no records

  const wakeTime = new Date(last.end_time as string).getTime();
  const awakeMin = Math.round((now - wakeTime) / 60000);

  if (awakeMin < maxMin) return '';

  const h = Math.floor(awakeMin / 60);
  const m = awakeMin % 60;
  return `BB已清醒 ${h > 0 ? h + '小時' : ''}${m}分鐘，可能需要休息了！`;
}

/* ── Get the "anchor" time for dedup ── */

async function getAnchorTime(db: D1Database, type: string): Promise<number> {
  let row: Record<string, unknown> | null = null;

  switch (type) {
    case 'feed':
      row = await db.prepare('SELECT time FROM feeds ORDER BY time DESC LIMIT 1').first();
      return row?.time ? new Date(row.time as string).getTime() : 0;
    case 'diaper':
      row = await db.prepare('SELECT time FROM diapers ORDER BY time DESC LIMIT 1').first();
      return row?.time ? new Date(row.time as string).getTime() : 0;
    case 'vaccine':
      // For vaccines, use today at midnight as anchor (notify once per day)
      return new Date(new Date().toISOString().split('T')[0]).getTime();
    case 'awake_time':
      row = await db.prepare('SELECT end_time FROM sleeps ORDER BY start_time DESC LIMIT 1').first();
      return row?.end_time ? new Date(row.end_time as string).getTime() : 0;
    default:
      return 0;
  }
}
