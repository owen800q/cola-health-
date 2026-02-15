-- Baby profile (single baby, one row)
CREATE TABLE IF NOT EXISTS baby (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT NOT NULL DEFAULT '可樂仔',
  gender TEXT CHECK(gender IN ('M','F')) DEFAULT 'M',
  birth_date TEXT NOT NULL,
  birth_weight REAL,
  birth_height REAL,
  blood_type TEXT,
  has_g6pd INTEGER DEFAULT 0,
  hospital TEXT,
  doctor_name TEXT,
  doctor_phone TEXT,
  avatar_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Feeding records (formula only)
CREATE TABLE IF NOT EXISTS feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time TEXT NOT NULL,
  amount_ml INTEGER NOT NULL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Diaper records
CREATE TABLE IF NOT EXISTS diapers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('pee','poo','both','dry')),
  color TEXT,
  texture TEXT,
  amount TEXT CHECK(amount IN ('少量','中量','大量')),
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Sleep records
CREATE TABLE IF NOT EXISTS sleeps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  quality TEXT CHECK(quality IN ('good','fair','poor')),
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Vaccine records
CREATE TABLE IF NOT EXISTS vaccines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  dose TEXT,
  scheduled_date TEXT,
  actual_date TEXT,
  status TEXT CHECK(status IN ('done','pending','overdue')) DEFAULT 'pending',
  location TEXT,
  batch_number TEXT,
  side_effects TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Growth records
CREATE TABLE IF NOT EXISTS growth (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  weight REAL,
  height REAL,
  head_circumference REAL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Reminder settings
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('feed','diaper','vaccine','awake_time')),
  enabled INTEGER DEFAULT 1,
  interval_minutes INTEGER,
  advance_days INTEGER,
  max_awake_minutes INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Notification dedup log (tracks last notification time per reminder type)
CREATE TABLE IF NOT EXISTS notification_log (
  reminder_type TEXT PRIMARY KEY,
  last_notified_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feeds_time ON feeds(time DESC);
CREATE INDEX IF NOT EXISTS idx_diapers_time ON diapers(time DESC);
CREATE INDEX IF NOT EXISTS idx_sleeps_start ON sleeps(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_vaccines_status ON vaccines(status);
CREATE INDEX IF NOT EXISTS idx_growth_date ON growth(date DESC);

-- Seed default baby profile
INSERT OR IGNORE INTO baby (id, name, gender, birth_date, birth_weight, birth_height)
VALUES (1, '可樂仔', 'M', '2025-01-25', 3.2, 50.0);

-- Seed default reminder settings
INSERT OR IGNORE INTO reminders (id, type, enabled, interval_minutes) VALUES (1, 'feed', 1, 180);
INSERT OR IGNORE INTO reminders (id, type, enabled, interval_minutes) VALUES (2, 'diaper', 0, 180);
INSERT OR IGNORE INTO reminders (id, type, enabled, advance_days) VALUES (3, 'vaccine', 1, 7);
INSERT OR IGNORE INTO reminders (id, type, enabled, max_awake_minutes) VALUES (4, 'awake_time', 0, 60);
