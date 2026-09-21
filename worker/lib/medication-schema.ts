/** Additive migration for existing installations, shared by list and timeline. */
const ready = new WeakMap<D1Database, Promise<void>>();

export function ensureMedicationSchema(db: D1Database): Promise<void> {
  let pending = ready.get(db);
  if (!pending) {
    pending = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS medications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        time TEXT NOT NULL,
        name TEXT NOT NULL,
        dose REAL NOT NULL CHECK(dose > 0),
        unit TEXT NOT NULL CHECK(unit IN ('ml', 'mg', 'g', '滴', '粒', '包', '次')),
        note TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_medications_time ON medications(time DESC)'),
    ]).then(() => {}).catch((error) => {
      ready.delete(db);
      throw error;
    });
    ready.set(db, pending);
  }
  return pending;
}
