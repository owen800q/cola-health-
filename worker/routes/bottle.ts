import { Hono } from 'hono';
import type { Bindings } from '../index';

export const bottleRoutes = new Hono<{ Bindings: Bindings }>();

// Ensure tables exist on first use
bottleRoutes.use('*', async (c, next) => {
  const db = c.env.DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS bottle_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS bottle_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER NOT NULL REFERENCES bottle_slots(id) ON DELETE CASCADE,
    photo_data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
  await next();
});

// GET /api/bottles — all slots with their photos
bottleRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const slots = await db.prepare('SELECT * FROM bottle_slots ORDER BY id ASC').all();
  const photos = await db.prepare('SELECT * FROM bottle_photos ORDER BY id ASC').all();

  const photosBySlot: Record<number, any[]> = {};
  for (const p of photos.results) {
    const sid = p.slot_id as number;
    if (!photosBySlot[sid]) photosBySlot[sid] = [];
    photosBySlot[sid].push({ id: p.id, dataUrl: p.photo_data, timestamp: p.created_at });
  }

  const result = slots.results.map((s: any) => ({
    id: s.id,
    name: s.name,
    photos: photosBySlot[s.id] || [],
  }));

  return c.json(result);
});

// POST /api/bottles — create a new slot
bottleRoutes.post('/', async (c) => {
  const db = c.env.DB;
  const { name } = await c.req.json();
  if (!name) return c.json({ error: 'name is required' }, 400);
  const result = await db.prepare(
    'INSERT INTO bottle_slots (name) VALUES (?)'
  ).bind(name).run();
  return c.json({ id: result.meta.last_row_id, name, photos: [] }, 201);
});

// DELETE /api/bottles/:id — delete a slot and its photos
bottleRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM bottle_photos WHERE slot_id = ?').bind(id).run();
  await db.prepare('DELETE FROM bottle_slots WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// POST /api/bottles/:id/photos — add a photo to a slot
bottleRoutes.post('/:id/photos', async (c) => {
  const db = c.env.DB;
  const slotId = c.req.param('id');
  const { photo_data } = await c.req.json();
  if (!photo_data) return c.json({ error: 'photo_data is required' }, 400);
  const result = await db.prepare(
    'INSERT INTO bottle_photos (slot_id, photo_data) VALUES (?, ?)'
  ).bind(slotId, photo_data).run();
  const row = await db.prepare('SELECT * FROM bottle_photos WHERE id = ?').bind(result.meta.last_row_id).first();
  return c.json({ id: row!.id, dataUrl: row!.photo_data, timestamp: row!.created_at }, 201);
});

// DELETE /api/bottles/:slotId/photos/:photoId — delete a specific photo
bottleRoutes.delete('/:slotId/photos/:photoId', async (c) => {
  const db = c.env.DB;
  const photoId = c.req.param('photoId');
  await db.prepare('DELETE FROM bottle_photos WHERE id = ?').bind(photoId).run();
  return c.json({ ok: true });
});
