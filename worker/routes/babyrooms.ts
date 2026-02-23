import { Hono } from 'hono';
import type { Bindings } from '../index';
import { scrapeAndSync } from '../lib/scraper';

export const babyRoomsRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/babyrooms — search/list baby care rooms
babyRoomsRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const q = c.req.query('q');
  const district = c.req.query('district');
  const region = c.req.query('region');
  const type = c.req.query('type');
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 200);
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (q) {
    conditions.push('(name LIKE ? OR name_en LIKE ? OR address LIKE ?)');
    const like = `%${q}%`;
    binds.push(like, like, like);
  }
  if (district) {
    conditions.push('district = ?');
    binds.push(district);
  }
  if (region) {
    conditions.push('region = ?');
    binds.push(region);
  }
  if (type) {
    conditions.push('type = ?');
    binds.push(type);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const countResult = await db.prepare(
    `SELECT COUNT(*) as total FROM babycare_rooms ${where}`
  ).bind(...binds).first();

  const { results } = await db.prepare(
    `SELECT * FROM babycare_rooms ${where} ORDER BY region, district, name LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all();

  return c.json({
    rooms: results || [],
    total: countResult?.total || 0,
    page,
    limit,
  });
});

// GET /api/babyrooms/districts — distinct districts with counts
babyRoomsRoutes.get('/districts', async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(
    `SELECT district, region, COUNT(*) as count FROM babycare_rooms GROUP BY district, region ORDER BY region, district`
  ).all();
  return c.json(results || []);
});

// GET /api/babyrooms/sync-status — last sync info
babyRoomsRoutes.get('/sync-status', async (c) => {
  const db = c.env.DB;
  const row = await db.prepare(
    `SELECT * FROM data_sync_log WHERE sync_type LIKE 'babyrooms%' ORDER BY id DESC LIMIT 1`
  ).first();
  return c.json(row || { status: 'never' });
});

// POST /api/babyrooms/refresh — trigger manual data refresh
babyRoomsRoutes.post('/refresh', async (c) => {
  const db = c.env.DB;

  // Rate limit: check last sync time
  const lastSync = await db.prepare(
    `SELECT started_at FROM data_sync_log WHERE sync_type = 'babyrooms_full' ORDER BY id DESC LIMIT 1`
  ).first();

  if (lastSync?.started_at) {
    const lastTime = new Date(lastSync.started_at as string).getTime();
    const hoursSince = (Date.now() - lastTime) / (1000 * 60 * 60);
    if (hoursSince < 1) {
      return c.json({ error: '距離上次更新不足1小時，請稍後再試' }, 429);
    }
  }

  try {
    const result = await scrapeAndSync(db);
    return c.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
});
