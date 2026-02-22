import { Hono } from 'hono';
import type { Bindings } from '../index';

export const growthRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/growth
growthRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const records = await db.prepare('SELECT * FROM growth ORDER BY date DESC').all();
  return c.json(records.results);
});

// GET /api/growth/latest
growthRoutes.get('/latest', async (c) => {
  const db = c.env.DB;
  const latest = await db.prepare('SELECT * FROM growth ORDER BY date DESC LIMIT 1').first();
  return c.json(latest || null);
});

// POST /api/growth
growthRoutes.post('/', async (c) => {
  const db = c.env.DB;
  const { date, weight, height, head_circumference, note } = await c.req.json();
  if (!date) {
    return c.json({ error: 'date is required' }, 400);
  }
  const result = await db.prepare(
    'INSERT INTO growth (date, weight, height, head_circumference, note) VALUES (?, ?, ?, ?, ?)'
  ).bind(date, weight || null, height || null, head_circumference || null, note || null).run();
  return c.json({ id: result.meta.last_row_id }, 201);
});
