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

-- Temperature records
CREATE TABLE IF NOT EXISTS temperatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time TEXT NOT NULL,
  temperature REAL NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('ear','forehead','armpit','oral','rectal')) DEFAULT 'ear',
  fever INTEGER DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Solid food (輔食) records — complementary feeding + allergy observation
CREATE TABLE IF NOT EXISTS solid_foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  texture TEXT,
  first_try INTEGER DEFAULT 0,
  amount TEXT,
  reaction TEXT,
  abnormal INTEGER DEFAULT 0,
  symptoms TEXT,
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

-- Bottle assembly slots
CREATE TABLE IF NOT EXISTS bottle_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Bottle assembly photos (multiple per slot)
CREATE TABLE IF NOT EXISTS bottle_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id INTEGER NOT NULL REFERENCES bottle_slots(id) ON DELETE CASCADE,
  photo_data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bottle_photos_slot ON bottle_photos(slot_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feeds_time ON feeds(time DESC);
CREATE INDEX IF NOT EXISTS idx_diapers_time ON diapers(time DESC);
CREATE INDEX IF NOT EXISTS idx_sleeps_start ON sleeps(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_vaccines_status ON vaccines(status);
CREATE INDEX IF NOT EXISTS idx_growth_date ON growth(date DESC);
CREATE INDEX IF NOT EXISTS idx_temperatures_time ON temperatures(time DESC);
CREATE INDEX IF NOT EXISTS idx_solid_foods_time ON solid_foods(time DESC);

-- Seed default baby profile
INSERT OR IGNORE INTO baby (id, name, gender, birth_date, birth_weight, birth_height)
VALUES (1, '可樂仔', 'M', '2026-01-16', 3.2, 50.0);

-- Seed default reminder settings
INSERT OR IGNORE INTO reminders (id, type, enabled, interval_minutes) VALUES (1, 'feed', 1, 180);
INSERT OR IGNORE INTO reminders (id, type, enabled, interval_minutes) VALUES (2, 'diaper', 0, 180);
INSERT OR IGNORE INTO reminders (id, type, enabled, advance_days) VALUES (3, 'vaccine', 1, 7);
INSERT OR IGNORE INTO reminders (id, type, enabled, max_awake_minutes) VALUES (4, 'awake_time', 0, 60);

-- Baby care rooms (母嬰室)
CREATE TABLE IF NOT EXISTS babycare_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT,
  district TEXT NOT NULL,
  region TEXT NOT NULL,
  address TEXT,
  type TEXT NOT NULL,
  facilities TEXT,
  hours TEXT,
  source TEXT DEFAULT 'seed',
  source_url TEXT,
  lat REAL,
  lng REAL,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rooms_district ON babycare_rooms(district);
CREATE INDEX IF NOT EXISTS idx_rooms_region ON babycare_rooms(region);
CREATE INDEX IF NOT EXISTS idx_rooms_type ON babycare_rooms(type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_name_district ON babycare_rooms(name, district);

-- Data sync log
CREATE TABLE IF NOT EXISTS data_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  records_added INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  error_msg TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Seed baby care rooms data (全港母嬰室)
-- ===== 港島 - 中西區 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('IFC 國際金融中心商場', 'IFC Mall', '中西區', '港島', '中環金融街8號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('置地廣場', 'The Landmark', '中西區', '港島', '中環皇后大道中15號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('太子大廈', 'Prince''s Building', '中西區', '港島', '中環遮打道10號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('中環中心', 'The Center', '中西區', '港島', '皇后大道中99號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('西港城', 'Western Market', '中西區', '港島', '上環德輔道中323號', '商場', '["換片台"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵中環站', 'MTR Central Station', '中西區', '港島', '中環畢打街', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵香港站', 'MTR Hong Kong Station', '中西區', '港島', '中環民耀街', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('中西區健康院', 'Central & Western Health Centre', '中西區', '港島', '西營盤皇后大道西134號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('香港大會堂', 'Hong Kong City Hall', '中西區', '港島', '中環愛丁堡廣場5號', '政府', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('山頂廣場', 'The Peak Galleria', '中西區', '港島', '山頂道118號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('凌霄閣', 'Peak Tower', '中西區', '港島', '山頂山頂道128號', '商場', '["換片台","洗手盆"]');

-- ===== 港島 - 灣仔 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('太古廣場', 'Pacific Place', '灣仔', '港島', '金鐘道88號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('金鐘廊', 'Queensway Plaza', '灣仔', '港島', '金鐘道93號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('灣仔電腦城', 'Wan Chai Computer Centre', '灣仔', '港島', '灣仔軒尼詩道130號', '商場', '["換片台"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('合和中心', 'Hopewell Centre', '灣仔', '港島', '灣仔皇后大道東183號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('利東街', 'Lee Tung Avenue', '灣仔', '港島', '灣仔皇后大道東200號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵金鐘站', 'MTR Admiralty Station', '灣仔', '港島', '金鐘夏慤道', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵灣仔站', 'MTR Wan Chai Station', '灣仔', '港島', '灣仔軒尼詩道', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('灣仔母嬰健康院', 'Wan Chai MCHC', '灣仔', '港島', '灣仔石水渠街12號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('入境事務處總部', 'Immigration Tower', '灣仔', '港島', '灣仔告士打道7號', '政府', '["換片台","洗手盆"]');

-- ===== 港島 - 東區 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('太古城中心', 'Cityplaza', '東區', '港島', '太古城太古城道18號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('康怡廣場', 'Kornhill Plaza', '東區', '港島', '鰂魚涌康山道2號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港島東中心', 'One Island East', '東區', '港島', '太古坊鰂魚涌英皇道979號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('杏花新城', 'Paradise Mall', '東區', '港島', '柴灣盛泰道100號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('新翠商場', 'Aldrich Garden Shopping Centre', '東區', '港島', '筲箕灣愛秩序灣道18號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵太古站', 'MTR Tai Koo Station', '東區', '港島', '太古康山道', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('柴灣母嬰健康院', 'Chai Wan MCHC', '東區', '港島', '柴灣翠灣街18號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('東區醫院', 'Pamela Youde Nethersole Eastern Hospital', '東區', '港島', '柴灣樂民道3號', '醫院', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 港島 - 南區 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('數碼港商場', 'Cyberport Arcade', '南區', '港島', '數碼港道100號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('淺水灣影灣園', 'The Repulse Bay', '南區', '港島', '淺水灣灘道109號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('赤柱廣場', 'Stanley Plaza', '南區', '港島', '赤柱佳美道23號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('香港仔中心', 'Aberdeen Centre', '南區', '港島', '香港仔南寧街9號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('利東商場', 'Lei Tung Commercial Centre', '南區', '港島', '鴨脷洲利東邨道', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('海洋公園', 'Ocean Park', '南區', '港島', '黃竹坑道180號', '其他', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 港島 - 銅鑼灣/灣仔 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('時代廣場', 'Times Square', '灣仔', '港島', '銅鑼灣勿地臣街1號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('希慎廣場', 'Hysan Place', '灣仔', '港島', '銅鑼灣軒尼詩道500號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('銅鑼灣廣場', 'Causeway Bay Plaza', '灣仔', '港島', '銅鑼灣軒尼詩道489號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('皇室堡', 'Windsor House', '灣仔', '港島', '銅鑼灣告士打道311號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('世貿中心', 'World Trade Centre', '灣仔', '港島', '銅鑼灣告士打道280號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('崇光百貨 (銅鑼灣)', 'SOGO Causeway Bay', '灣仔', '港島', '銅鑼灣軒尼詩道555號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵銅鑼灣站', 'MTR Causeway Bay Station', '灣仔', '港島', '銅鑼灣軒尼詩道', '交通', '["換片台","洗手盆"]');

-- ===== 九龍 - 油尖旺 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('海港城', 'Harbour City', '油尖旺', '九龍', '尖沙咀廣東道3-27號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('1881 Heritage', '1881 Heritage', '油尖旺', '九龍', '尖沙咀廣東道2A號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('K11 MUSEA', 'K11 MUSEA', '油尖旺', '九龍', '尖沙咀梳士巴利道18號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應","微波爐"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('K11 Art Mall', 'K11 Art Mall', '油尖旺', '九龍', '尖沙咀河內道18號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('iSQUARE 國際廣場', 'iSQUARE', '油尖旺', '九龍', '尖沙咀彌敦道63號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('The ONE', 'The ONE', '油尖旺', '九龍', '尖沙咀彌敦道100號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('美麗華商場', 'Mira Place', '油尖旺', '九龍', '尖沙咀彌敦道132號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('DFS T廣場 (廣東道)', 'DFS T Galleria', '油尖旺', '九龍', '尖沙咀廣東道28號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('中港城', 'China Hong Kong City', '油尖旺', '九龍', '尖沙咀廣東道33號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('新世紀廣場', 'Grand Century Place', '油尖旺', '九龍', '旺角太子道西193號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('朗豪坊', 'Langham Place', '油尖旺', '九龍', '旺角亞皆老街8號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('MOKO 新世紀廣場', 'MOKO', '油尖旺', '九龍', '旺角太子道西193號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('圓方', 'Elements', '油尖旺', '九龍', '柯士甸道西1號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵尖沙咀站', 'MTR Tsim Sha Tsui Station', '油尖旺', '九龍', '尖沙咀彌敦道', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵旺角站', 'MTR Mong Kok Station', '油尖旺', '九龍', '旺角彌敦道', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵九龍站', 'MTR Kowloon Station', '油尖旺', '九龍', '柯士甸道西', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('油麻地母嬰健康院', 'Yau Ma Tei MCHC', '油尖旺', '九龍', '油麻地炮台街145號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 九龍 - 深水埗 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('西九龍中心', 'Dragon Centre', '深水埗', '九龍', '深水埗欽州街37K號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('V Walk', 'V Walk', '深水埗', '九龍', '深水埗深旺道28號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵南昌站', 'MTR Nam Cheong Station', '深水埗', '九龍', '深水埗深旺道', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('長沙灣母嬰健康院', 'Cheung Sha Wan MCHC', '深水埗', '九龍', '長沙灣長裕街8號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 九龍 - 九龍城 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('又一城', 'Festival Walk', '九龍城', '九龍', '九龍塘達之路80號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('黃埔新天地', 'Whampoa Garden', '九龍城', '九龍', '紅磡黃埔花園德安街', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('Mikiki', 'Mikiki', '九龍城', '九龍', '新蒲崗太子道東638號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('啟德郵輪碼頭', 'Kai Tak Cruise Terminal', '九龍城', '九龍', '啟德承豐道33號', '其他', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵九龍塘站', 'MTR Kowloon Tong Station', '九龍城', '九龍', '九龍塘多福道', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('伊利沙伯醫院', 'Queen Elizabeth Hospital', '九龍城', '九龍', '京士柏加士居道30號', '醫院', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('紅磡母嬰健康院', 'Hung Hom MCHC', '九龍城', '九龍', '紅磡差館里22號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 九龍 - 黃大仙 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('黃大仙中心', 'Temple Mall', '黃大仙', '九龍', '黃大仙龍翔道136號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('荷里活廣場', 'Hollywood Plaza', '黃大仙', '九龍', '鑽石山龍蟠街3號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('現崇山商場', 'Aria', '黃大仙', '九龍', '慈雲山毓華街23號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('樂富廣場', 'Lok Fu Place', '黃大仙', '九龍', '樂富橫頭磡聯合道198號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵黃大仙站', 'MTR Wong Tai Sin Station', '黃大仙', '九龍', '黃大仙龍翔道', '交通', '["換片台","洗手盆"]');

-- ===== 九龍 - 觀塘 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('apm', 'apm', '觀塘', '九龍', '觀塘觀塘道418號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('MegaBox', 'MegaBox', '觀塘', '九龍', '九龍灣宏照道38號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('德福廣場', 'Telford Plaza', '觀塘', '九龍', '九龍灣偉業街33號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('淘大商場', 'Amoy Plaza', '觀塘', '九龍', '九龍灣牛頭角道77號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('裕民坊', 'Yue Man Square', '觀塘', '九龍', '觀塘裕民坊', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('觀塘廣場', 'Kwun Tong Plaza', '觀塘', '九龍', '觀塘開源道72號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('創紀之城五期', 'Millennium City 5', '觀塘', '九龍', '觀塘觀塘道378號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵觀塘站', 'MTR Kwun Tong Station', '觀塘', '九龍', '觀塘觀塘道', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('觀塘母嬰健康院', 'Kwun Tong MCHC', '觀塘', '九龍', '觀塘翠屏道3號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('聯合醫院', 'United Christian Hospital', '觀塘', '九龍', '觀塘協和街130號', '醫院', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 新界 - 沙田 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('新城市廣場', 'New Town Plaza', '沙田', '新界', '沙田正街18號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('沙田中心', 'Sha Tin Centre', '沙田', '新界', '沙田正街2-16號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('HomeSquare', 'HomeSquare', '沙田', '新界', '沙田沙田鄉事會路138號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('馬鞍山廣場', 'Ma On Shan Plaza', '沙田', '新界', '馬鞍山鞍祿街18號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('新港城中心', 'Sunshine City Plaza', '沙田', '新界', '馬鞍山鞍誠街18號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('連城廣場', 'Link Square', '沙田', '新界', '大圍車公廟路68號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵沙田站', 'MTR Sha Tin Station', '沙田', '新界', '沙田排頭街', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('沙田母嬰健康院', 'Sha Tin MCHC', '沙田', '新界', '沙田大圍文禮路12號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('威爾斯親王醫院', 'Prince of Wales Hospital', '沙田', '新界', '沙田銀城街30-32號', '醫院', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 新界 - 荃灣 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('荃灣廣場', 'Tsuen Wan Plaza', '荃灣', '新界', '荃灣大河道88號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('荃新天地', 'Citywalk', '荃灣', '新界', '荃灣楊屋道1號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('如心廣場', 'Nina Tower', '荃灣', '新界', '荃灣楊屋道8號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('D.PARK 愉景新城', 'D.PARK', '荃灣', '新界', '荃灣青山公路398號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應","兒童遊樂區"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('南豐紗廠', 'The Mills', '荃灣', '新界', '荃灣白田壩街45號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵荃灣站', 'MTR Tsuen Wan Station', '荃灣', '新界', '荃灣西樓角路', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('荃灣母嬰健康院', 'Tsuen Wan MCHC', '荃灣', '新界', '荃灣蕙荃路22-66號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 新界 - 葵青 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('新都會廣場', 'Metroplaza', '葵青', '新界', '葵芳興芳路223號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('葵涌廣場', 'Kwai Chung Plaza', '葵青', '新界', '葵涌葵富路7-11號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('青衣城', 'Maritime Square', '葵青', '新界', '青衣青敬路33號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵葵芳站', 'MTR Kwai Fong Station', '葵青', '新界', '葵芳興芳路', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('瑪嘉烈醫院', 'Princess Margaret Hospital', '葵青', '新界', '葵涌荔景山路2-10號', '醫院', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 新界 - 屯門 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('屯門市廣場', 'Tuen Mun Town Plaza', '屯門', '新界', '屯門屯順街1號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('V city', 'V city', '屯門', '新界', '屯門屯門鄉事會路83號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('屯門時代廣場', 'Tuen Mun Times Square', '屯門', '新界', '屯門屯門鄉事會路2號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('黃金海岸商場', 'Gold Coast Piazza', '屯門', '新界', '屯門掃管笏青山公路1號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵屯門站', 'MTR Tuen Mun Station', '屯門', '新界', '屯門杯渡路', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('屯門母嬰健康院', 'Tuen Mun MCHC', '屯門', '新界', '屯門屯利街6號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('屯門醫院', 'Tuen Mun Hospital', '屯門', '新界', '屯門青松觀路23號', '醫院', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 新界 - 元朗 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('YOHO MALL 形點', 'YOHO MALL', '元朗', '新界', '元朗朗日路9號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('元朗廣場', 'Yuen Long Plaza', '元朗', '新界', '元朗青山公路249-251號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('新元朗中心', 'Sun Yuen Long Centre', '元朗', '新界', '元朗青山公路269號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('天水圍嘉湖銀座', 'Kingswood Ginza', '元朗', '新界', '天水圍天恩路12-18號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('+WOO嘉湖', '+WOO Kingswood', '元朗', '新界', '天水圍天華路30-33號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵元朗站', 'MTR Yuen Long Station', '元朗', '新界', '元朗朗日路', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('元朗母嬰健康院', 'Yuen Long MCHC', '元朗', '新界', '元朗青山公路150號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 新界 - 北區 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('上水廣場', 'Landmark North', '北區', '新界', '上水龍琛路39號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('粉嶺名都', 'Fanling Town Center', '北區', '新界', '粉嶺車站路18號', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('彩園廣場', 'Choi Yuen Plaza', '北區', '新界', '上水彩園路', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵上水站', 'MTR Sheung Shui Station', '北區', '新界', '上水新運路', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('粉嶺母嬰健康院', 'Fanling MCHC', '北區', '新界', '粉嶺璧峰路2號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('北區醫院', 'North District Hospital', '北區', '新界', '上水保健路9號', '醫院', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 新界 - 大埔 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('大埔超級城', 'Tai Po Mega Mall', '大埔', '新界', '大埔安邦路8-10號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('大埔廣場', 'Tai Po Plaza', '大埔', '新界', '大埔新達廣場', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵大埔墟站', 'MTR Tai Po Market Station', '大埔', '新界', '大埔南運路', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('大埔母嬰健康院', 'Tai Po MCHC', '大埔', '新界', '大埔汀角路6號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 新界 - 西貢 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('將軍澳廣場', 'TKO Gateway', '西貢', '新界', '將軍澳唐德街1號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('PopCorn 商場', 'PopCorn', '西貢', '新界', '將軍澳唐賢街9號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('東港城', 'East Point City', '西貢', '新界', '將軍澳唐明街1號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('新都城中心', 'Metro City Plaza', '西貢', '新界', '將軍澳寶林邨貿業路8號', '商場', '["換片台","哺乳椅","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('將軍澳中心', 'Park Central', '西貢', '新界', '將軍澳唐賢街', '商場', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵將軍澳站', 'MTR Tseung Kwan O Station', '西貢', '新界', '將軍澳唐賢街', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('將軍澳母嬰健康院', 'Tseung Kwan O MCHC', '西貢', '新界', '將軍澳寶寧路22號', '政府', '["換片台","哺乳椅","洗手盆","熱水供應"]');

-- ===== 新界 - 離島 =====
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('東薈城名店倉', 'Citygate Outlets', '離島', '新界', '東涌達東路20號', '商場', '["換片台","哺乳椅","洗手盆","熱水供應"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('昂坪360市集', 'Ngong Ping Village', '離島', '新界', '大嶼山昂坪', '其他', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('香港迪士尼樂園', 'Hong Kong Disneyland', '離島', '新界', '大嶼山竹篙灣', '其他', '["換片台","哺乳椅","洗手盆","熱水供應","微波爐"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵東涌站', 'MTR Tung Chung Station', '離島', '新界', '東涌達東路', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('港鐵迪士尼站', 'MTR Disneyland Resort Station', '離島', '新界', '大嶼山迪士尼', '交通', '["換片台","洗手盆"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('香港國際機場', 'Hong Kong International Airport', '離島', '新界', '赤鱲角翔天路1號', '交通', '["換片台","哺乳椅","洗手盆","熱水供應","微波爐"]');
INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities) VALUES ('北大嶼山醫院', 'North Lantau Hospital', '離島', '新界', '東涌松仁路8號', '醫院', '["換片台","哺乳椅","洗手盆","熱水供應"]');
