import { Hono } from 'hono';
import type { Bindings } from '../index';

export const milestoneRoutes = new Hono<{ Bindings: Bindings }>();

// Ensure tables exist on first use (mirrors the bottle-assembly pattern)
milestoneRoutes.use('*', async (c, next) => {
  const db = c.env.DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    note TEXT,
    place TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS milestone_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    milestone_id INTEGER NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    photo_data TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
  await next();
});

const MAX_PHOTOS = 9;

// GET /api/milestones — all milestones (newest date first) with their photos
milestoneRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const milestones = await db.prepare('SELECT * FROM milestones ORDER BY date DESC, id DESC').all();
  const photos = await db.prepare('SELECT * FROM milestone_photos ORDER BY sort_order ASC, id ASC').all();

  const photosById: Record<number, any[]> = {};
  for (const p of photos.results) {
    const mid = p.milestone_id as number;
    if (!photosById[mid]) photosById[mid] = [];
    photosById[mid].push({ id: p.id, dataUrl: p.photo_data });
  }

  const result = milestones.results.map((m: any) => ({
    id: m.id,
    name: m.name,
    date: m.date,
    note: m.note,
    place: m.place,
    created_at: m.created_at,
    photos: photosById[m.id] || [],
  }));

  return c.json(result);
});

// POST /api/milestones — create a milestone (with optional photos array of data URLs)
milestoneRoutes.post('/', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const { name, date, note, place, photos } = body;

  if (!name || !date) {
    return c.json({ error: 'name and date are required' }, 400);
  }

  const res = await db.prepare(
    'INSERT INTO milestones (name, date, note, place) VALUES (?, ?, ?, ?)'
  ).bind(name, date, note || null, place || null).run();
  const id = res.meta.last_row_id as number;

  const saved: any[] = [];
  if (Array.isArray(photos) && photos.length) {
    const list = photos.slice(0, MAX_PHOTOS);
    const stmt = db.prepare('INSERT INTO milestone_photos (milestone_id, photo_data, sort_order) VALUES (?, ?, ?)');
    await db.batch(list.map((p: string, i: number) => stmt.bind(id, p, i)));
    const rows = await db.prepare('SELECT * FROM milestone_photos WHERE milestone_id = ? ORDER BY sort_order ASC, id ASC').bind(id).all();
    for (const r of rows.results) saved.push({ id: r.id, dataUrl: r.photo_data });
  }

  return c.json({ id, name, date, note: note || null, place: place || null, photos: saved }, 201);
});

// PUT /api/milestones/:id — update text fields
milestoneRoutes.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const { name, date, note, place } = await c.req.json();

  await db.prepare(`
    UPDATE milestones SET
      name = COALESCE(?, name),
      date = COALESCE(?, date),
      note = ?,
      place = ?
    WHERE id = ?
  `).bind(name ?? null, date ?? null, note ?? null, place ?? null, id).run();

  const row = await db.prepare('SELECT * FROM milestones WHERE id = ?').bind(id).first();
  return c.json(row || { ok: true });
});

// DELETE /api/milestones/:id — delete a milestone and its photos
milestoneRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM milestone_photos WHERE milestone_id = ?').bind(id).run();
  await db.prepare('DELETE FROM milestones WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
