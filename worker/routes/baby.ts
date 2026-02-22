import { Hono } from 'hono';
import type { Bindings } from '../index';

export const babyRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/baby
babyRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const baby = await db.prepare('SELECT * FROM baby WHERE id = 1').first();
  if (!baby) {
    return c.json({ error: 'Baby profile not found' }, 404);
  }
  return c.json(baby);
});

// PUT /api/baby
babyRoutes.put('/', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const { name, gender, birth_date, birth_weight, birth_height, blood_type, has_g6pd, hospital, doctor_name, doctor_phone } = body;

  await db.prepare(`
    UPDATE baby SET
      name = COALESCE(?, name),
      gender = COALESCE(?, gender),
      birth_date = COALESCE(?, birth_date),
      birth_weight = COALESCE(?, birth_weight),
      birth_height = COALESCE(?, birth_height),
      blood_type = COALESCE(?, blood_type),
      has_g6pd = COALESCE(?, has_g6pd),
      hospital = COALESCE(?, hospital),
      doctor_name = COALESCE(?, doctor_name),
      doctor_phone = COALESCE(?, doctor_phone),
      updated_at = datetime('now')
    WHERE id = 1
  `).bind(name ?? null, gender ?? null, birth_date ?? null, birth_weight ?? null, birth_height ?? null, blood_type ?? null, has_g6pd ?? null, hospital ?? null, doctor_name ?? null, doctor_phone ?? null).run();

  // Recalculate vaccine scheduled dates if birth_date changed
  if (birth_date) {
    await seedVaccines(db, birth_date);
  }

  const baby = await db.prepare('SELECT * FROM baby WHERE id = 1').first();
  return c.json(baby);
});

// POST /api/baby/avatar
babyRoutes.post('/avatar', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const { avatar_url } = body;

  if (!avatar_url) {
    return c.json({ error: 'avatar_url is required' }, 400);
  }

  await db.prepare('UPDATE baby SET avatar_url = ?, updated_at = datetime(\'now\') WHERE id = 1')
    .bind(avatar_url).run();

  return c.json({ avatar_url });
});

// POST /api/baby/init - Initialize DB and seed data
babyRoutes.post('/init', async (c) => {
  const db = c.env.DB;

  // Check if baby exists
  const baby = await db.prepare('SELECT birth_date FROM baby WHERE id = 1').first<{ birth_date: string }>();
  if (baby) {
    // Seed vaccines if not already done
    const vaccineCount = await db.prepare('SELECT COUNT(*) as count FROM vaccines').first<{ count: number }>();
    if (!vaccineCount || vaccineCount.count === 0) {
      await seedVaccines(db, baby.birth_date);
    }
  }

  return c.json({ ok: true });
});

async function seedVaccines(db: D1Database, birthDate: string) {
  const bd = new Date(birthDate);

  function addMonths(date: Date, months: number): string {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
  }

  const schedule = [
    { name: '卡介苗 (BCG)', dose: null, months: 0 },
    { name: '乙型肝炎疫苗', dose: '第一次', months: 0 },
    { name: '乙型肝炎疫苗', dose: '第二次', months: 1 },
    { name: '白喉、破傷風、無細胞型百日咳及滅活小兒麻痺混合疫苗', dose: '第一次', months: 2 },
    { name: '肺炎球菌疫苗', dose: '第一次', months: 2 },
    { name: '白喉、破傷風、無細胞型百日咳及滅活小兒麻痺混合疫苗', dose: '第二次', months: 4 },
    { name: '肺炎球菌疫苗', dose: '第二次', months: 4 },
    { name: '白喉、破傷風、無細胞型百日咳及滅活小兒麻痺混合疫苗', dose: '第三次', months: 6 },
    { name: '乙型肝炎疫苗', dose: '第三次', months: 6 },
    { name: '麻疹、流行性腮腺炎及德國麻疹混合疫苗 (MMR)', dose: '第一次', months: 12 },
    { name: '肺炎球菌疫苗', dose: '加強劑', months: 12 },
    { name: '水痘疫苗', dose: '第一次', months: 12 },
    { name: '白喉、破傷風、無細胞型百日咳及滅活小兒麻痺混合疫苗', dose: '加強劑', months: 18 },
    { name: '麻疹、流行性腮腺炎、德國麻疹及水痘混合疫苗 (MMRV)', dose: '第二次', months: 18 },
  ];

  // Delete existing and re-seed
  await db.prepare('DELETE FROM vaccines').run();

  const stmt = db.prepare(
    'INSERT INTO vaccines (name, dose, scheduled_date, status) VALUES (?, ?, ?, ?)'
  );

  const batch = schedule.map(v => {
    const scheduledDate = addMonths(bd, v.months);
    const now = new Date().toISOString().split('T')[0];
    const status = scheduledDate < now ? 'overdue' : 'pending';
    return stmt.bind(v.name, v.dose, scheduledDate, status);
  });

  await db.batch(batch);
}
