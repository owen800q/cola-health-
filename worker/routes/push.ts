import { Hono } from 'hono';
import type { Bindings } from '../index';
import { sendPush, type PushSub, type VapidKeys } from '../lib/webpush';

export const pushRoutes = new Hono<{ Bindings: Bindings }>();

// POST /api/push/subscribe
pushRoutes.post('/subscribe', async (c) => {
  const db = c.env.DB;
  const { endpoint, keys } = await c.req.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return c.json({ error: 'Invalid subscription' }, 400);
  }

  await db.prepare(`
    INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth)
    VALUES (?, ?, ?)
  `).bind(endpoint, keys.p256dh, keys.auth).run();

  return c.json({ ok: true });
});

// DELETE /api/push/unsubscribe
pushRoutes.delete('/unsubscribe', async (c) => {
  const db = c.env.DB;
  const { endpoint } = await c.req.json();
  if (!endpoint) {
    return c.json({ error: 'endpoint is required' }, 400);
  }
  await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
  return c.json({ ok: true });
});

// POST /api/push/test — send a real test notification to all subscribers
pushRoutes.post('/test', async (c) => {
  const db = c.env.DB;
  const vapid: VapidKeys = {
    publicKey: c.env.VAPID_PUBLIC_KEY,
    privateKey: c.env.VAPID_PRIVATE_KEY,
    subject: c.env.VAPID_SUBJECT,
  };

  if (!vapid.publicKey || !vapid.privateKey) {
    return c.json({ error: 'VAPID keys not configured' }, 500);
  }

  const { results: subs } = await db.prepare('SELECT * FROM push_subscriptions').all();
  if (!subs?.length) {
    return c.json({ error: 'No push subscriptions found' }, 404);
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    const pushSub: PushSub = {
      endpoint: sub.endpoint as string,
      p256dh: sub.p256dh as string,
      auth: sub.auth as string,
    };
    try {
      const result = await sendPush(pushSub, {
        title: '可樂仔健康記錄',
        body: '測試通知 — 推送功能正常運作！',
        tag: 'test',
      }, vapid);

      if (result.ok) sent++;
      else failed++;

      // Clean up expired subscriptions
      if (result.status === 410 || result.status === 404) {
        await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
          .bind(pushSub.endpoint).run();
      }
    } catch {
      failed++;
    }
  }

  return c.json({ ok: true, sent, failed });
});

// POST /api/push/check-reminders — manually trigger the cron reminder check
pushRoutes.post('/check-reminders', async (c) => {
  try {
    const { handleScheduled } = await import('../scheduled');
    await handleScheduled(c.env);
    return c.json({ ok: true, message: 'Reminder check completed' });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

// GET /api/push/status — debug endpoint showing subscription and reminder state
pushRoutes.get('/status', async (c) => {
  const db = c.env.DB;
  const { results: subs } = await db.prepare('SELECT endpoint, created_at FROM push_subscriptions').all();
  const { results: reminderList } = await db.prepare('SELECT * FROM reminders').all();
  await db.prepare('CREATE TABLE IF NOT EXISTS notification_log (reminder_type TEXT PRIMARY KEY, last_notified_at TEXT NOT NULL)').run();
  const { results: logs } = await db.prepare('SELECT * FROM notification_log').all();
  const lastFeed = await db.prepare('SELECT time FROM feeds ORDER BY time DESC LIMIT 1').first();
  const now = new Date().toISOString();
  return c.json({ now, subscriptions: subs?.length || 0, subscription_details: subs, reminders: reminderList, notification_log: logs, last_feed: lastFeed });
});

// GET /api/push/vapid-key
pushRoutes.get('/vapid-key', async (c) => {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || '' });
});
