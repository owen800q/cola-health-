import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

let mf;
let db;
const PASSWORD = '20260116';
const record = { title: '疫苗接種紀錄卡號碼', value: 'A1234567', note: '母嬰健康院' };
async function request(path, method = 'GET', data, { password = PASSWORD, ip = '10.0.0.1' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
  if (password != null) headers['X-Private-Password'] = password;
  return mf.dispatchFetch('http://localhost' + path, {
    method, headers, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
before(async () => {
  const result = await build({
    stdin: { contents: `import { Hono } from 'hono';
      import { privateInfoRoutes } from './worker/routes/privateinfo';
      const app = new Hono();
      app.route('/api/private-info', privateInfoRoutes);
      export default app;`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  mf = new Miniflare({ modules: true, script: result.outputFiles[0].text, d1Databases: ['DB'], host: '127.0.0.1' });
  db = await mf.getD1Database('DB');
});
after(async () => { if (mf) await mf.dispose(); });

test('nothing is readable or writable without the right password', async () => {
  await db.prepare("CREATE TABLE IF NOT EXISTS private_info (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, value TEXT NOT NULL, note TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))").run();
  await db.prepare("INSERT INTO private_info (title, value) VALUES ('secret', 'X999')").run();
  for (const [i, password] of [null, '', '20260117', '2026011', '020260116'].entries()) {
    const opts = { password, ip: '10.0.1.' + i };
    let response = await request('/api/private-info', 'GET', undefined, opts);
    assert.equal(response.status, 401, String(password));
    assert.ok(!(await response.text()).includes('X999'));
    assert.equal((await request('/api/private-info', 'POST', record, opts)).status, 401);
    assert.equal((await request('/api/private-info/1', 'PUT', record, opts)).status, 401);
    assert.equal((await request('/api/private-info/1', 'DELETE', undefined, opts)).status, 401);
  }
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM private_info').first()).n, 1);
  await db.prepare('DELETE FROM private_info').run();
  await db.prepare('DELETE FROM private_info_auth_failures').run();
});

test('repeated wrong passwords lock that client out, even with the right one', async () => {
  for (let i = 0; i < 10; i++) {
    assert.equal((await request('/api/private-info', 'GET', undefined, { password: 'wrong', ip: '10.0.0.3' })).status, 401);
  }
  assert.equal((await request('/api/private-info', 'GET', undefined, { ip: '10.0.0.3' })).status, 429);
  // Other clients are unaffected.
  assert.equal((await request('/api/private-info', 'GET', undefined, { ip: '10.0.0.4' })).status, 200);
});

test('create, list, update, delete with the password; responses are not cached', async () => {
  let response = await request('/api/private-info', 'POST', { ...record, title: '  疫苗接種紀錄卡號碼 ' });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const created = await response.json();
  assert.equal(created.title, record.title);
  assert.equal(created.value, record.value);

  response = await request('/api/private-info', 'POST', { title: '出世紙號碼', value: 'B7654321' });
  const second = await response.json();
  assert.equal(second.note, null);

  const list = await (await request('/api/private-info')).json();
  assert.deepEqual(list.map((r) => r.title), ['疫苗接種紀錄卡號碼', '出世紙號碼']);

  response = await request('/api/private-info/' + created.id, 'PUT', { ...record, value: 'A7654321', note: ' ' });
  assert.equal(response.status, 200);
  const stored = await db.prepare('SELECT * FROM private_info WHERE id = ?').bind(created.id).first();
  assert.equal(stored.value, 'A7654321');
  assert.equal(stored.note, null);

  assert.equal((await request('/api/private-info/' + created.id, 'DELETE')).status, 200);
  assert.equal((await request('/api/private-info/' + created.id, 'DELETE')).status, 404);
  assert.equal((await request('/api/private-info/' + created.id, 'PUT', record)).status, 404);
  assert.equal((await request('/api/private-info/' + second.id, 'DELETE')).status, 200);
});

test('reject invalid fields and IDs without saving', async () => {
  for (const patch of [
    { title: ' ' }, { title: 'x'.repeat(101) }, { title: 1 }, { value: '' }, { value: 'x'.repeat(501) },
    { value: null }, { note: {} }, { note: 'x'.repeat(2001) },
  ]) {
    assert.equal((await request('/api/private-info', 'POST', { ...record, ...patch })).status, 400, JSON.stringify(patch));
  }
  for (const body of [null, [], 'text']) assert.equal((await request('/api/private-info', 'POST', body)).status, 400);
  for (const id of ['bad', '0', '-1', '1.5']) {
    assert.equal((await request('/api/private-info/' + id, 'DELETE')).status, 400);
    assert.equal((await request('/api/private-info/' + id, 'PUT', record)).status, 400);
  }
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM private_info').first()).n, 0);
});
