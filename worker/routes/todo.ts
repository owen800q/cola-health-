import { Hono } from 'hono';
import type { Bindings } from '../index';

export const todoRoutes = new Hono<{ Bindings: Bindings }>();

const invalid = '請輸入有效事項（最多 200 字）、日期及時間（備註最多 2000 字）';

/** Additive migration for existing installations: created on first use, once per database. */
const ready = new WeakMap<D1Database, Promise<void>>();
export function ensureTodoSchema(db: D1Database): Promise<void> {
  let pending = ready.get(db);
  if (!pending) {
    pending = db.batch([
      // due_date / due_time are Hong Kong local time, as the user typed them.
      db.prepare(`CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        due_date TEXT NOT NULL,
        due_time TEXT NOT NULL,
        note TEXT,
        done INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_todos_due ON todos(done, due_date, due_time)'),
    ]).then(() => {}).catch((error) => {
      ready.delete(db);
      throw error;
    });
    ready.set(db, pending);
  }
  return pending;
}

function day(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return value;
}

function time(value: unknown): string | null {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return value;
}

function validate(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > 200) return null;
  const dueDate = day(b.due_date);
  const dueTime = time(b.due_time);
  if (!dueDate || !dueTime) return null;
  if (b.note != null && (typeof b.note !== 'string' || b.note.length > 2000)) return null;
  if (b.done != null && typeof b.done !== 'boolean') return null;
  return {
    title: b.title.trim(),
    due_date: dueDate,
    due_time: dueTime,
    note: typeof b.note === 'string' ? b.note.trim() || null : null,
    done: b.done === true,
  };
}

function mapRow(r: any) {
  return { id: r.id, title: r.title, due_date: r.due_date, due_time: r.due_time, note: r.note, done: !!r.done };
}

function recordId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

todoRoutes.use('*', async (c, next) => {
  await ensureTodoSchema(c.env.DB);
  await next();
});

// Open items first, soonest first; finished items after, most recent first.
todoRoutes.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT * FROM todos
    ORDER BY done ASC,
      CASE WHEN done = 0 THEN due_date || ' ' || due_time END ASC,
      CASE WHEN done = 1 THEN due_date || ' ' || due_time END DESC,
      id DESC
  `).all();
  return c.json((rows.results || []).map(mapRow));
});

todoRoutes.post('/', async (c) => {
  const data = validate(await c.req.json().catch(() => null));
  if (!data) return c.json({ error: invalid }, 400);
  const result = await c.env.DB.prepare(
    'INSERT INTO todos (title, due_date, due_time, note, done) VALUES (?, ?, ?, ?, ?)'
  ).bind(data.title, data.due_date, data.due_time, data.note, data.done ? 1 : 0).run();
  return c.json({ id: result.meta.last_row_id, ...data }, 201);
});

todoRoutes.put('/:id', async (c) => {
  const id = recordId(c.req.param('id'));
  if (!id) return c.json({ error: '記錄編號無效' }, 400);
  const data = validate(await c.req.json().catch(() => null));
  if (!data) return c.json({ error: invalid }, 400);
  const result = await c.env.DB.prepare(
    'UPDATE todos SET title = ?, due_date = ?, due_time = ?, note = ?, done = ? WHERE id = ?'
  ).bind(data.title, data.due_date, data.due_time, data.note, data.done ? 1 : 0, id).run();
  if (!result.meta.changes) return c.json({ error: '找不到待辦事項' }, 404);
  return c.json({ id, ...data });
});

todoRoutes.delete('/:id', async (c) => {
  const id = recordId(c.req.param('id'));
  if (!id) return c.json({ error: '記錄編號無效' }, 400);
  const result = await c.env.DB.prepare('DELETE FROM todos WHERE id = ?').bind(id).run();
  if (!result.meta.changes) return c.json({ error: '找不到待辦事項' }, 404);
  return c.json({ ok: true });
});
