import { Hono } from 'hono';
import type { Bindings } from '../index';

export const privateInfoRoutes = new Hono<{ Bindings: Bindings }>();

// SHA-256 of the default password. Set the PRIVATE_INFO_PASSWORD secret
// (`wrangler secret put PRIVATE_INFO_PASSWORD`) to use a different one.
const DEFAULT_PASSWORD_SHA256 = '34c442e9bb06b07427b09c4c4841507d054a46a7d70c0721b5db635bca8f6cc1';
// Wrong-password throttle per client IP.
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const invalid = '請輸入有效項目名稱（最多 100 字）、內容（最多 500 字）及備註（最多 2000 字）';

/** Additive migration: created on first use, once per database. */
const ready = new WeakMap<D1Database, Promise<void>>();
function ensureSchema(db: D1Database): Promise<void> {
  let pending = ready.get(db);
  if (!pending) {
    pending = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS private_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        value TEXT NOT NULL,
        note TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS private_info_auth_failures (
        client TEXT PRIMARY KEY,
        failures INTEGER NOT NULL,
        window_start INTEGER NOT NULL
      )`),
    ]).then(() => {}).catch((error) => {
      ready.delete(db);
      throw error;
    });
    ready.set(db, pending);
  }
  return pending;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Compare digests so the comparison time does not depend on the password.
async function passwordMatches(given: string, configured: string | undefined): Promise<boolean> {
  const expected = configured ? await sha256Hex(configured) : DEFAULT_PASSWORD_SHA256;
  const actual = await sha256Hex(given);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return diff === 0;
}

function validate(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > 100) return null;
  if (typeof b.value !== 'string' || !b.value.trim() || b.value.trim().length > 500) return null;
  if (b.note != null && (typeof b.note !== 'string' || b.note.length > 2000)) return null;
  return {
    title: b.title.trim(),
    value: b.value.trim(),
    note: typeof b.note === 'string' ? b.note.trim() || null : null,
  };
}

function mapRow(r: any) {
  return { id: r.id, title: r.title, value: r.value, note: r.note, updated_at: r.updated_at };
}

function recordId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Every request must carry the password; nothing is readable without it.
privateInfoRoutes.use('*', async (c, next) => {
  const db = c.env.DB;
  await ensureSchema(db);
  const client = c.req.header('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const row = await db.prepare('SELECT failures, window_start FROM private_info_auth_failures WHERE client = ?')
    .bind(client).first<{ failures: number; window_start: number }>();
  const inWindow = row && now - row.window_start < FAILURE_WINDOW_MS;
  if (inWindow && row.failures >= MAX_FAILURES) {
    return c.json({ error: '密碼錯誤次數太多，請 15 分鐘後再試' }, 429);
  }
  const password = c.req.header('X-Private-Password') || '';
  if (!password || !(await passwordMatches(password, c.env.PRIVATE_INFO_PASSWORD))) {
    if (inWindow) {
      await db.prepare('UPDATE private_info_auth_failures SET failures = failures + 1 WHERE client = ?').bind(client).run();
    } else {
      await db.prepare('INSERT OR REPLACE INTO private_info_auth_failures (client, failures, window_start) VALUES (?, 1, ?)')
        .bind(client, now).run();
    }
    return c.json({ error: '密碼錯誤' }, 401);
  }
  if (row) await db.prepare('DELETE FROM private_info_auth_failures WHERE client = ?').bind(client).run();
  c.header('Cache-Control', 'no-store');
  await next();
});

privateInfoRoutes.get('/', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM private_info ORDER BY id ASC').all();
  return c.json((rows.results || []).map(mapRow));
});

privateInfoRoutes.post('/', async (c) => {
  const data = validate(await c.req.json().catch(() => null));
  if (!data) return c.json({ error: invalid }, 400);
  const row = await c.env.DB.prepare(
    'INSERT INTO private_info (title, value, note) VALUES (?, ?, ?) RETURNING *'
  ).bind(data.title, data.value, data.note).first();
  return c.json(mapRow(row), 201);
});

privateInfoRoutes.put('/:id', async (c) => {
  const id = recordId(c.req.param('id'));
  if (!id) return c.json({ error: '記錄編號無效' }, 400);
  const data = validate(await c.req.json().catch(() => null));
  if (!data) return c.json({ error: invalid }, 400);
  const row = await c.env.DB.prepare(
    "UPDATE private_info SET title = ?, value = ?, note = ?, updated_at = datetime('now') WHERE id = ? RETURNING *"
  ).bind(data.title, data.value, data.note, id).first();
  if (!row) return c.json({ error: '找不到記錄' }, 404);
  return c.json(mapRow(row));
});

privateInfoRoutes.delete('/:id', async (c) => {
  const id = recordId(c.req.param('id'));
  if (!id) return c.json({ error: '記錄編號無效' }, 400);
  const result = await c.env.DB.prepare('DELETE FROM private_info WHERE id = ?').bind(id).run();
  if (!result.meta.changes) return c.json({ error: '找不到記錄' }, 404);
  return c.json({ ok: true });
});
