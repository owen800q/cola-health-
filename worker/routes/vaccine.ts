import { Hono } from 'hono';
import type { Bindings } from '../index';
import { ensureVaccineSchema } from '../lib/vaccine-schema';

export const vaccineRoutes = new Hono<{ Bindings: Bindings }>();

vaccineRoutes.use('*', async (c, next) => {
  await ensureVaccineSchema(c.env.DB);
  await next();
});

// GET /api/vaccines
vaccineRoutes.get('/', async (c) => {
  const db = c.env.DB;

  // Update overdue status
  await db.prepare(`
    UPDATE vaccines SET status = 'overdue'
    WHERE status = 'pending' AND scheduled_date < date('now')
  `).run();

  const vaccines = await db.prepare(
    'SELECT * FROM vaccines ORDER BY scheduled_date ASC'
  ).all();
  return c.json(vaccines.results);
});

// PUT /api/vaccines/:id
vaccineRoutes.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json();
  const { actual_date, status, location, batch_number, side_effects, note } = body;

  await db.prepare(`
    UPDATE vaccines SET
      actual_date = COALESCE(?, actual_date),
      status = COALESCE(?, status),
      location = COALESCE(?, location),
      batch_number = COALESCE(?, batch_number),
      side_effects = COALESCE(?, side_effects),
      note = COALESCE(?, note)
    WHERE id = ?
  `).bind(
    actual_date || null,
    status || null,
    location || null,
    batch_number || null,
    side_effects || null,
    note || null,
    id
  ).run();

  // 預約日期 (booking_date): only touched when the key is present in the body,
  // so an empty string / null explicitly clears an existing booking.
  if ('booking_date' in body) {
    const bookingDate = typeof body.booking_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.booking_date)
      ? body.booking_date
      : null;
    if (body.booking_date && !bookingDate) {
      return c.json({ error: 'booking_date 格式須為 YYYY-MM-DD' }, 400);
    }
    // 預約時間 (booking_time, HH:MM) — optional, cleared together with the date.
    let bookingTime: string | null = null;
    if (bookingDate && typeof body.booking_time === 'string' && body.booking_time) {
      if (!/^\d{2}:\d{2}$/.test(body.booking_time)) {
        return c.json({ error: 'booking_time 格式須為 HH:MM' }, 400);
      }
      bookingTime = body.booking_time;
    }
    await db.prepare('UPDATE vaccines SET booking_date = ?, booking_time = ? WHERE id = ?')
      .bind(bookingDate, bookingTime, id).run();
  }

  const vaccine = await db.prepare('SELECT * FROM vaccines WHERE id = ?').bind(id).first();
  return c.json(vaccine);
});
