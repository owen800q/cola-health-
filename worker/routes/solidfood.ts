import { Hono } from 'hono';
import type { Bindings } from '../index';

export const solidFoodRoutes = new Hono<{ Bindings: Bindings }>();

// Normalize the symptoms field to a JSON string for storage
function packSymptoms(symptoms: unknown): string | null {
  if (Array.isArray(symptoms)) return symptoms.length ? JSON.stringify(symptoms) : null;
  if (typeof symptoms === 'string' && symptoms.trim()) return symptoms;
  return null;
}

// GET /api/solidfoods?date=YYYY-MM-DD or ?from=ISO&to=ISO
solidFoodRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const from = c.req.query('from');
  const to = c.req.query('to');

  let query: string;
  let binds: string[];

  if (from && to) {
    query = 'SELECT * FROM solid_foods WHERE time >= ? AND time <= ? ORDER BY time DESC';
    binds = [from, to];
  } else {
    const date = c.req.query('date') || new Date().toISOString().split('T')[0];
    query = 'SELECT * FROM solid_foods WHERE date(time) = ? ORDER BY time DESC';
    binds = [date];
  }

  const rows = await db.prepare(query).bind(...binds).all();
  return c.json(rows.results);
});

// GET /api/solidfoods/foods — introduced-food log with derived allergy status.
// safe  = past the 3-day observation window with no abnormal reaction
// watch = still inside the 3-day observation window
// alert = ever had an abnormal reaction
solidFoodRoutes.get('/foods', async (c) => {
  const db = c.env.DB;
  const rows = await db.prepare(`
    SELECT
      name,
      MIN(category) as category,
      MIN(time) as first_time,
      MAX(CASE WHEN abnormal = 1 THEN 1 ELSE 0 END) as ever_abnormal,
      CAST(julianday(date('now')) - julianday(date(MIN(time))) AS INTEGER) as days_since
    FROM solid_foods
    GROUP BY name
    ORDER BY first_time DESC
  `).all();

  const foods = [];
  for (const r of rows.results as any[]) {
    let status = 'safe';
    let day = 0;
    let reaction = '';

    if (r.ever_abnormal) {
      status = 'alert';
      // surface the first recorded symptom for this food
      const sym = await db.prepare(
        "SELECT symptoms FROM solid_foods WHERE name = ? AND abnormal = 1 AND symptoms IS NOT NULL AND symptoms != '' ORDER BY time ASC LIMIT 1"
      ).bind(r.name).first<any>();
      if (sym && sym.symptoms) {
        try { reaction = JSON.parse(sym.symptoms)[0] || ''; } catch { reaction = ''; }
      }
    } else {
      const dayIndex = (r.days_since || 0) + 1; // 1-based: introduced today = day 1
      if (dayIndex <= 3) { status = 'watch'; day = dayIndex; }
    }

    foods.push({ name: r.name, category: r.category, first_time: r.first_time, status, day, reaction });
  }

  return c.json(foods);
});

// POST /api/solidfoods
solidFoodRoutes.post('/', async (c) => {
  const db = c.env.DB;
  const b = await c.req.json();
  if (!b.time || !b.name) {
    return c.json({ error: 'time and name are required' }, 400);
  }
  const result = await db.prepare(
    `INSERT INTO solid_foods (time, name, category, texture, first_try, amount, reaction, abnormal, symptoms, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    b.time,
    b.name,
    b.category || null,
    b.texture || null,
    b.first_try ? 1 : 0,
    b.amount || null,
    b.reaction || null,
    b.abnormal ? 1 : 0,
    packSymptoms(b.symptoms),
    b.note || null,
  ).run();
  return c.json({ id: result.meta.last_row_id, ...b }, 201);
});

// PUT /api/solidfoods/:id
solidFoodRoutes.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const b = await c.req.json();
  if (!b.time || !b.name) {
    return c.json({ error: 'time and name are required' }, 400);
  }
  await db.prepare(
    `UPDATE solid_foods
       SET time = ?, name = ?, category = ?, texture = ?, first_try = ?, amount = ?, reaction = ?, abnormal = ?, symptoms = ?, note = ?
     WHERE id = ?`
  ).bind(
    b.time,
    b.name,
    b.category || null,
    b.texture || null,
    b.first_try ? 1 : 0,
    b.amount || null,
    b.reaction || null,
    b.abnormal ? 1 : 0,
    packSymptoms(b.symptoms),
    b.note || null,
    id,
  ).run();
  const updated = await db.prepare('SELECT * FROM solid_foods WHERE id = ?').bind(id).first();
  return c.json(updated);
});

// DELETE /api/solidfoods/:id
solidFoodRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM solid_foods WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
