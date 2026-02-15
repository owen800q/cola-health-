import { Hono } from 'hono';
import type { Bindings } from '../index';

export const feedRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/feeds?date=YYYY-MM-DD or ?from=ISO&to=ISO
feedRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const from = c.req.query('from');
  const to = c.req.query('to');

  let query: string;
  let binds: string[];

  if (from && to) {
    query = "SELECT * FROM feeds WHERE time >= ? AND time <= ? ORDER BY time DESC";
    binds = [from, to];
  } else {
    const date = c.req.query('date') || new Date().toISOString().split('T')[0];
    query = "SELECT * FROM feeds WHERE date(time) = ? ORDER BY time DESC";
    binds = [date];
  }

  const feeds = await db.prepare(query).bind(...binds).all();
  return c.json(feeds.results);
});

// GET /api/feeds/summary?date=YYYY-MM-DD or ?from=ISO&to=ISO
feedRoutes.get('/summary', async (c) => {
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
      COALESCE(SUM(amount_ml), 0) as total_ml,
      COALESCE(ROUND(AVG(amount_ml), 0), 0) as avg_ml,
      MAX(time) as last_feed_time
    FROM feeds WHERE ${whereClause}
  `).bind(...binds).first();
  return c.json(summary);
});

// GET /api/feeds/stats?months=6
feedRoutes.get('/stats', async (c) => {
  const db = c.env.DB;
  const months = parseInt(c.req.query('months') || '6');
  const stats = await db.prepare(`
    SELECT
      strftime('%Y-%m', time) as month,
      COUNT(*) as total_feeds,
      SUM(amount_ml) as total_ml,
      ROUND(AVG(amount_ml), 0) as avg_per_feed,
      ROUND(SUM(amount_ml) * 1.0 / COUNT(DISTINCT date(time)), 0) as avg_daily_ml,
      ROUND(COUNT(*) * 1.0 / COUNT(DISTINCT date(time)), 1) as avg_daily_feeds
    FROM feeds
    WHERE time >= date('now', '-' || ? || ' months')
    GROUP BY strftime('%Y-%m', time)
    ORDER BY month ASC
  `).bind(months).all();
  return c.json(stats.results);
});

// POST /api/feeds
feedRoutes.post('/', async (c) => {
  const db = c.env.DB;
  const { time, amount_ml, note } = await c.req.json();
  if (!time || !amount_ml) {
    return c.json({ error: 'time and amount_ml are required' }, 400);
  }
  const result = await db.prepare(
    'INSERT INTO feeds (time, amount_ml, note) VALUES (?, ?, ?)'
  ).bind(time, amount_ml, note || null).run();
  return c.json({ id: result.meta.last_row_id, time, amount_ml, note }, 201);
});

// DELETE /api/feeds/:id
feedRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM feeds WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
