import { Hono } from 'hono';
import type { Bindings } from '../index';

export const drugSensitivityRoutes = new Hono<{ Bindings: Bindings }>();

// Keep in sync with DS_REACTIONS / DS_SEVERITIES in public/js/app.js.
const reactions = new Set(['出疹／紅腫', '痕癢', '面或嘴唇腫', '嘔吐', '肚瀉', '呼吸困難', '發燒', '其他']);
const severities = new Set(['輕微', '中等', '嚴重']);
const invalid = '請輸入有效藥名、反應、嚴重程度及發生日期（備註最多 2000 字）';

/** Additive migration for existing installations: created on first use, once per database. */
const ready = new WeakMap<D1Database, Promise<void>>();
function ensureSchema(db: D1Database): Promise<void> {
  let pending = ready.get(db);
  if (!pending) {
    pending = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS drug_sensitivities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        reactions TEXT NOT NULL DEFAULT '[]',
        severity TEXT CHECK(severity IN ('輕微', '中等', '嚴重')),
        occurred_on TEXT,
        note TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`),
    ]).then(() => {}).catch((error) => {
      ready.delete(db);
      throw error;
    });
    ready.set(db, pending);
  }
  return pending;
}

// A real calendar day (YYYY-MM-DD) that is not in the future. One day of slack
// covers users east of UTC, whose "today" starts before the server's.
function day(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  if (date.getTime() > Date.now() + 86400000) return null;
  return value;
}

function validate(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.trim().length > 200) return null;
  const list = b.reactions ?? [];
  if (!Array.isArray(list) || list.some((r) => typeof r !== 'string' || !reactions.has(r))) return null;
  if (b.severity != null && (typeof b.severity !== 'string' || !severities.has(b.severity))) return null;
  const occurred = b.occurred_on == null || b.occurred_on === '' ? null : day(b.occurred_on);
  if (b.occurred_on != null && b.occurred_on !== '' && !occurred) return null;
  if (b.note != null && (typeof b.note !== 'string' || b.note.length > 2000)) return null;
  return {
    name: b.name.trim(),
    reactions: Array.from(new Set(list as string[])),
    severity: (b.severity as string | null | undefined) ?? null,
    occurred_on: occurred,
    note: typeof b.note === 'string' ? b.note.trim() || null : null,
  };
}

function mapRow(r: any) {
  let list: string[] = [];
  try { list = JSON.parse(r.reactions || '[]'); } catch { list = []; }
  return { id: r.id, name: r.name, reactions: list, severity: r.severity, occurred_on: r.occurred_on, note: r.note };
}

function recordId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

drugSensitivityRoutes.use('*', async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

// The whole list: it is short, and caregivers need to see all of it at once.
drugSensitivityRoutes.get('/', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM drug_sensitivities ORDER BY id DESC').all();
  return c.json((rows.results || []).map(mapRow));
});

drugSensitivityRoutes.post('/', async (c) => {
  const data = validate(await c.req.json().catch(() => null));
  if (!data) return c.json({ error: invalid }, 400);
  const result = await c.env.DB.prepare(
    'INSERT INTO drug_sensitivities (name, reactions, severity, occurred_on, note) VALUES (?, ?, ?, ?, ?)'
  ).bind(data.name, JSON.stringify(data.reactions), data.severity, data.occurred_on, data.note).run();
  return c.json({ id: result.meta.last_row_id, ...data }, 201);
});

drugSensitivityRoutes.put('/:id', async (c) => {
  const id = recordId(c.req.param('id'));
  if (!id) return c.json({ error: '記錄編號無效' }, 400);
  const data = validate(await c.req.json().catch(() => null));
  if (!data) return c.json({ error: invalid }, 400);
  const result = await c.env.DB.prepare(
    'UPDATE drug_sensitivities SET name = ?, reactions = ?, severity = ?, occurred_on = ?, note = ? WHERE id = ?'
  ).bind(data.name, JSON.stringify(data.reactions), data.severity, data.occurred_on, data.note, id).run();
  if (!result.meta.changes) return c.json({ error: '找不到藥物敏感記錄' }, 404);
  return c.json({ id, ...data });
});

drugSensitivityRoutes.delete('/:id', async (c) => {
  const id = recordId(c.req.param('id'));
  if (!id) return c.json({ error: '記錄編號無效' }, 400);
  const result = await c.env.DB.prepare('DELETE FROM drug_sensitivities WHERE id = ?').bind(id).run();
  if (!result.meta.changes) return c.json({ error: '找不到藥物敏感記錄' }, 404);
  return c.json({ ok: true });
});
