import { Hono } from 'hono';
import type { Bindings } from '../index';

export const timelineRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/timeline?date=YYYY-MM-DD
timelineRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const date = c.req.query('date') || new Date().toISOString().split('T')[0];

  const [feeds, diapers, sleeps] = await Promise.all([
    db.prepare("SELECT id, time, amount_ml, note, 'feed' as record_type FROM feeds WHERE date(time) = ? ORDER BY time DESC")
      .bind(date).all(),
    db.prepare("SELECT id, time, type, color, texture, amount, note, 'diaper' as record_type FROM diapers WHERE date(time) = ? ORDER BY time DESC")
      .bind(date).all(),
    db.prepare("SELECT id, start_time as time, end_time, quality, note, 'sleep' as record_type FROM sleeps WHERE date(start_time) = ? ORDER BY start_time DESC")
      .bind(date).all(),
  ]);

  // Merge and sort by time DESC
  const timeline = [
    ...feeds.results,
    ...diapers.results,
    ...sleeps.results,
  ].sort((a: any, b: any) => {
    const ta = new Date(a.time).getTime();
    const tb = new Date(b.time).getTime();
    return tb - ta;
  });

  return c.json(timeline);
});
