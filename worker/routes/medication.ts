import { Hono } from 'hono';
import type { Bindings } from '../index';

export const medicationRoutes = new Hono<{ Bindings: Bindings }>();

// Ensure table exists on first request
medicationRoutes.use('/*', async (c, next) => {
  const db = c.env.DB;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS medication_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT NOT NULL,
      medication_name TEXT NOT NULL,
      dosage TEXT,
      unit TEXT DEFAULT 'ml',
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await next();
});

// GET /api/medications?date=YYYY-MM-DD or ?from=ISO&to=ISO
medicationRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const from = c.req.query('from');
  const to = c.req.query('to');

  let query: string;
  let binds: string[];

  if (from && to) {
    query = "SELECT * FROM medication_records WHERE time >= ? AND time <= ? ORDER BY time DESC";
    binds = [from, to];
  } else {
    const date = c.req.query('date') || new Date().toISOString().split('T')[0];
    query = "SELECT * FROM medication_records WHERE date(time) = ? ORDER BY time DESC";
    binds = [date];
  }

  const records = await db.prepare(query).bind(...binds).all();
  return c.json(records.results);
});

// POST /api/medications
medicationRoutes.post('/', async (c) => {
  const db = c.env.DB;
  const { time, medication_name, dosage, unit, note } = await c.req.json();
  if (!time || !medication_name) {
    return c.json({ error: 'time and medication_name are required' }, 400);
  }
  const result = await db.prepare(
    'INSERT INTO medication_records (time, medication_name, dosage, unit, note) VALUES (?, ?, ?, ?, ?)'
  ).bind(time, medication_name, dosage || null, unit || 'ml', note || null).run();
  return c.json({ id: result.meta.last_row_id, time, medication_name, dosage, unit, note }, 201);
});

// PUT /api/medications/:id
medicationRoutes.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const { time, medication_name, dosage, unit, note } = await c.req.json();
  if (!time || !medication_name) {
    return c.json({ error: 'time and medication_name are required' }, 400);
  }
  await db.prepare(
    'UPDATE medication_records SET time = ?, medication_name = ?, dosage = ?, unit = ?, note = ? WHERE id = ?'
  ).bind(time, medication_name, dosage || null, unit || 'ml', note || null, id).run();
  const updated = await db.prepare('SELECT * FROM medication_records WHERE id = ?').bind(id).first();
  return c.json(updated);
});

// DELETE /api/medications/:id
medicationRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM medication_records WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
