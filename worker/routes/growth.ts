import { Hono } from 'hono';
import type { Bindings } from '../index';
import { GROWTH_REF } from '../data/growth-reference';

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

// GET /api/growth/reference?gender=M|F
// Returns WHO 0-5yr growth percentile reference (adopted by HK Dept of Health)
growthRoutes.get('/reference', (c) => {
  const gender = (c.req.query('gender') || 'M').toUpperCase() === 'F' ? 'F' : 'M';
  const src = GROWTH_REF[gender];
  return c.json({
    gender,
    percentiles: GROWTH_REF.percentiles,
    maxMonth: GROWTH_REF.maxMonth,
    weight: src.weight,
    height: src.height,
    source: 'WHO Child Growth Standards (2006) · 香港衞生署家庭健康服務',
  });
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

// PUT /api/growth/:id
growthRoutes.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const { date, weight, height, head_circumference, note } = await c.req.json();
  if (!date) {
    return c.json({ error: 'date is required' }, 400);
  }
  await db.prepare(
    'UPDATE growth SET date = ?, weight = ?, height = ?, head_circumference = ?, note = ? WHERE id = ?'
  ).bind(date, weight || null, height || null, head_circumference || null, note || null, id).run();
  return c.json({ ok: true });
});

// DELETE /api/growth/:id
growthRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM growth WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
