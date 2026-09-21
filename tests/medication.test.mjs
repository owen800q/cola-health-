import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

let mf;
let db;
const dose = { name: '測試藥物', dose: 2.5, unit: 'ml', time: '2025-06-02T00:30:15.000+08:00', note: '飯後' };
async function request(path, method = 'GET', data) {
  return mf.dispatchFetch('http://localhost' + path, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
before(async () => {
  const result = await build({
    stdin: { contents: `import { Hono } from 'hono';
      import { medicationRoutes } from './worker/routes/medication';
      import { timelineRoutes } from './worker/routes/timeline';
      const app = new Hono();
      app.route('/api/medications', medicationRoutes);
      app.route('/api/timeline', timelineRoutes);
      export default app;`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  mf = new Miniflare({ modules: true, script: result.outputFiles[0].text, d1Databases: ['DB'], host: '127.0.0.1' });
  db = await mf.getD1Database('DB');
  // Pre-feature database: timeline must also initialize medications on first use.
  await db.batch([
    db.prepare('CREATE TABLE feeds (id INTEGER, time TEXT, amount_ml INTEGER, note TEXT)'),
    db.prepare('CREATE TABLE diapers (id INTEGER, time TEXT, type TEXT, color TEXT, texture TEXT, amount TEXT, note TEXT)'),
    db.prepare('CREATE TABLE sleeps (id INTEGER, start_time TEXT, end_time TEXT, quality TEXT, note TEXT)'),
  ]);
});
after(async () => { if (mf) await mf.dispose(); });

test('existing database upgrades on timeline access and repeated reads are safe', async () => {
  const results = await Promise.all(Array.from({ length: 3 }, () => request('/api/timeline?date=2025-06-02')));
  for (const response of results) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  }
  assert.ok(await db.prepare("SELECT name FROM sqlite_master WHERE name='idx_medications_time'").first());
});

test('CRUD, timezone boundaries, chronological timeline and persistence', async () => {
  let response = await request('/api/medications', 'POST', dose);
  assert.equal(response.status, 201);
  const record = await response.json();
  assert.equal(record.time, '2025-06-01T16:30:15.000Z');
  assert.equal(record.dose, 2.5);
  const range = new URLSearchParams({ from: '2025-06-02T00:00:00+08:00', to: '2025-06-02T23:59:59.999+08:00' });
  assert.equal((await (await request('/api/medications?' + range)).json()).length, 1);
  assert.deepEqual(await (await request('/api/medications?date=2025-06-02')).json(), []);
  assert.equal((await (await request('/api/medications?date=2025-06-01')).json()).length, 1);
  await db.prepare('INSERT INTO feeds VALUES (1, ?, 60, NULL)').bind('2025-06-01T16:00:00.000Z').run();
  const timeline = await (await request('/api/timeline?from=2025-06-01T16:00:00.000Z&to=2025-06-02T15:59:59.999Z')).json();
  assert.deepEqual(timeline.map(r => r.record_type), ['medication', 'feed']);
  assert.equal(timeline[0].name, dose.name);
  response = await request('/api/medications/' + record.id, 'PUT', { ...dose, dose: 1.25, unit: '滴', note: '更正' });
  assert.equal(response.status, 200);
  const stored = await db.prepare('SELECT * FROM medications WHERE id = ?').bind(record.id).first();
  assert.equal(stored.time, record.time);
  assert.equal(stored.dose, 1.25);
  assert.equal(stored.note, '更正');
  assert.equal((await request('/api/medications/' + record.id, 'DELETE')).status, 200);
  assert.equal(await db.prepare('SELECT * FROM medications WHERE id = ?').bind(record.id).first(), null);
  assert.equal((await request('/api/medications/' + record.id, 'DELETE')).status, 404);
  assert.equal((await request('/api/medications/' + record.id, 'PUT', dose)).status, 404);
});

test('reject invalid fields, future dates and malformed JSON without saving', async () => {
  for (const patch of [
    { name: '  ' }, { name: 'x'.repeat(201) }, { name: 2 }, { dose: 0 }, { dose: -1 },
    { dose: '2.5' }, { dose: null }, { unit: 'tablespoon' }, { note: {} }, { note: 'x'.repeat(2001) },
    { time: '2025-02-30T10:00:00Z' }, { time: '2025-06-01T12:00:00' },
    { time: new Date(Date.now() + 3600000).toISOString() },
  ]) {
    assert.equal((await request('/api/medications', 'POST', { ...dose, ...patch })).status, 400, JSON.stringify(patch));
  }
  for (const body of [null, [], 'text']) assert.equal((await request('/api/medications', 'POST', body)).status, 400);
  assert.equal((await mf.dispatchFetch('http://localhost/api/medications', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM medications').first()).n, 0);
});

test('reject invalid ranges and IDs', async () => {
  for (const query of ['from=bad&to=bad', 'from=2025-06-01T00:00:00Z', 'date=2025-02-30', 'date=bad',
    'from=2025-06-02T00:00:00Z&to=2025-06-01T00:00:00Z']) {
    assert.equal((await request('/api/medications?' + query)).status, 400);
  }
  for (const id of ['bad', '0', '-1', '1.5']) {
    assert.equal((await request('/api/medications/' + id, 'DELETE')).status, 400);
    assert.equal((await request('/api/medications/' + id, 'PUT', dose)).status, 400);
  }
});
