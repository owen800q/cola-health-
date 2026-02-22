import { Hono } from 'hono';
import type { Bindings } from '../index';

export const vaccineRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/vaccines
vaccineRoutes.get('/', async (c) => {
  const db = c.env.DB;

  // Update overdue status
  await db.prepare(`
    UPDATE vaccines SET status = 'overdue'
    WHERE status = 'pending' AND scheduled_date < date('now')
  `).run();

  const vaccines = await db.prepare(
    'SELECT * FROM vaccines ORDER BY scheduled_date ASC'
  ).all();
  return c.json(vaccines.results);
});

// PUT /api/vaccines/:id
vaccineRoutes.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const { actual_date, status, location, batch_number, side_effects, note } = await c.req.json();

  await db.prepare(`
    UPDATE vaccines SET
      actual_date = COALESCE(?, actual_date),
      status = COALESCE(?, status),
      location = COALESCE(?, location),
      batch_number = COALESCE(?, batch_number),
      side_effects = COALESCE(?, side_effects),
      note = COALESCE(?, note)
    WHERE id = ?
  `).bind(
    actual_date || null,
    status || null,
    location || null,
    batch_number || null,
    side_effects || null,
    note || null,
    id
  ).run();

  const vaccine = await db.prepare('SELECT * FROM vaccines WHERE id = ?').bind(id).first();
  return c.json(vaccine);
});
