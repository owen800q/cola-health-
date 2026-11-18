import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

let mf;
let db;
async function request(path, method = 'GET', data) {
  return mf.dispatchFetch('http://localhost' + path, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
// Run the cron check at a given instant; returns the pushes it would send.
async function remind(isoUtc) {
  const res = await request('/__remind?now=' + encodeURIComponent(isoUtc), 'POST');
  assert.equal(res.status, 200);
  return res.json();
}
// HK is UTC+8, so 10:00 HK = 02:00 UTC.
const hk = (date, time) => new Date(`${date}T${time}:00+08:00`).toISOString();

before(async () => {
  const result = await build({
    stdin: { contents: `import { Hono } from 'hono';
      import { todoRoutes } from './worker/routes/todo';
      import { checkTodoReminders } from './worker/lib/todo-reminders';
      const app = new Hono();
      app.route('/api/todos', todoRoutes);
      app.post('/__remind', async (c) => {
        const sent = [];
        await checkTodoReminders(c.env.DB, Date.parse(c.req.query('now')), async (p) => { sent.push(p); });
        return c.json(sent);
      });
      export default app;`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  mf = new Miniflare({ modules: true, script: result.outputFiles[0].text, d1Databases: ['DB'], host: '127.0.0.1' });
  db = await mf.getD1Database('DB');
});
after(async () => { if (mf) await mf.dispose(); });
beforeEach(async () => {
  await request('/api/todos');
  await db.prepare('DELETE FROM todos').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS notification_log (reminder_type TEXT PRIMARY KEY, last_notified_at TEXT NOT NULL)').run();
  await db.prepare('DELETE FROM notification_log').run();
});

test('create, list open-first by due time, update, mark done, delete', async () => {
  let res = await request('/api/todos', 'POST', { title: '  覆診  ', due_date: '2026-12-10', due_time: '15:30', note: '帶針卡' });
  assert.equal(res.status, 201);
  const a = await res.json();
  assert.deepEqual(a, { id: a.id, title: '覆診', due_date: '2026-12-10', due_time: '15:30', note: '帶針卡', done: false });
  const b = await (await request('/api/todos', 'POST', { title: '買奶粉', due_date: '2026-12-01', due_time: '09:00' })).json();
  assert.equal(b.note, null);

  let list = await (await request('/api/todos')).json();
  assert.deepEqual(list.map(t => t.title), ['買奶粉', '覆診']);

  res = await request('/api/todos/' + b.id, 'PUT', { ...b, done: true });
  assert.equal(res.status, 200);
  list = await (await request('/api/todos')).json();
  assert.deepEqual(list.map(t => [t.title, t.done]), [['覆診', false], ['買奶粉', true]]);

  assert.equal((await request('/api/todos/' + a.id, 'DELETE')).status, 200);
  assert.equal((await request('/api/todos/' + a.id, 'DELETE')).status, 404);
  assert.equal((await request('/api/todos/' + a.id, 'PUT', a)).status, 404);
  assert.equal((await request('/api/todos/abc', 'DELETE')).status, 400);
});

test('reject invalid input without saving', async () => {
  const ok = { title: 'x', due_date: '2026-12-01', due_time: '10:00' };
  for (const patch of [
    { title: ' ' }, { title: 'x'.repeat(201) }, { title: 1 },
    { due_date: '' }, { due_date: '2026-02-30' }, { due_date: '2026-12-01T10:00' },
    { due_time: '' }, { due_time: '24:00' }, { due_time: '9:00' }, { due_time: '10:00:00' },
    { note: {} }, { note: 'x'.repeat(2001) }, { done: 'yes' },
  ]) {
    const res = await request('/api/todos', 'POST', { ...ok, ...patch });
    assert.equal(res.status, 400, JSON.stringify(patch));
  }
  const bad = await mf.dispatchFetch('http://localhost/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(bad.status, 400);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM todos').first()).n, 0);
});

test('push at 10:00 HK on each of the 3 days before and on the day', async () => {
  const t = await (await request('/api/todos', 'POST', { title: '打針', due_date: '2026-12-10', due_time: '14:00' })).json();
  const pushedOn = [];
  for (const date of ['2026-12-05', '2026-12-06', '2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11']) {
    const sent = await remind(hk(date, '10:00'));
    if (sent.length) pushedOn.push([date, sent[0].body]);
  }
  assert.deepEqual(pushedOn, [
    ['2026-12-07', '打針：3 日後 12月10日 14:00'],
    ['2026-12-08', '打針：2 日後 12月10日 14:00'],
    ['2026-12-09', '打針：明天 12月10日 14:00'],
    ['2026-12-10', '打針：今日 14:00'],
  ]);
  const one = await remind(hk('2026-12-07', '10:00'));
  assert.equal(one.length, 0, 'already sent today');
  assert.equal(t.id > 0, true);
});

test('only during the 10 o\'clock hour, once per day', async () => {
  await request('/api/todos', 'POST', { title: '覆診', due_date: '2026-12-10', due_time: '14:00' });
  assert.equal((await remind(hk('2026-12-08', '09:55'))).length, 0);
  assert.equal((await remind(hk('2026-12-08', '10:05'))).length, 1);
  assert.equal((await remind(hk('2026-12-08', '10:10'))).length, 0);
  assert.equal((await remind(hk('2026-12-08', '11:00'))).length, 0);
  // A cron tick missed at 10:00 is caught later in the hour.
  assert.equal((await remind(hk('2026-12-09', '10:55'))).length, 1);
});

test('skip done todos and same-day todos due by 10:00', async () => {
  const done = await (await request('/api/todos', 'POST', { title: 'A', due_date: '2026-12-10', due_time: '14:00', done: true })).json();
  await request('/api/todos', 'POST', { title: 'B', due_date: '2026-12-08', due_time: '09:30' });
  await request('/api/todos', 'POST', { title: 'C', due_date: '2026-12-08', due_time: '10:00' });
  await request('/api/todos', 'POST', { title: 'D', due_date: '2026-12-08', due_time: '10:30' });
  await request('/api/todos', 'POST', { title: 'E', due_date: '2026-12-12', due_time: '08:00' });
  const sent = await remind(hk('2026-12-08', '10:00'));
  assert.deepEqual(sent.map(p => p.body), ['D：今日 10:30']);
  assert.equal(sent[0].data.url, '/#todo');
  // Reopening a done todo re-arms its reminders.
  await request('/api/todos/' + done.id, 'PUT', { ...done, done: false });
  assert.deepEqual((await remind(hk('2026-12-09', '10:00'))).map(p => p.body), ['A：明天 12月10日 14:00', 'E：3 日後 12月12日 08:00']);
});

test('HK date, not UTC date, decides the day (month boundary)', async () => {
  await request('/api/todos', 'POST', { title: '月頭', due_date: '2027-01-01', due_time: '12:00' });
  // 10:00 HK on 29 Dec is 02:00 UTC the same day; 3 days before 1 Jan.
  assert.deepEqual((await remind(hk('2026-12-29', '10:00'))).map(p => p.body), ['月頭：3 日後 1月1日 12:00']);
  assert.equal((await remind(hk('2026-12-28', '10:00'))).length, 0);
});
