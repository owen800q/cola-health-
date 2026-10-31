import { ensureDoctorNoteSchema } from './doctor-note-schema';

/** Cron runs every 5 minutes; allow a reminder to go out slightly early so it lands closer to its slot. */
export const EARLY_TOLERANCE_MS = 2 * 60 * 1000;

export interface ReminderFields {
  interval_minutes: number | null;
  remind_from: string | null;
  remind_until: string | null;
}

/** Next scheduled reminder after `now`, or null when no reminder is pending. */
export function nextReminderAt(note: ReminderFields, now: number): string | null {
  if (!note.interval_minutes || !note.remind_from || !note.remind_until) return null;
  const from = Date.parse(note.remind_from), until = Date.parse(note.remind_until);
  const iv = note.interval_minutes * 60000;
  const next = from + (Math.floor((now - from) / iv) + 1) * iv;
  return next <= until ? new Date(next).toISOString() : null;
}

export interface DueReminder {
  id: number;
  content: string;
  interval_minutes: number;
  slot: number;
  due_at: string;
}

/**
 * Reminders whose latest slot has arrived but has not been sent yet.
 * Missed slots (e.g. cron outage) collapse into one notification for the latest slot.
 */
export async function findDueDoctorReminders(db: D1Database, now: number): Promise<DueReminder[]> {
  await ensureDoctorNoteSchema(db);
  const { results } = await db.prepare(`
    SELECT id, content, interval_minutes, remind_from, remind_until, last_reminded_at FROM doctor_notes
    WHERE interval_minutes IS NOT NULL AND remind_from IS NOT NULL AND remind_until > ?
    ORDER BY id ASC
  `).bind(new Date(now - EARLY_TOLERANCE_MS - 10 * 60000).toISOString()).all();
  const due: DueReminder[] = [];
  for (const row of results ?? []) {
    const from = Date.parse(row.remind_from as string), until = Date.parse(row.remind_until as string);
    const iv = (row.interval_minutes as number) * 60000;
    const slot = Math.floor((now + EARLY_TOLERANCE_MS - from) / iv);
    if (slot < 1) continue;
    const dueAt = from + slot * iv;
    if (dueAt > until) continue;
    const last = row.last_reminded_at ? Date.parse(row.last_reminded_at as string) : 0;
    if (last >= dueAt - EARLY_TOLERANCE_MS) continue;
    due.push({ id: row.id as number, content: row.content as string, interval_minutes: row.interval_minutes as number, slot, due_at: new Date(dueAt).toISOString() });
  }
  return due;
}

export async function markDoctorReminderSent(db: D1Database, id: number, now: number): Promise<void> {
  await db.prepare('UPDATE doctor_notes SET last_reminded_at = ? WHERE id = ?').bind(new Date(now).toISOString(), id).run();
}

export function intervalLabel(minutes: number): string {
  if (minutes % 60 === 0) return minutes === 60 ? '每小時' : `每 ${minutes / 60} 小時`;
  if (minutes === 30) return '每半小時';
  return `每 ${minutes} 分鐘`;
}
