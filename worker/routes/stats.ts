import { Hono } from 'hono';
import type { Bindings } from '../index';

export const statsRoutes = new Hono<{ Bindings: Bindings }>();

// Unified stats endpoint - delegates to individual route stats
// This is a convenience endpoint that returns all stats at once
statsRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const months = parseInt(c.req.query('months') || '6');

  const [feedStats, diaperStats, growthData, tempStats] = await Promise.all([
    db.prepare(`
      SELECT
        strftime('%Y-%m', time) as month,
        COUNT(*) as total_feeds,
        SUM(amount_ml) as total_ml,
        ROUND(AVG(amount_ml), 0) as avg_per_feed,
        ROUND(SUM(amount_ml) * 1.0 / COUNT(DISTINCT date(time)), 0) as avg_daily_ml,
        ROUND(COUNT(*) * 1.0 / COUNT(DISTINCT date(time)), 1) as avg_daily_feeds
      FROM feeds
      WHERE time >= date('now', '-' || ? || ' months')
      GROUP BY strftime('%Y-%m', time)
      ORDER BY month ASC
    `).bind(months).all(),
    db.prepare(`
      SELECT
        strftime('%Y-%m', time) as month,
        COUNT(*) as total_changes,
        SUM(CASE WHEN type IN ('pee','both') THEN 1 ELSE 0 END) as pee_count,
        SUM(CASE WHEN type IN ('poo','both') THEN 1 ELSE 0 END) as poo_count,
        ROUND(COUNT(*) * 1.0 / COUNT(DISTINCT date(time)), 1) as avg_daily
      FROM diapers
      WHERE time >= date('now', '-' || ? || ' months')
      GROUP BY strftime('%Y-%m', time)
      ORDER BY month ASC
    `).bind(months).all(),
    db.prepare('SELECT * FROM growth ORDER BY date ASC').all(),
    db.prepare(`
      SELECT
        strftime('%Y-%m', time) as month,
        COUNT(*) as total_records,
        ROUND(MAX(temperature), 1) as max_temp,
        ROUND(MIN(temperature), 1) as min_temp,
        ROUND(AVG(temperature), 1) as avg_temp,
        SUM(CASE WHEN fever = 1 THEN 1 ELSE 0 END) as fever_count
      FROM temperatures
      WHERE time >= date('now', '-' || ? || ' months')
      GROUP BY strftime('%Y-%m', time)
      ORDER BY month ASC
    `).bind(months).all(),
  ]);

  return c.json({
    feeds: feedStats.results,
    diapers: diaperStats.results,
    growth: growthData.results,
    temperatures: tempStats.results,
  });
});
