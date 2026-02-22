import { Hono } from 'hono';
import type { Bindings } from '../index';

export const timelineRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/timeline?date=YYYY-MM-DD or ?from=ISO&to=ISO
timelineRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const from = c.req.query('from');
  const to = c.req.query('to');

  let feedQ: string, diaperQ: string, sleepQ: string, tempQ: string;
  let binds: string[];

  if (from && to) {
    // Local timezone-aware range query
    feedQ = "SELECT id, time, amount_ml, note, 'feed' as record_type FROM feeds WHERE time >= ? AND time <= ? ORDER BY time DESC";
    diaperQ = "SELECT id, time, type, color, texture, amount, note, 'diaper' as record_type FROM diapers WHERE time >= ? AND time <= ? ORDER BY time DESC";
    sleepQ = "SELECT id, start_time as time, end_time, quality, note, 'sleep' as record_type FROM sleeps WHERE start_time >= ? AND start_time <= ? ORDER BY start_time DESC";
    tempQ = "SELECT id, time, temperature, method, fever, note, 'temperature' as record_type FROM temperatures WHERE time >= ? AND time <= ? ORDER BY time DESC";
    binds = [from, to];
  } else {
    const date = c.req.query('date') || new Date().toISOString().split('T')[0];
    feedQ = "SELECT id, time, amount_ml, note, 'feed' as record_type FROM feeds WHERE date(time) = ? ORDER BY time DESC";
    diaperQ = "SELECT id, time, type, color, texture, amount, note, 'diaper' as record_type FROM diapers WHERE date(time) = ? ORDER BY time DESC";
    sleepQ = "SELECT id, start_time as time, end_time, quality, note, 'sleep' as record_type FROM sleeps WHERE date(start_time) = ? ORDER BY start_time DESC";
    tempQ = "SELECT id, time, temperature, method, fever, note, 'temperature' as record_type FROM temperatures WHERE date(time) = ? ORDER BY time DESC";
    binds = [date];
  }

  const [feeds, diapers, sleeps, temps] = await Promise.all([
    db.prepare(feedQ).bind(...binds).all(),
    db.prepare(diaperQ).bind(...binds).all(),
    db.prepare(sleepQ).bind(...binds).all(),
    db.prepare(tempQ).bind(...binds).all(),
  ]);

  // Merge and sort by time DESC
  const timeline = [
    ...feeds.results,
    ...diapers.results,
    ...sleeps.results,
    ...temps.results,
  ].sort((a: any, b: any) => {
    const ta = new Date(a.time).getTime();
    const tb = new Date(b.time).getTime();
    return tb - ta;
  });

  return c.json(timeline);
});
