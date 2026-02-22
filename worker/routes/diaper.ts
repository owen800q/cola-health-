import { Hono } from 'hono';
import type { Bindings } from '../index';

export const diaperRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/diapers?date=YYYY-MM-DD or ?from=ISO&to=ISO
diaperRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const from = c.req.query('from');
  const to = c.req.query('to');

  let query: string;
  let binds: string[];

  if (from && to) {
    query = "SELECT * FROM diapers WHERE time >= ? AND time <= ? ORDER BY time DESC";
    binds = [from, to];
  } else {
    const date = c.req.query('date') || new Date().toISOString().split('T')[0];
    query = "SELECT * FROM diapers WHERE date(time) = ? ORDER BY time DESC";
    binds = [date];
  }

  const diapers = await db.prepare(query).bind(...binds).all();
  return c.json(diapers.results);
});

// GET /api/diapers/summary?date=YYYY-MM-DD or ?from=ISO&to=ISO
diaperRoutes.get('/summary', async (c) => {
  const db = c.env.DB;
  const from = c.req.query('from');
  const to = c.req.query('to');

  let whereClause: string;
  let binds: string[];

  if (from && to) {
    whereClause = "time >= ? AND time <= ?";
    binds = [from, to];
  } else {
    const date = c.req.query('date') || new Date().toISOString().split('T')[0];
    whereClause = "date(time) = ?";
    binds = [date];
  }

  const summary = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN type IN ('pee','both') THEN 1 ELSE 0 END) as pee_count,
      SUM(CASE WHEN type IN ('poo','both') THEN 1 ELSE 0 END) as poo_count,
      MAX(time) as last_change_time
    FROM diapers WHERE ${whereClause}
  `).bind(...binds).first();
  return c.json(summary);
});

// GET /api/diapers/stats?months=6
diaperRoutes.get('/stats', async (c) => {
  const db = c.env.DB;
  const months = parseInt(c.req.query('months') || '6');
  const stats = await db.prepare(`
    SELECT
      strftime('%Y-%m', time) as month,
      COUNT(*) as total_changes,
      SUM(CASE WHEN type IN ('pee','both') THEN 1 ELSE 0 END) as pee_count,
      SUM(CASE WHEN type IN ('poo','both') THEN 1 ELSE 0 END) as poo_count,
      ROUND(COUNT(*) * 1.0 / COUNT(DISTINCT date(time)), 1) as avg_daily
    FROM diapers
    WHERE time >= date('now', '-' || ? || ' months')
    GROUP BY strftime('%Y-%m', time)
    ORDER BY month ASC
  `).bind(months).all();
  return c.json(stats.results);
});

// POST /api/diapers
diaperRoutes.post('/', async (c) => {
  const db = c.env.DB;
  const { time, type, color, texture, amount, note } = await c.req.json();
  if (!time || !type) {
    return c.json({ error: 'time and type are required' }, 400);
  }
  const result = await db.prepare(
    'INSERT INTO diapers (time, type, color, texture, amount, note) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(time, type, color || null, texture || null, amount || null, note || null).run();
  return c.json({ id: result.meta.last_row_id, time, type }, 201);
});

// PUT /api/diapers/:id
diaperRoutes.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const { time, type, color, texture, amount, note } = await c.req.json();
  if (!time || !type) {
    return c.json({ error: 'time and type are required' }, 400);
  }
  await db.prepare(
    'UPDATE diapers SET time = ?, type = ?, color = ?, texture = ?, amount = ?, note = ? WHERE id = ?'
  ).bind(time, type, color || null, texture || null, amount || null, note || null, id).run();
  const updated = await db.prepare('SELECT * FROM diapers WHERE id = ?').bind(id).first();
  return c.json(updated);
});

// DELETE /api/diapers/:id
diaperRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM diapers WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
