// Todo reminders: one push at 10:00 Hong Kong time on each of the 3 days before
// a todo's date, and on the day itself if it is due after 10:00.
import { ensureTodoSchema } from '../routes/todo';

const HK_OFFSET_MS = 8 * 60 * 60 * 1000;
/** Local hour the reminders go out. The cron runs every 5 minutes, so any tick in this hour sends. */
export const TODO_REMINDER_HOUR = 10;
/** Days before the due date on which to remind (0 = the due day itself). */
export const TODO_REMINDER_DAYS = [3, 2, 1, 0];

export interface TodoPush {
  title: string;
  body: string;
  tag: string;
  data: Record<string, unknown>;
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDateZh(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}月${d}日`;
}

/** The push text for a todo that is `daysLeft` days away. */
export function todoMessage(todo: { title: string; due_date: string; due_time: string }, daysLeft: number): string {
  const when = daysLeft === 0 ? `今日 ${todo.due_time}`
    : daysLeft === 1 ? `明天 ${fmtDateZh(todo.due_date)} ${todo.due_time}`
    : `${daysLeft} 日後 ${fmtDateZh(todo.due_date)} ${todo.due_time}`;
  return `${todo.title}：${when}`;
}

/**
 * Send today's todo reminders through `send`. Returns how many were sent.
 * Each todo is pushed at most once per local day (tracked in notification_log),
 * so later cron ticks within the 10 o'clock hour do not repeat it.
 */
export async function checkTodoReminders(
  db: D1Database, now: number, send: (payload: TodoPush) => Promise<void>
): Promise<number> {
  const hkNow = new Date(now + HK_OFFSET_MS);
  if (hkNow.getUTCHours() !== TODO_REMINDER_HOUR) return 0;
  const today = hkNow.toISOString().slice(0, 10);
  const reminderTime = String(TODO_REMINDER_HOUR).padStart(2, '0') + ':00';
  const lastDay = addDays(today, Math.max(...TODO_REMINDER_DAYS));

  await ensureTodoSchema(db);
  await db.prepare('CREATE TABLE IF NOT EXISTS notification_log (reminder_type TEXT PRIMARY KEY, last_notified_at TEXT NOT NULL)').run();

  const { results } = await db.prepare(`
    SELECT id, title, due_date, due_time FROM todos
    WHERE done = 0 AND due_date >= ? AND due_date <= ?
    ORDER BY due_date ASC, due_time ASC, id ASC
  `).bind(today, lastDay).all();

  let sent = 0;
  for (const row of results || []) {
    const todo = row as { id: number; title: string; due_date: string; due_time: string };
    const daysLeft = Math.round(
      (new Date(todo.due_date + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000
    );
    if (!TODO_REMINDER_DAYS.includes(daysLeft)) continue;
    // On the day itself, only remind if the todo is still ahead of us.
    if (daysLeft === 0 && todo.due_time <= reminderTime) continue;

    const key = `todo:${todo.id}:${today}`;
    const log = await db.prepare('SELECT 1 FROM notification_log WHERE reminder_type = ?').bind(key).first();
    if (log) continue;

    await send({
      title: '待辦提醒',
      body: todoMessage(todo, daysLeft),
      tag: `todo-${todo.id}`,
      data: { type: 'todo', todoId: todo.id, url: '/#todo' },
    });
    await db.prepare(
      "INSERT OR REPLACE INTO notification_log (reminder_type, last_notified_at) VALUES (?, datetime('now'))"
    ).bind(key).run();
    sent++;
  }
  return sent;
}
