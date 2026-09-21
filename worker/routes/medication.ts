import { Hono } from 'hono';
import type { Bindings } from '../index';
import { ensureMedicationSchema } from '../lib/medication-schema';

export const medicationRoutes = new Hono<{ Bindings: Bindings }>();
const units = new Set(['ml', 'mg', 'g', '滴', '粒', '包', '次']);

// Require an explicit timezone and normalize timestamps for SQLite range queries.
function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const day = new Date(value.slice(0, 10) + 'T00:00:00.000Z');
  if (day.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  return new Date(ms).toISOString();
}

function validate(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const time = timestamp(b.time);
  if (!time || Date.parse(time) > Date.now()) return null;
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.trim().length > 200) return null;
  if (typeof b.dose !== 'number' || !Number.isFinite(b.dose) || b.dose <= 0) return null;
  if (typeof b.unit !== 'string' || !units.has(b.unit)) return null;
  if (b.note != null && (typeof b.note !== 'string' || b.note.length > 2000)) return null;
  return { time, name: b.name.trim(), dose: b.dose, unit: b.unit, note: typeof b.note === 'string' ? b.note.trim() || null : null };
}

medicationRoutes.use('*', async (c, next) => {
  await ensureMedicationSchema(c.env.DB);
  await next();
});

medicationRoutes.get('/', async (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  let where: string;
  let binds: string[];
  if (from !== undefined || to !== undefined) {
    const start = timestamp(from), end = timestamp(to);
    if (!start || !end || start > end) return c.json({ error: '日期範圍無效' }, 400);
    where = 'time >= ? AND time <= ?';
    binds = [start, end];
  } else {
    const date = c.req.query('date') ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !timestamp(date + 'T00:00:00Z')) return c.json({ error: '日期無效' }, 400);
    where = 'date(time) = ?';
    binds = [date];
  }
  const rows = await c.env.DB.prepare(`SELECT * FROM medications WHERE ${where} ORDER BY time DESC, id DESC`).bind(...binds).all();
  return c.json(rows.results);
});

medicationRoutes.post('/', async (c) => {
  const data = validate(await c.req.json().catch(() => null));
  if (!data) return c.json({ error: '請輸入有效藥名、份量、單位及已服藥時間（備註最多 2000 字）' }, 400);
  const result = await c.env.DB.prepare('INSERT INTO medications (time, name, dose, unit, note) VALUES (?, ?, ?, ?, ?)')
    .bind(data.time, data.name, data.dose, data.unit, data.note).run();
  return c.json({ id: result.meta.last_row_id, ...data }, 201);
});

medicationRoutes.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isSafeInteger(id) || id <= 0) return c.json({ error: '記錄編號無效' }, 400);
  const data = validate(await c.req.json().catch(() => null));
  if (!data) return c.json({ error: '請輸入有效藥名、份量、單位及已服藥時間（備註最多 2000 字）' }, 400);
  const result = await c.env.DB.prepare('UPDATE medications SET time = ?, name = ?, dose = ?, unit = ?, note = ? WHERE id = ?')
    .bind(data.time, data.name, data.dose, data.unit, data.note, id).run();
  if (!result.meta.changes) return c.json({ error: '找不到食藥記錄' }, 404);
  return c.json({ id, ...data });
});

medicationRoutes.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isSafeInteger(id) || id <= 0) return c.json({ error: '記錄編號無效' }, 400);
  const result = await c.env.DB.prepare('DELETE FROM medications WHERE id = ?').bind(id).run();
  if (!result.meta.changes) return c.json({ error: '找不到食藥記錄' }, 404);
  return c.json({ ok: true });
});
