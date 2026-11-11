import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

let mf;
let db;
const record = { name: '盤尼西林', reactions: ['出疹／紅腫', '痕癢'], severity: '中等', occurred_on: '2025-06-02', note: '食完半個鐘出疹' };
async function request(path, method = 'GET', data) {
  return mf.dispatchFetch('http://localhost' + path, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
before(async () => {
  const result = await build({
    stdin: { contents: `import { Hono } from 'hono';
      import { drugSensitivityRoutes } from './worker/routes/drugsensitivity';
      const app = new Hono();
      app.route('/api/drug-sensitivities', drugSensitivityRoutes);
      export default app;`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  mf = new Miniflare({ modules: true, script: result.outputFiles[0].text, d1Databases: ['DB'], host: '127.0.0.1' });
  db = await mf.getD1Database('DB');
});
after(async () => { if (mf) await mf.dispose(); });

test('existing database upgrades on first access and repeated reads are safe', async () => {
  const results = await Promise.all(Array.from({ length: 3 }, () => request('/api/drug-sensitivities')));
  for (const response of results) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  }
  assert.ok(await db.prepare("SELECT name FROM sqlite_master WHERE name='drug_sensitivities'").first());
});

test('create, list newest first, update, delete and persistence', async () => {
  let response = await request('/api/drug-sensitivities', 'POST', { ...record, name: '  盤尼西林  ' });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.name, '盤尼西林');
  assert.deepEqual(created.reactions, record.reactions);

  // Only the drug name is required.
  response = await request('/api/drug-sensitivities', 'POST', { name: '布洛芬' });
  assert.equal(response.status, 201);
  const minimal = await response.json();
  assert.deepEqual(
    { reactions: minimal.reactions, severity: minimal.severity, occurred_on: minimal.occurred_on, note: minimal.note },
    { reactions: [], severity: null, occurred_on: null, note: null });

  const list = await (await request('/api/drug-sensitivities')).json();
  assert.deepEqual(list.map(r => r.name), ['布洛芬', '盤尼西林']);
  assert.deepEqual(list[1], { id: created.id, ...record });

  response = await request('/api/drug-sensitivities/' + created.id, 'PUT',
    { ...record, reactions: ['呼吸困難', '呼吸困難'], severity: '嚴重', occurred_on: '', note: ' ' });
  assert.equal(response.status, 200);
  const stored = await db.prepare('SELECT * FROM drug_sensitivities WHERE id = ?').bind(created.id).first();
  assert.equal(stored.reactions, '["呼吸困難"]');
  assert.equal(stored.severity, '嚴重');
  assert.equal(stored.occurred_on, null);
  assert.equal(stored.note, null);

  assert.equal((await request('/api/drug-sensitivities/' + created.id, 'DELETE')).status, 200);
  assert.equal((await request('/api/drug-sensitivities/' + created.id, 'DELETE')).status, 404);
  assert.equal((await request('/api/drug-sensitivities/' + created.id, 'PUT', record)).status, 404);
  assert.equal((await request('/api/drug-sensitivities/' + minimal.id, 'DELETE')).status, 200);
});

test('reject invalid fields, future dates and malformed JSON without saving', async () => {
  for (const patch of [
    { name: '  ' }, { name: 'x'.repeat(201) }, { name: 2 }, { name: null },
    { reactions: 'rash' }, { reactions: ['rash'] }, { reactions: [1] },
    { severity: 'severe' }, { severity: 3 },
    { occurred_on: '2025-02-30' }, { occurred_on: '2025-06-02T10:00:00Z' }, { occurred_on: 20250602 },
    { occurred_on: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) },
    { note: {} }, { note: 'x'.repeat(2001) },
  ]) {
    assert.equal((await request('/api/drug-sensitivities', 'POST', { ...record, ...patch })).status, 400, JSON.stringify(patch));
  }
  for (const body of [null, [], 'text']) assert.equal((await request('/api/drug-sensitivities', 'POST', body)).status, 400);
  assert.equal((await mf.dispatchFetch('http://localhost/api/drug-sensitivities', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM drug_sensitivities').first()).n, 0);
});

test('reject invalid IDs', async () => {
  for (const id of ['bad', '0', '-1', '1.5']) {
    assert.equal((await request('/api/drug-sensitivities/' + id, 'DELETE')).status, 400);
    assert.equal((await request('/api/drug-sensitivities/' + id, 'PUT', record)).status, 400);
  }
});
