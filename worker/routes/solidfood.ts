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
    // Introduction schedule (引入表): the plan + progress against it
    db.prepare(`CREATE TABLE IF NOT EXISTS solid_food_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sort_order INTEGER NOT NULL,
      day_label TEXT NOT NULL,
      food_name TEXT NOT NULL,
      category TEXT NOT NULL,
      watch_note TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS solid_food_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL REFERENCES solid_food_schedule(id),
      status TEXT NOT NULL DEFAULT 'pending',
      actual_start_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
  ]);
  // 甘筍 duplicates 紅蘿蔔 — drop it from any previously-seeded database.
  await db.prepare(`DELETE FROM solid_food_progress WHERE schedule_id IN (SELECT id FROM solid_food_schedule WHERE food_name LIKE '甘筍%')`).run();
  await db.prepare(`DELETE FROM solid_food_schedule WHERE food_name LIKE '甘筍%'`).run();
  // Seed the starter plan only when the table is empty, so custom items and
  // deletions made by the user are never re-added.
  const count = await db.prepare('SELECT COUNT(*) AS n FROM solid_food_schedule').first<{ n: number }>();
  if (!count || !count.n) {
    const seed: [number, string, string, string][] = [
      [1, '南瓜泥', 'veg', '過敏、皮膚、大便軟硬'],
      [2, '番薯泥', 'veg', '大便偏橙黃屬正常、有冇出疹'],
      [3, '蘋果泥(蒸熟)', 'fruit', '首個水果、留意肚瀉或便秘'],
      [4, '梨泥', 'fruit', '梨有輕微通便、留意大便次數'],
    ];
    await db.batch(seed.map(([sort, name, cat, note]) =>
      db.prepare('INSERT INTO solid_food_schedule (sort_order, day_label, food_name, category, watch_note) VALUES (?, ?, ?, ?, ?)')
        .bind(sort, scheduleDayLabel(sort - 1), name, cat, note)
    ));
  }
  ensured = true;
}

// Each food gets a 3-day window; labels are derived from list position so they
// renumber automatically when items are added or removed.
function scheduleDayLabel(index: number) {
  return `Day ${index * 3 + 1}–${index * 3 + 3}`;
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

// ===== Introduction schedule (輔食引入表) =====

const SCHEDULE_STATUSES = ['pending', 'trying', 'done', 'reaction'];
const SCHEDULE_CATEGORIES = ['veg', 'fruit', 'other'];

// GET /api/solidfoods/schedule — the plan joined with the latest progress per item
solidFoodRoutes.get('/schedule', async (c) => {
  const db = c.env.DB;
  const rows = await db.prepare(`
    SELECT s.id, s.sort_order, s.food_name, s.category, s.watch_note,
           p.status, p.actual_start_date, p.notes
    FROM solid_food_schedule s
    LEFT JOIN solid_food_progress p
      ON p.id = (SELECT MAX(id) FROM solid_food_progress WHERE schedule_id = s.id)
    ORDER BY s.sort_order ASC, s.id ASC
  `).all();
  return c.json((rows.results || []).map((r: any, i: number) => ({
    id: r.id,
    day_label: scheduleDayLabel(i),
    food_name: r.food_name,
    category: r.category,
    watch_note: r.watch_note,
    status: r.status || 'pending',
    actual_start_date: r.actual_start_date || null,
    notes: r.notes || null,
  })));
});

// POST /api/solidfoods/schedule — add a custom food item (appended at the end)
solidFoodRoutes.post('/schedule', async (c) => {
  const db = c.env.DB;
  const b = await c.req.json();
  const name = (b.food_name || '').trim();
  if (!name) return c.json({ error: 'food_name is required' }, 400);
  const category = SCHEDULE_CATEGORIES.includes(b.category) ? b.category : 'other';
  const max = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM solid_food_schedule').first<{ m: number }>();
  const sort = (max?.m || 0) + 1;
  const result = await db.prepare(
    'INSERT INTO solid_food_schedule (sort_order, day_label, food_name, category, watch_note) VALUES (?, ?, ?, ?, ?)'
  ).bind(sort, scheduleDayLabel(sort - 1), name, category, (b.watch_note || '').trim()).run();
  return c.json({ id: result.meta.last_row_id }, 201);
});

// PUT /api/solidfoods/schedule/:id/progress — upsert progress for one item
solidFoodRoutes.put('/schedule/:id/progress', async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));
  if (!id) return c.json({ error: 'invalid id' }, 400);
  const b = await c.req.json();
  const status = b.status || 'pending';
  if (!SCHEDULE_STATUSES.includes(status)) return c.json({ error: 'invalid status' }, 400);
  const item = await db.prepare('SELECT id FROM solid_food_schedule WHERE id = ?').bind(id).first();
  if (!item) return c.json({ error: 'schedule item not found' }, 404);
  const date = b.actual_start_date || null;
  const notes = (typeof b.notes === 'string' ? b.notes.trim() : '') || null;
  // Manual upsert: the live table may lack a UNIQUE(schedule_id) index, so
  // ON CONFLICT can't be relied on.
  const upd = await db.prepare(
    "UPDATE solid_food_progress SET status = ?, actual_start_date = ?, notes = ?, updated_at = datetime('now') WHERE schedule_id = ?"
  ).bind(status, date, notes, id).run();
  if (!upd.meta.changes) {
    await db.prepare(
      'INSERT INTO solid_food_progress (schedule_id, status, actual_start_date, notes) VALUES (?, ?, ?, ?)'
    ).bind(id, status, date, notes).run();
  }
  return c.json({ ok: true });
});

// DELETE /api/solidfoods/schedule/:id — remove an item and its progress
solidFoodRoutes.delete('/schedule/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM solid_food_progress WHERE schedule_id = ?').bind(id).run();
  await db.prepare('DELETE FROM solid_food_schedule WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
