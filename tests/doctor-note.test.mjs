import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

let mf;
let db;
const note = { content: '每半小時量一次體溫，超過 38.5°C 食退燒藥', time: new Date(Date.now() - 60000).toISOString() };
async function request(path, method = 'GET', data) {
  return mf.dispatchFetch('http://localhost' + path, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
before(async () => {
  const result = await build({
    stdin: { contents: `import { Hono } from 'hono';
      import { doctorNoteRoutes } from './worker/routes/doctornote';
      import { timelineRoutes } from './worker/routes/timeline';
      import { findDueDoctorReminders, markDoctorReminderSent } from './worker/lib/doctor-note-reminders';
      const app = new Hono();
      app.route('/api/doctornotes', doctorNoteRoutes);
      app.route('/api/timeline', timelineRoutes);
      // Test hook: run the cron check at a given clock time and mark what it found as sent.
      app.get('/due', async (c) => {
        const now = Number(c.req.query('now'));
        const due = await findDueDoctorReminders(c.env.DB, now);
        for (const d of due) await markDoctorReminderSent(c.env.DB, d.id, now);
        return c.json(due);
      });
      export default app;`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  mf = new Miniflare({ modules: true, script: result.outputFiles[0].text, d1Databases: ['DB'], host: '127.0.0.1' });
  db = await mf.getD1Database('DB');
  // Pre-feature database: timeline must create doctor_notes on first use.
  await db.batch([
    db.prepare('CREATE TABLE feeds (id INTEGER, time TEXT, amount_ml INTEGER, note TEXT)'),
    db.prepare('CREATE TABLE diapers (id INTEGER, time TEXT, type TEXT, color TEXT, texture TEXT, amount TEXT, note TEXT)'),
    db.prepare('CREATE TABLE sleeps (id INTEGER, start_time TEXT, end_time TEXT, quality TEXT, note TEXT)'),
  ]);
});
after(async () => { if (mf) await mf.dispose(); });

test('timeline upgrades an existing database and includes doctor notes', async () => {
  const response = await request('/api/timeline?date=2025-06-02');
  assert.equal(response.status, 200);
  assert.ok(await db.prepare("SELECT name FROM sqlite_master WHERE name='idx_doctor_notes_time'").first());
  const created = await (await request('/api/doctornotes', 'POST', { content: '多飲水', time: '2025-06-02T10:00:00+08:00' })).json();
  const timeline = await (await request('/api/timeline?from=2025-06-02T00:00:00%2B08:00&to=2025-06-02T23:59:59%2B08:00')).json();
  assert.deepEqual(timeline.map(r => [r.record_type, r.content]), [['doctor_note', '多飲水']]);
  assert.equal((await request('/api/doctornotes/' + created.id, 'DELETE')).status, 200);
});

test('note without reminder: create, edit, delete', async () => {
  let response = await request('/api/doctornotes', 'POST', { ...note, content: '  觀察有冇出疹  ' });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.content, '觀察有冇出疹');
  assert.equal(created.reminder_active, false);
  assert.equal(created.next_reminder_at, null);
  response = await request('/api/doctornotes/' + created.id, 'PUT', { ...note, content: '觀察有冇出疹及發燒' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).content, '觀察有冇出疹及發燒');
  assert.equal((await request('/api/doctornotes/' + created.id, 'DELETE')).status, 200);
  assert.equal((await request('/api/doctornotes/' + created.id, 'DELETE')).status, 404);
  assert.equal((await request('/api/doctornotes/' + created.id, 'PUT', note)).status, 404);
});

test('repeating reminder fires once per slot, can restart and stop', async () => {
  const before = Date.now();
  const response = await request('/api/doctornotes', 'POST', { ...note, interval_minutes: 30, duration_minutes: 90 });
  assert.equal(response.status, 201);
  const created = await response.json();
  const from = Date.parse(created.remind_from);
  assert.ok(from >= before && from <= Date.now());
  assert.equal(Date.parse(created.remind_until) - from, 90 * 60000);
  assert.equal(Date.parse(created.next_reminder_at) - from, 30 * 60000);

  const active = await (await request('/api/doctornotes?active=1')).json();
  assert.deepEqual(active.map(n => n.id), [created.id]);

  const due = async (offsetMin) => (await (await request('/due?now=' + (from + offsetMin * 60000))).json()).map(d => d.slot);
  assert.deepEqual(await due(10), []);           // too early
  assert.deepEqual(await due(29), [1]);          // within early tolerance of slot 1
  assert.deepEqual(await due(32), []);           // already sent for slot 1
  assert.deepEqual(await due(61), [2]);
  assert.deepEqual(await due(95), [3]);          // last slot (90 min) still delivered late
  assert.deepEqual(await due(125), []);          // past the end

  // Editing text keeps the schedule.
  const edited = await (await request('/api/doctornotes/' + created.id, 'PUT', { ...note, content: '每半小時量體溫' })).json();
  assert.equal(edited.remind_from, created.remind_from);

  // Restart from now resets the slots.
  const restarted = await (await request('/api/doctornotes/' + created.id + '/reminder', 'PUT', { interval_minutes: 60, duration_minutes: 240 })).json();
  assert.equal(restarted.interval_minutes, 60);
  assert.equal(restarted.last_reminded_at, null);
  assert.equal(restarted.reminder_active, true);

  // Stop: no longer active, nothing more fires.
  const stopped = await (await request('/api/doctornotes/' + created.id + '/reminder', 'DELETE')).json();
  assert.equal(stopped.reminder_active, false);
  assert.deepEqual(await (await request('/api/doctornotes?active=1')).json(), []);
  assert.deepEqual((await (await request('/due?now=' + (Date.parse(restarted.remind_from) + 61 * 60000))).json()), []);
  assert.equal((await request('/api/doctornotes/' + created.id, 'DELETE')).status, 200);
});

test('reject invalid input without saving', async () => {
  for (const patch of [
    { content: '  ' }, { content: 'x'.repeat(2001) }, { content: 3 }, { time: 'bad' },
    { time: '2025-02-30T10:00:00Z' }, { time: '2025-06-01T12:00:00' },
    { time: new Date(Date.now() + 3600000).toISOString() },
    { interval_minutes: 30 }, { interval_minutes: 4, duration_minutes: 60 }, { interval_minutes: 30.5, duration_minutes: 60 },
    { interval_minutes: 30, duration_minutes: 20 }, { interval_minutes: 30, duration_minutes: 8 * 24 * 60 },
    { interval_minutes: '30', duration_minutes: 60 },
  ]) {
    assert.equal((await request('/api/doctornotes', 'POST', { ...note, ...patch })).status, 400, JSON.stringify(patch));
  }
  for (const body of [null, [], 'text']) assert.equal((await request('/api/doctornotes', 'POST', body)).status, 400);
  assert.equal((await mf.dispatchFetch('http://localhost/api/doctornotes', { method: 'POST', body: '{' })).status, 400);
  for (const id of ['bad', '0', '-1', '1.5']) {
    assert.equal((await request('/api/doctornotes/' + id, 'DELETE')).status, 400);
    assert.equal((await request('/api/doctornotes/' + id + '/reminder', 'DELETE')).status, 400);
  }
  assert.equal((await request('/api/doctornotes/999/reminder', 'PUT', { interval_minutes: 30, duration_minutes: 60 })).status, 404);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM doctor_notes').first()).n, 0);
});
