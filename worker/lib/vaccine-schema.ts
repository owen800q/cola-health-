/**
 * Runtime auto-migration for the vaccines table.
 * Adds the `booking_date` column (預約日期) to databases created before the
 * column existed, so the deployed Worker keeps working without a CLI migration.
 * Guarded by a module-level flag so it only runs once per isolate.
 */
let ensured = false;

export async function ensureVaccineSchema(db: D1Database): Promise<void> {
  if (ensured) return;
  const { results } = await db.prepare('PRAGMA table_info(vaccines)').all();
  const existing = new Set((results || []).map((col) => col.name as string));
  const wanted: Array<[string, string]> = [
    ['booking_date', 'TEXT'],
    ['booking_time', 'TEXT'],
  ];
  for (const [name, type] of wanted) {
    if (existing.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE vaccines ADD COLUMN ${name} ${type}`).run();
    } catch (e: any) {
      // Another isolate may have added it concurrently.
      if (!/duplicate column/i.test(String(e?.message || e))) throw e;
    }
  }
  ensured = true;
}
