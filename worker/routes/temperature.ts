import { Hono } from 'hono';
import type { Bindings } from '../index';

export const temperatureRoutes = new Hono<{ Bindings: Bindings }>();

// Fever thresholds by measurement method (°C)
const FEVER_THRESHOLDS: Record<string, number> = {
  ear: 38.0,
  forehead: 37.5,
  armpit: 37.3,
  oral: 37.8,
  rectal: 38.0,
};

function isFever(temperature: number, method: string): boolean {
  const threshold = FEVER_THRESHOLDS[method] ?? 38.0;
  return temperature >= threshold;
}

// GET /api/temperatures?date=YYYY-MM-DD or ?from=ISO&to=ISO
temperatureRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const from = c.req.query('from');
  const to = c.req.query('to');

  let query: string;
  let binds: string[];

  if (from && to) {
    query = "SELECT * FROM temperatures WHERE time >= ? AND time <= ? ORDER BY time DESC";
    binds = [from, to];
  } else {
    const date = c.req.query('date') || new Date().toISOString().split('T')[0];
    query = "SELECT * FROM temperatures WHERE date(time) = ? ORDER BY time DESC";
    binds = [date];
  }

  const records = await db.prepare(query).bind(...binds).all();
  return c.json(records.results);
});

// GET /api/temperatures/summary?date=YYYY-MM-DD or ?from=ISO&to=ISO
temperatureRoutes.get('/summary', async (c) => {
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
      COUNT(*) as count,
      COALESCE(ROUND(MAX(temperature), 1), 0) as max_temp,
      COALESCE(ROUND(MIN(temperature), 1), 0) as min_temp,
      COALESCE(ROUND(AVG(temperature), 1), 0) as avg_temp,
      SUM(CASE WHEN fever = 1 THEN 1 ELSE 0 END) as fever_count,
      MAX(time) as last_time
    FROM temperatures WHERE ${whereClause}
  `).bind(...binds).first();
  return c.json(summary);
});

// GET /api/temperatures/stats?months=6
temperatureRoutes.get('/stats', async (c) => {
  const db = c.env.DB;
  const months = parseInt(c.req.query('months') || '6');
  const stats = await db.prepare(`
    SELECT
      strftime('%Y-%m', time) as month,
      COUNT(*) as total_records,
      ROUND(MAX(temperature), 1) as max_temp,
      ROUND(MIN(temperature), 1) as min_temp,
      ROUND(AVG(temperature), 1) as avg_temp,
      SUM(CASE WHEN fever = 1 THEN 1 ELSE 0 END) as fever_count
    FROM temperatures
    WHERE time >= date('now', '-' || ? || ' months')
    GROUP BY strftime('%Y-%m', time)
    ORDER BY month ASC
  `).bind(months).all();
  return c.json(stats.results);
});

// POST /api/temperatures
temperatureRoutes.post('/', async (c) => {
  const db = c.env.DB;
  const { time, temperature, method, note } = await c.req.json();
  if (!time || temperature === undefined || temperature === null) {
    return c.json({ error: 'time and temperature are required' }, 400);
  }
  const m = method || 'ear';
  const fever = isFever(temperature, m) ? 1 : 0;
  const result = await db.prepare(
    'INSERT INTO temperatures (time, temperature, method, fever, note) VALUES (?, ?, ?, ?, ?)'
  ).bind(time, temperature, m, fever, note || null).run();
  return c.json({ id: result.meta.last_row_id, time, temperature, method: m, fever, note }, 201);
});

// PUT /api/temperatures/:id
temperatureRoutes.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const { time, temperature, method, note } = await c.req.json();
  if (!time || temperature === undefined || temperature === null) {
    return c.json({ error: 'time and temperature are required' }, 400);
  }
  const m = method || 'ear';
  const fever = isFever(temperature, m) ? 1 : 0;
  await db.prepare(
    'UPDATE temperatures SET time = ?, temperature = ?, method = ?, fever = ?, note = ? WHERE id = ?'
  ).bind(time, temperature, m, fever, note || null, id).run();
  const updated = await db.prepare('SELECT * FROM temperatures WHERE id = ?').bind(id).first();
  return c.json(updated);
});

// DELETE /api/temperatures/:id
temperatureRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM temperatures WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
