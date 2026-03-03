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
    // Always run seed to add new vaccines and update reference data
    // (upsert logic preserves existing 'done' records)
    await seedVaccines(db, baby.birth_date);
  }

  return c.json({ ok: true });
});

interface VaccineScheduleItem {
  name: string;
  dose: string | null;
  months: number;
  vaccine_type: 'government' | 'private';
  common_side_effects?: string;
  scheduled_date_override?: string;
}

async function seedVaccines(db: D1Database, birthDate: string) {
  const bd = new Date(birthDate);

  function addMonths(date: Date, months: number): string {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
  }

  // Migrate: add new columns if they don't exist (idempotent)
  try { await db.prepare("ALTER TABLE vaccines ADD COLUMN vaccine_type TEXT DEFAULT 'government'").run(); } catch (_) {}
  try { await db.prepare("ALTER TABLE vaccines ADD COLUMN common_side_effects TEXT").run(); } catch (_) {}

  const schedule: VaccineScheduleItem[] = [
    // === 政府疫苗 (Government vaccines) ===
    { name: '卡介苗 (BCG)', dose: null, months: 0, vaccine_type: 'government',
      common_side_effects: '注射部位紅腫、結痂（屬正常反應，約2-3個月癒合）' },
    { name: '乙型肝炎疫苗', dose: '第一次', months: 0, vaccine_type: 'government',
      common_side_effects: '注射部位疼痛、輕微發燒' },
    { name: '乙型肝炎疫苗', dose: '第二次', months: 1, vaccine_type: 'government',
      common_side_effects: '注射部位疼痛、輕微發燒' },
    { name: '白喉、破傷風、無細胞型百日咳及滅活小兒麻痺混合疫苗', dose: '第一次', months: 2, vaccine_type: 'government',
      scheduled_date_override: '2026-03-18',
      common_side_effects: '注射部位紅腫疼痛、發燒、煩躁不安、食慾下降' },
    { name: '肺炎球菌疫苗', dose: '第一次', months: 2, vaccine_type: 'government',
      scheduled_date_override: '2026-03-18',
      common_side_effects: '注射部位紅腫、發燒、煩躁' },
    { name: '白喉、破傷風、無細胞型百日咳及滅活小兒麻痺混合疫苗', dose: '第二次', months: 4, vaccine_type: 'government',
      common_side_effects: '注射部位紅腫疼痛、發燒、煩躁不安、食慾下降' },
    { name: '肺炎球菌疫苗', dose: '第二次', months: 4, vaccine_type: 'government',
      common_side_effects: '注射部位紅腫、發燒、煩躁' },
    { name: '白喉、破傷風、無細胞型百日咳及滅活小兒麻痺混合疫苗', dose: '第三次', months: 6, vaccine_type: 'government',
      common_side_effects: '注射部位紅腫疼痛、發燒、煩躁不安、食慾下降' },
    { name: '乙型肝炎疫苗', dose: '第三次', months: 6, vaccine_type: 'government',
      common_side_effects: '注射部位疼痛、輕微發燒' },
    { name: '麻疹、流行性腮腺炎及德國麻疹混合疫苗 (MMR)', dose: '第一次', months: 12, vaccine_type: 'government',
      common_side_effects: '接種後7-12天可能出現輕微發燒及皮疹' },
    { name: '肺炎球菌疫苗', dose: '加強劑', months: 12, vaccine_type: 'government',
      common_side_effects: '注射部位紅腫、發燒、煩躁' },
    { name: '水痘疫苗', dose: '第一次', months: 12, vaccine_type: 'government',
      common_side_effects: '注射部位紅腫、輕微發燒、少數出現水痘樣皮疹' },
    { name: '白喉、破傷風、無細胞型百日咳及滅活小兒麻痺混合疫苗', dose: '加強劑', months: 18, vaccine_type: 'government',
      common_side_effects: '注射部位紅腫疼痛、發燒、煩躁不安' },
    { name: '麻疹、流行性腮腺炎、德國麻疹及水痘混合疫苗 (MMRV)', dose: '第二次', months: 18, vaccine_type: 'government',
      common_side_effects: '接種後7-12天可能出現輕微發燒及皮疹' },

    // === 私家疫苗 (Private vaccines - self-pay) ===
    // 口服輪狀病毒疫苗 (Rotarix - 2 doses)
    { name: '口服輪狀病毒疫苗 (Rotavirus)', dose: '第一次', months: 2, vaccine_type: 'private',
      common_side_effects: '輕微腹瀉、嘔吐、煩躁不安、輕微發燒' },
    { name: '口服輪狀病毒疫苗 (Rotavirus)', dose: '第二次', months: 4, vaccine_type: 'private',
      common_side_effects: '輕微腹瀉、嘔吐、煩躁不安、輕微發燒' },

    // Hib B型流感嗜血桿菌 (4 doses: 2, 4, 6 months + booster at 12 months)
    { name: 'Hib 乙型流感嗜血桿菌疫苗', dose: '第一次', months: 2, vaccine_type: 'private',
      common_side_effects: '注射部位紅腫疼痛、輕微發燒' },
    { name: 'Hib 乙型流感嗜血桿菌疫苗', dose: '第二次', months: 4, vaccine_type: 'private',
      common_side_effects: '注射部位紅腫疼痛、輕微發燒' },
    { name: 'Hib 乙型流感嗜血桿菌疫苗', dose: '第三次', months: 6, vaccine_type: 'private',
      common_side_effects: '注射部位紅腫疼痛、輕微發燒' },
    { name: 'Hib 乙型流感嗜血桿菌疫苗', dose: '加強劑', months: 12, vaccine_type: 'private',
      common_side_effects: '注射部位紅腫疼痛、輕微發燒' },

    // B型腦膜炎雙球菌 (Bexsero - 2 doses + booster)
    { name: 'B型腦膜炎雙球菌疫苗 (MenB)', dose: '第一次', months: 2, vaccine_type: 'private',
      common_side_effects: '發燒（較常見）、注射部位紅腫疼痛、煩躁、食慾下降' },
    { name: 'B型腦膜炎雙球菌疫苗 (MenB)', dose: '第二次', months: 4, vaccine_type: 'private',
      common_side_effects: '發燒（較常見）、注射部位紅腫疼痛、煩躁、食慾下降' },
    { name: 'B型腦膜炎雙球菌疫苗 (MenB)', dose: '加強劑', months: 12, vaccine_type: 'private',
      common_side_effects: '發燒（較常見）、注射部位紅腫疼痛、煩躁' },
  ];

  // Fetch all existing vaccines for upsert logic
  const { results: existing } = await db.prepare('SELECT id, name, dose, status FROM vaccines').all<{
    id: number; name: string; dose: string | null; status: string;
  }>();
  const existingMap = new Map<string, { id: number; status: string }>();
  for (const e of existing) {
    const key = `${e.name}||${e.dose ?? ''}`;
    existingMap.set(key, { id: e.id, status: e.status });
  }

  const stmts: D1PreparedStatement[] = [];

  for (const v of schedule) {
    const scheduledDate = v.scheduled_date_override ?? addMonths(bd, v.months);
    const now = new Date().toISOString().split('T')[0];
    const status = scheduledDate < now ? 'overdue' : 'pending';
    const key = `${v.name}||${v.dose ?? ''}`;
    const ex = existingMap.get(key);

    if (ex) {
      if (ex.status !== 'done') {
        // Update scheduled_date, vaccine_type, common_side_effects for non-done vaccines
        stmts.push(db.prepare(
          'UPDATE vaccines SET scheduled_date = ?, status = ?, vaccine_type = ?, common_side_effects = ? WHERE id = ?'
        ).bind(scheduledDate, status, v.vaccine_type, v.common_side_effects ?? null, ex.id));
      } else {
        // Only update reference data (vaccine_type, common_side_effects) for done vaccines
        stmts.push(db.prepare(
          'UPDATE vaccines SET vaccine_type = ?, common_side_effects = ? WHERE id = ?'
        ).bind(v.vaccine_type, v.common_side_effects ?? null, ex.id));
      }
    } else {
      stmts.push(db.prepare(
        'INSERT INTO vaccines (name, dose, scheduled_date, status, vaccine_type, common_side_effects) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(v.name, v.dose ?? null, scheduledDate, status, v.vaccine_type, v.common_side_effects ?? null));
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }
}
