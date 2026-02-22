import { Hono } from 'hono';
import type { Bindings } from '../index';

export const sleepRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/sleeps?date=YYYY-MM-DD or ?from=ISO&to=ISO
sleepRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const from = c.req.query('from');
  const to = c.req.query('to');

  let query: string;
  let binds: string[];

  if (from && to) {
    query = "SELECT * FROM sleeps WHERE start_time >= ? AND start_time <= ? ORDER BY start_time DESC";
    binds = [from, to];
  } else {
    const date = c.req.query('date') || new Date().toISOString().split('T')[0];
    query = "SELECT * FROM sleeps WHERE date(start_time) = ? ORDER BY start_time DESC";
    binds = [date];
  }

  const sleeps = await db.prepare(query).bind(...binds).all();
  return c.json(sleeps.results);
});

// GET /api/sleeps/summary?date=YYYY-MM-DD or ?from=ISO&to=ISO
sleepRoutes.get('/summary', async (c) => {
  const db = c.env.DB;
  const from = c.req.query('from');
  const to = c.req.query('to');

  let whereClause: string;
  let binds: string[];

  if (from && to) {
    whereClause = "start_time >= ? AND start_time <= ?";
    binds = [from, to];
  } else {
    const date = c.req.query('date') || new Date().toISOString().split('T')[0];
    whereClause = "date(start_time) = ?";
    binds = [date];
  }

  const sleeps = await db.prepare(
    `SELECT * FROM sleeps WHERE ${whereClause} AND end_time IS NOT NULL`
  ).bind(...binds).all();

  let totalMinutes = 0;
  let longestMinutes = 0;
  const count = sleeps.results.length;

  for (const s of sleeps.results as any[]) {
    const start = new Date(s.start_time).getTime();
    const end = new Date(s.end_time).getTime();
    const dur = (end - start) / 60000;
    totalMinutes += dur;
    if (dur > longestMinutes) longestMinutes = dur;
  }

  return c.json({
    count,
    total_hours: Math.round(totalMinutes / 60 * 10) / 10,
    total_minutes: Math.round(totalMinutes),
    longest_minutes: Math.round(longestMinutes),
    longest_hours: Math.round(longestMinutes / 60 * 10) / 10,
  });
});

// GET /api/sleeps/stats?months=6
sleepRoutes.get('/stats', async (c) => {
  const db = c.env.DB;
  const months = parseInt(c.req.query('months') || '6');
  const sleeps = await db.prepare(`
    SELECT * FROM sleeps
    WHERE start_time >= date('now', '-' || ? || ' months')
      AND end_time IS NOT NULL
    ORDER BY start_time ASC
  `).bind(months).all();

  // Group by month
  const monthMap: Record<string, { total_minutes: number; longest: number; count: number; days: Set<string> }> = {};

  for (const s of sleeps.results as any[]) {
    const month = s.start_time.substring(0, 7);
    const day = s.start_time.substring(0, 10);
    if (!monthMap[month]) {
      monthMap[month] = { total_minutes: 0, longest: 0, count: 0, days: new Set() };
    }
    const dur = (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000;
    monthMap[month].total_minutes += dur;
    monthMap[month].count++;
    monthMap[month].days.add(day);
    if (dur > monthMap[month].longest) monthMap[month].longest = dur;
  }

  const stats = Object.entries(monthMap).map(([month, data]) => ({
    month,
    total_hours: Math.round(data.total_minutes / 60 * 10) / 10,
    avg_daily_hours: Math.round(data.total_minutes / 60 / data.days.size * 10) / 10,
    longest_hours: Math.round(data.longest / 60 * 10) / 10,
    count: data.count,
    avg_daily_naps: Math.round(data.count / data.days.size * 10) / 10,
  }));

  return c.json(stats);
});

// GET /api/sleeps/current
sleepRoutes.get('/current', async (c) => {
  const db = c.env.DB;
  const current = await db.prepare(
    'SELECT * FROM sleeps WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1'
  ).first();
  return c.json(current || null);
});

// POST /api/sleeps/start
sleepRoutes.post('/start', async (c) => {
  const db = c.env.DB;
  const { start_time } = await c.req.json();
  const time = start_time || new Date().toISOString();

  // End any active sleep first
  const active = await db.prepare('SELECT id FROM sleeps WHERE end_time IS NULL').first<{ id: number }>();
  if (active) {
    await db.prepare('UPDATE sleeps SET end_time = ? WHERE id = ?').bind(time, active.id).run();
  }

  const result = await db.prepare(
    'INSERT INTO sleeps (start_time) VALUES (?)'
  ).bind(time).run();
  return c.json({ id: result.meta.last_row_id, start_time: time }, 201);
});

// PUT /api/sleeps/:id/end
sleepRoutes.put('/:id/end', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const { end_time, quality, note } = await c.req.json();
  const time = end_time || new Date().toISOString();

  await db.prepare(
    'UPDATE sleeps SET end_time = ?, quality = ?, note = ? WHERE id = ?'
  ).bind(time, quality || null, note || null, id).run();

  const sleep = await db.prepare('SELECT * FROM sleeps WHERE id = ?').bind(id).first();
  return c.json(sleep);
});

// POST /api/sleeps - manual entry
sleepRoutes.post('/', async (c) => {
  const db = c.env.DB;
  const { start_time, end_time, quality, note } = await c.req.json();
  if (!start_time) {
    return c.json({ error: 'start_time is required' }, 400);
  }
  const result = await db.prepare(
    'INSERT INTO sleeps (start_time, end_time, quality, note) VALUES (?, ?, ?, ?)'
  ).bind(start_time, end_time || null, quality || null, note || null).run();
  return c.json({ id: result.meta.last_row_id }, 201);
});

// PUT /api/sleeps/:id
sleepRoutes.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const { start_time, end_time, quality, note } = await c.req.json();
  if (!start_time) {
    return c.json({ error: 'start_time is required' }, 400);
  }
  await db.prepare(
    'UPDATE sleeps SET start_time = ?, end_time = ?, quality = ?, note = ? WHERE id = ?'
  ).bind(start_time, end_time || null, quality || null, note || null, id).run();
  const updated = await db.prepare('SELECT * FROM sleeps WHERE id = ?').bind(id).first();
  return c.json(updated);
});

// DELETE /api/sleeps/:id
sleepRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM sleeps WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
