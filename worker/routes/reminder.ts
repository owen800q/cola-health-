import { Hono } from 'hono';
import type { Bindings } from '../index';

export const reminderRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/reminders
reminderRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const reminders = await db.prepare('SELECT * FROM reminders ORDER BY id ASC').all();
  return c.json(reminders.results);
});

// PUT /api/reminders/:id
reminderRoutes.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const { enabled, interval_minutes, advance_days, max_awake_minutes } = await c.req.json();

  await db.prepare(`
    UPDATE reminders SET
      enabled = COALESCE(?, enabled),
      interval_minutes = COALESCE(?, interval_minutes),
      advance_days = COALESCE(?, advance_days),
      max_awake_minutes = COALESCE(?, max_awake_minutes),
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    enabled ?? null,
    interval_minutes ?? null,
    advance_days ?? null,
    max_awake_minutes ?? null,
    id
  ).run();

  const reminder = await db.prepare('SELECT * FROM reminders WHERE id = ?').bind(id).first();
  return c.json(reminder);
});
