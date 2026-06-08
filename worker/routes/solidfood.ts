import { Hono } from 'hono';
import type { Bindings } from '../index';

export const solidFoodRoutes = new Hono<{ Bindings: Bindings }>();

/**
 * Runtime auto-migration.
 * The 輔食 table is created on first use with CREATE TABLE IF NOT EXISTS, so the
 * feature works on the deployed Worker without anyone running a CLI migration.
 * Guarded by a module-level flag so it only runs once per isolate (idempotent
 * and safe under concurrency either way).
 */
let ensured = false;
async function ensureSchema(db: D1Database) {
  if (ensured) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS solid_foods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      texture TEXT,
      first_try INTEGER DEFAULT 0,
      amount TEXT,
      reaction TEXT,
      abnormal INTEGER DEFAULT 0,
      symptoms TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_solid_foods_time ON solid_foods(time DESC)`),
  ]);
  ensured = true;
}

solidFoodRoutes.use('*', async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

// Map a DB row to the client shape (booleans + parsed symptoms array)
function mapRow(r: any) {
  return {
    id: r.id,
    time: r.time,
    name: r.name,
    category: r.category,
    texture: r.texture,
    first: !!r.first_try,
    amount: r.amount,
    reaction: r.reaction,
    abnormal: !!r.abnormal,
    symptoms: r.symptoms ? JSON.parse(r.symptoms) : [],
    note: r.note,
  };
}

// GET /api/solidfoods?date=YYYY-MM-DD or ?from=ISO&to=ISO
solidFoodRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const from = c.req.query('from');
  const to = c.req.query('to');

  let query: string;
  let binds: string[];

  if (from && to) {
    query = "SELECT * FROM solid_foods WHERE time >= ? AND time <= ? ORDER BY time DESC";
    binds = [from, to];
  } else {
    const date = c.req.query('date') || new Date().toISOString().split('T')[0];
    query = "SELECT * FROM solid_foods WHERE date(time) = ? ORDER BY time DESC";
    binds = [date];
  }

  const rows = await db.prepare(query).bind(...binds).all();
  return c.json((rows.results || []).map(mapRow));
});

// GET /api/solidfoods/foods — derived introduced-food list (allergy tracker).
// One source of truth: grouped from the records, with the 3-day observation status computed.
solidFoodRoutes.get('/foods', async (c) => {
  const db = c.env.DB;
  const rows = await db.prepare("SELECT * FROM solid_foods ORDER BY time ASC").all();

  const todayMs = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const monthDay = (iso: string) => {
    const [, m, d] = iso.slice(0, 10).split('-');
    return parseInt(m) + '月' + parseInt(d) + '日';
  };

  const map = new Map<string, any>();
  for (const r of (rows.results || []) as any[]) {
    let f = map.get(r.name);
    if (!f) {
      f = { name: r.name, category: r.category, sinceISO: r.time, abnormal: false, firstTry: false, reaction: '' };
      map.set(r.name, f);
    }
    if (r.first_try) f.firstTry = true;
    if (r.abnormal) {
      f.abnormal = true;
      const syms = r.symptoms ? JSON.parse(r.symptoms) : [];
      if (syms.length && !f.reaction) f.reaction = syms[0];
    }
  }

  const arr = Array.from(map.values());
  arr.sort((a, b) => (a.sinceISO < b.sinceISO ? 1 : -1)); // most recently introduced first
  const list = arr.map((f) => {
    const startMs = Date.parse(f.sinceISO.slice(0, 10) + 'T00:00:00Z');
    const diff = Math.max(0, Math.floor((todayMs - startMs) / 86400000)); // 0 = same day
    // alert if it ever caused a reaction; watch while a newly-introduced food is in its
    // 3-day observation window; otherwise it's an established (safe) food.
    const status = f.abnormal ? 'alert' : (f.firstTry && diff <= 2 ? 'watch' : 'safe');
    return { name: f.name, category: f.category, since: monthDay(f.sinceISO), status, day: diff + 1, reaction: f.reaction };
  });
  return c.json(list);
});

// POST /api/solidfoods
solidFoodRoutes.post('/', async (c) => {
  const db = c.env.DB;
  const b = await c.req.json();
  if (!b.time || !b.name) {
    return c.json({ error: 'time and name are required' }, 400);
  }
  const result = await db.prepare(
    'INSERT INTO solid_foods (time, name, category, texture, first_try, amount, reaction, abnormal, symptoms, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    b.time, b.name, b.category || null, b.texture || null, b.first ? 1 : 0,
    b.amount || null, b.reaction || null, b.abnormal ? 1 : 0,
    JSON.stringify(b.symptoms || []), b.note || null
  ).run();
  return c.json({ id: result.meta.last_row_id }, 201);
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
    'UPDATE solid_foods SET time = ?, name = ?, category = ?, texture = ?, first_try = ?, amount = ?, reaction = ?, abnormal = ?, symptoms = ?, note = ? WHERE id = ?'
  ).bind(
    b.time, b.name, b.category || null, b.texture || null, b.first ? 1 : 0,
    b.amount || null, b.reaction || null, b.abnormal ? 1 : 0,
    JSON.stringify(b.symptoms || []), b.note || null, id
  ).run();
  const updated = await db.prepare('SELECT * FROM solid_foods WHERE id = ?').bind(id).first();
  return c.json(updated ? mapRow(updated) : { ok: true });
});

// DELETE /api/solidfoods/:id
solidFoodRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM solid_foods WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
