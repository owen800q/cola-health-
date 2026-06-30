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
  // Videos are uploaded in chunks (big files) — metadata row + chunk rows
  await db.prepare(`CREATE TABLE IF NOT EXISTS milestone_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    milestone_id INTEGER NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    mime TEXT NOT NULL DEFAULT 'video/mp4',
    duration REAL,
    poster TEXT,
    size INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'uploading',
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS milestone_video_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL REFERENCES milestone_videos(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_msvchunk_vid ON milestone_video_chunks(video_id, idx)').run();
  await next();
});

const MAX_PHOTOS = 9;
const MAX_VIDEOS = 5;

// GET /api/milestones — all milestones (newest date first) with photos + ready videos
milestoneRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const milestones = await db.prepare('SELECT * FROM milestones ORDER BY date DESC, id DESC').all();
  const photos = await db.prepare('SELECT id, milestone_id, photo_data, sort_order FROM milestone_photos ORDER BY sort_order ASC, id ASC').all();
  const videos = await db.prepare("SELECT id, milestone_id, mime, duration, poster, sort_order FROM milestone_videos WHERE status = 'ready' ORDER BY sort_order ASC, id ASC").all();

  const photosById: Record<number, any[]> = {};
  for (const p of photos.results) {
    const mid = p.milestone_id as number;
    (photosById[mid] = photosById[mid] || []).push({ id: p.id, dataUrl: p.photo_data });
  }
  const videosById: Record<number, any[]> = {};
  for (const v of videos.results) {
    const mid = v.milestone_id as number;
    (videosById[mid] = videosById[mid] || []).push({
      id: v.id, mime: v.mime, duration: v.duration, poster: v.poster,
      src: `/api/milestones/videos/${v.id}`,
    });
  }

  const result = milestones.results.map((m: any) => ({
    id: m.id,
    name: m.name,
    date: m.date,
    note: m.note,
    place: m.place,
    created_at: m.created_at,
    photos: photosById[m.id] || [],
    videos: videosById[m.id] || [],
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

// ---- Chunked video upload ----

// POST /api/milestones/:id/videos — register a video, returns its id for chunk upload
milestoneRoutes.post('/:id/videos', async (c) => {
  const db = c.env.DB;
  const milestoneId = c.req.param('id');
  const { mime, duration, poster, size, sort_order } = await c.req.json();

  const count = await db.prepare('SELECT COUNT(*) as n FROM milestone_videos WHERE milestone_id = ?')
    .bind(milestoneId).first<{ n: number }>();
  if (count && count.n >= MAX_VIDEOS) {
    return c.json({ error: `最多 ${MAX_VIDEOS} 段影片` }, 400);
  }

  const res = await db.prepare(
    "INSERT INTO milestone_videos (milestone_id, mime, duration, poster, size, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, 'uploading')"
  ).bind(milestoneId, mime || 'video/mp4', duration ?? null, poster || null, size ?? 0, sort_order ?? 0).run();

  return c.json({ id: res.meta.last_row_id }, 201);
});

// POST /api/milestones/videos/:vid/chunks — append one base64 chunk
milestoneRoutes.post('/videos/:vid/chunks', async (c) => {
  const db = c.env.DB;
  const vid = c.req.param('vid');
  const { idx, data } = await c.req.json();
  if (typeof idx !== 'number' || typeof data !== 'string') {
    return c.json({ error: 'idx (number) and data (base64 string) are required' }, 400);
  }
  await db.prepare('INSERT INTO milestone_video_chunks (video_id, idx, data) VALUES (?, ?, ?)')
    .bind(vid, idx, data).run();
  return c.json({ ok: true });
});

// POST /api/milestones/videos/:vid/complete — mark upload finished
milestoneRoutes.post('/videos/:vid/complete', async (c) => {
  const db = c.env.DB;
  const vid = c.req.param('vid');
  await db.prepare("UPDATE milestone_videos SET status = 'ready' WHERE id = ?").bind(vid).run();
  return c.json({ ok: true });
});

// DELETE /api/milestones/videos/:vid — remove a video and its chunks
milestoneRoutes.delete('/videos/:vid', async (c) => {
  const db = c.env.DB;
  const vid = c.req.param('vid');
  await db.prepare('DELETE FROM milestone_video_chunks WHERE video_id = ?').bind(vid).run();
  await db.prepare('DELETE FROM milestone_videos WHERE id = ?').bind(vid).run();
  return c.json({ ok: true });
});

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// GET /api/milestones/videos/:vid — stream the reassembled video (supports Range)
milestoneRoutes.get('/videos/:vid', async (c) => {
  const db = c.env.DB;
  const vid = c.req.param('vid');
  const meta = await db.prepare('SELECT mime FROM milestone_videos WHERE id = ?').bind(vid).first<{ mime: string }>();
  if (!meta) return c.json({ error: 'not found' }, 404);

  const chunks = await db.prepare('SELECT data FROM milestone_video_chunks WHERE video_id = ? ORDER BY idx ASC').bind(vid).all();
  if (!chunks.results.length) return c.json({ error: 'no data' }, 404);

  const parts: Uint8Array[] = [];
  let total = 0;
  for (const ch of chunks.results) {
    const u = b64ToBytes(ch.data as string);
    parts.push(u);
    total += u.length;
  }
  const full = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { full.set(p, off); off += p.length; }

  const mime = meta.mime || 'video/mp4';
  const range = c.req.header('Range');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= total) end = total - 1;
    if (start > end) start = 0;
    const slice = full.subarray(start, end + 1);
    return new Response(slice, {
      status: 206,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(slice.length),
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  }

  return new Response(full, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(total),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
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

// DELETE /api/milestones/:id — delete a milestone and its photos + videos
milestoneRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const vids = await db.prepare('SELECT id FROM milestone_videos WHERE milestone_id = ?').bind(id).all();
  for (const v of vids.results) {
    await db.prepare('DELETE FROM milestone_video_chunks WHERE video_id = ?').bind(v.id).run();
  }
  await db.prepare('DELETE FROM milestone_videos WHERE milestone_id = ?').bind(id).run();
  await db.prepare('DELETE FROM milestone_photos WHERE milestone_id = ?').bind(id).run();
  await db.prepare('DELETE FROM milestones WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
