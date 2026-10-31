import { Hono } from 'hono';
import type { Bindings } from '../index';
import { ensureDoctorNoteSchema } from '../lib/doctor-note-schema';
import { nextReminderAt } from '../lib/doctor-note-reminders';

export const doctorNoteRoutes = new Hono<{ Bindings: Bindings }>();

const MAX_DURATION_MIN = 7 * 24 * 60;

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const day = new Date(value.slice(0, 10) + 'T00:00:00.000Z');
  if (day.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  return new Date(ms).toISOString();
}

function body(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validateNote(b: Record<string, unknown>) {
  const time = timestamp(b.time);
  // Allow small clock skew between phone and server.
  if (!time || Date.parse(time) > Date.now() + 5 * 60000) return null;
  if (typeof b.content !== 'string' || !b.content.trim() || b.content.length > 2000) return null;
  return { time, content: b.content.trim() };
}

/** Returns undefined for invalid input, null for "no reminder". */
function validateReminder(b: Record<string, unknown>) {
  const iv = b.interval_minutes, dur = b.duration_minutes;
  if (iv == null) return null;
  if (!Number.isInteger(iv) || (iv as number) < 5 || (iv as number) > 1440) return undefined;
  if (!Number.isInteger(dur) || (dur as number) < (iv as number) || (dur as number) > MAX_DURATION_MIN) return undefined;
  const from = Date.now();
  return {
    interval_minutes: iv as number,
    remind_from: new Date(from).toISOString(),
    remind_until: new Date(from + (dur as number) * 60000).toISOString(),
  };
}

function present(row: Record<string, unknown>, now = Date.now()) {
  const next = nextReminderAt(row as any, now);
  return { ...row, next_reminder_at: next, reminder_active: next !== null };
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const NOTE_ERROR = '請輸入醫生指示內容（最多 2000 字）及有效時間';
const REMINDER_ERROR = '提醒間隔需為 5 分鐘至 24 小時，持續時間不可短於間隔或超過 7 日';

doctorNoteRoutes.use('*', async (c, next) => {
  await ensureDoctorNoteSchema(c.env.DB);
  await next();
});

// GET /api/doctornotes            → latest notes (newest first)
// GET /api/doctornotes?active=1   → only notes with a pending reminder
doctorNoteRoutes.get('/', async (c) => {
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit')) || 100));
  const rows = await c.env.DB.prepare('SELECT * FROM doctor_notes ORDER BY time DESC, id DESC LIMIT ?').bind(limit).all();
  const now = Date.now();
  let notes = (rows.results ?? []).map((r) => present(r, now));
  if (c.req.query('active') === '1') {
    const active = await c.env.DB.prepare('SELECT * FROM doctor_notes WHERE interval_minutes IS NOT NULL AND remind_until > ? ORDER BY remind_until ASC')
      .bind(new Date(now).toISOString()).all();
    notes = (active.results ?? []).map((r) => present(r, now)).filter((n) => n.reminder_active);
  }
  return c.json(notes);
});

doctorNoteRoutes.post('/', async (c) => {
  const b = body(await c.req.json().catch(() => null));
  const note = b && validateNote(b);
  if (!note) return c.json({ error: NOTE_ERROR }, 400);
  const reminder = validateReminder(b);
  if (reminder === undefined) return c.json({ error: REMINDER_ERROR }, 400);
  const r = reminder ?? { interval_minutes: null, remind_from: null, remind_until: null };
  const result = await c.env.DB.prepare('INSERT INTO doctor_notes (time, content, interval_minutes, remind_from, remind_until) VALUES (?, ?, ?, ?, ?)')
    .bind(note.time, note.content, r.interval_minutes, r.remind_from, r.remind_until).run();
  return c.json(present({ id: result.meta.last_row_id, ...note, ...r, last_reminded_at: null }), 201);
});

// Edits text/time only, so fixing a typo never shifts the reminder schedule.
doctorNoteRoutes.put('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: '記錄編號無效' }, 400);
  const b = body(await c.req.json().catch(() => null));
  const note = b && validateNote(b);
  if (!note) return c.json({ error: NOTE_ERROR }, 400);
  const result = await c.env.DB.prepare('UPDATE doctor_notes SET time = ?, content = ? WHERE id = ?').bind(note.time, note.content, id).run();
  if (!result.meta.changes) return c.json({ error: '找不到醫生指示' }, 404);
  const row = await c.env.DB.prepare('SELECT * FROM doctor_notes WHERE id = ?').bind(id).first();
  return c.json(present(row!));
});

// (Re)start the repeating reminder from now — also used for "重新計時" after a reading is taken.
doctorNoteRoutes.put('/:id/reminder', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: '記錄編號無效' }, 400);
  const b = body(await c.req.json().catch(() => null));
  const reminder = b && validateReminder(b);
  if (!reminder) return c.json({ error: REMINDER_ERROR }, 400);
  const result = await c.env.DB.prepare('UPDATE doctor_notes SET interval_minutes = ?, remind_from = ?, remind_until = ?, last_reminded_at = NULL WHERE id = ?')
    .bind(reminder.interval_minutes, reminder.remind_from, reminder.remind_until, id).run();
  if (!result.meta.changes) return c.json({ error: '找不到醫生指示' }, 404);
  const row = await c.env.DB.prepare('SELECT * FROM doctor_notes WHERE id = ?').bind(id).first();
  return c.json(present(row!));
});

// Stop reminding but keep the interval for history.
doctorNoteRoutes.delete('/:id/reminder', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: '記錄編號無效' }, 400);
  const now = new Date().toISOString();
  const result = await c.env.DB.prepare('UPDATE doctor_notes SET remind_until = CASE WHEN remind_until > ? THEN ? ELSE remind_until END WHERE id = ?')
    .bind(now, now, id).run();
  if (!result.meta.changes) return c.json({ error: '找不到醫生指示' }, 404);
  const row = await c.env.DB.prepare('SELECT * FROM doctor_notes WHERE id = ?').bind(id).first();
  return c.json(present(row!));
});

doctorNoteRoutes.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: '記錄編號無效' }, 400);
  const result = await c.env.DB.prepare('DELETE FROM doctor_notes WHERE id = ?').bind(id).run();
  if (!result.meta.changes) return c.json({ error: '找不到醫生指示' }, 404);
  return c.json({ ok: true });
});
