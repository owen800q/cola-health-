/** Additive migration for existing installations, shared by routes, timeline and cron. */
const ready = new WeakMap<D1Database, Promise<void>>();

export function ensureDoctorNoteSchema(db: D1Database): Promise<void> {
  let pending = ready.get(db);
  if (!pending) {
    pending = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS doctor_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        time TEXT NOT NULL,
        content TEXT NOT NULL,
        interval_minutes INTEGER CHECK(interval_minutes IS NULL OR interval_minutes BETWEEN 5 AND 1440),
        remind_from TEXT,
        remind_until TEXT,
        last_reminded_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_doctor_notes_time ON doctor_notes(time DESC)'),
    ]).then(() => {}).catch((error) => {
      ready.delete(db);
      throw error;
    });
    ready.set(db, pending);
  }
  return pending;
}
