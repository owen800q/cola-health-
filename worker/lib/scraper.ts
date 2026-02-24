// BBGAGA.com scraper for Hong Kong baby care rooms
// Fetches room listings from region/district pages and upserts into D1

export interface SyncResult {
  status: 'success' | 'partial' | 'failed';
  records_added: number;
  records_updated: number;
  error_msg?: string;
}

interface ScrapedRoom {
  name: string;
  name_en?: string;
  district: string;
  region: string;
  address?: string;
  type: string;
  source_url: string;
}

// Map BBGAGA region names to our region values
const REGION_MAP: Record<string, string> = {
  'Hong Kong Island': '港島',
  'hong kong island': '港島',
  'Kowloon': '九龍',
  'kowloon': '九龍',
  'New Territories': '新界',
  'new territories': '新界',
};

// District Chinese name mapping
const DISTRICT_EN_TO_ZH: Record<string, string> = {
  'Central': '中西區', 'Admiralty': '中西區', 'Sheung Wan': '中西區',
  'Wan Chai': '灣仔', 'Causeway Bay': '灣仔', 'Happy Valley': '灣仔',
  'North Point': '東區', 'Quarry Bay': '東區', 'Tai Koo': '東區',
  'Chai Wan': '東區', 'Shau Kei Wan': '東區', 'Sai Wan Ho': '東區',
  'Aberdeen': '南區', 'Stanley': '南區', 'Ap Lei Chau': '南區', 'Repulse Bay': '南區',
  'Tsim Sha Tsui': '油尖旺', 'Mong Kok': '油尖旺', 'Jordan': '油尖旺', 'Yau Ma Tei': '油尖旺',
  'Sham Shui Po': '深水埗', 'Cheung Sha Wan': '深水埗',
  'Kowloon City': '九龍城', 'Hung Hom': '九龍城', 'Kowloon Tong': '九龍城', 'Ho Man Tin': '九龍城',
  'Wong Tai Sin': '黃大仙', 'Diamond Hill': '黃大仙', 'Lok Fu': '黃大仙',
  'Kwun Tong': '觀塘', 'Ngau Tau Kok': '觀塘', 'Lam Tin': '觀塘', 'Yau Tong': '觀塘',
  'Sha Tin': '沙田', 'Ma On Shan': '沙田', 'Tai Wai': '沙田',
  'Tsuen Wan': '荃灣',
  'Kwai Chung': '葵青', 'Tsing Yi': '葵青',
  'Tuen Mun': '屯門',
  'Yuen Long': '元朗', 'Tin Shui Wai': '元朗',
  'Sheung Shui': '北區', 'Fanling': '北區',
  'Tai Po': '大埔',
  'Tseung Kwan O': '西貢', 'Sai Kung': '西貢',
  'Tung Chung': '離島', 'Discovery Bay': '離島', 'Disney': '離島',
};

const REGIONS_TO_SCRAPE = [
  { url: 'https://bbgaga.com/en/babyroom/region/Hong%20Kong%20Island', region: '港島' },
  { url: 'https://bbgaga.com/en/babyroom/region/Kowloon', region: '九龍' },
  { url: 'https://bbgaga.com/en/babyroom/region/New%20Territories', region: '新界' },
];

function guessType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('mtr') || lower.includes('station') || lower.includes('港鐵') || lower.includes('機場') || lower.includes('airport') || lower.includes('ferry') || lower.includes('碼頭')) return '交通';
  if (lower.includes('hospital') || lower.includes('醫院')) return '醫院';
  if (lower.includes('health') || lower.includes('government') || lower.includes('健康院') || lower.includes('政府') || lower.includes('library') || lower.includes('圖書館')) return '政府';
  return '商場';
}

function extractDistrictFromUrl(url: string): string {
  const match = url.match(/\/district\/([^/?#]+)/);
  if (match) return decodeURIComponent(match[1]);
  return '';
}

function mapDistrict(rawDistrict: string): string {
  // Try direct match in mapping
  if (DISTRICT_EN_TO_ZH[rawDistrict]) return DISTRICT_EN_TO_ZH[rawDistrict];
  // Already a Chinese district name
  const zhDistricts = ['中西區','灣仔','東區','南區','油尖旺','深水埗','九龍城','黃大仙','觀塘','沙田','荃灣','葵青','屯門','元朗','北區','大埔','西貢','離島'];
  if (zhDistricts.includes(rawDistrict)) return rawDistrict;
  // Fuzzy match
  for (const [en, zh] of Object.entries(DISTRICT_EN_TO_ZH)) {
    if (rawDistrict.toLowerCase().includes(en.toLowerCase())) return zh;
  }
  return rawDistrict;
}

// Parse room listings from BBGAGA HTML (region page)
function parseRegionPage(html: string): string[] {
  // Extract district links from the region page
  const links: string[] = [];
  const regex = /href="(\/en\/babyroom\/district\/[^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.push('https://bbgaga.com' + match[1]);
  }
  return [...new Set(links)];
}

// Parse individual room entries from a district page
function parseDistrictPage(html: string, districtUrl: string, region: string): ScrapedRoom[] {
  const rooms: ScrapedRoom[] = [];
  const rawDistrict = extractDistrictFromUrl(districtUrl);
  const district = mapDistrict(rawDistrict);

  // Match room name links - BBGAGA uses patterns like:
  // <a href="/en/babyroom/RoomName">Room Name</a>
  // or room entries in list format
  const roomRegex = /href="\/en\/babyroom\/([^/"]+)"[^>]*>([^<]+)<\/a>/g;
  let match;
  const seen = new Set<string>();

  while ((match = roomRegex.exec(html)) !== null) {
    const slug = decodeURIComponent(match[1]);
    const name = match[2].trim();

    // Skip navigation/district/region links
    if (slug === 'report' || slug.startsWith('region/') || slug.startsWith('district/') || !name || name.length < 2) continue;
    // Skip duplicate entries
    if (seen.has(name)) continue;
    seen.add(name);

    rooms.push({
      name,
      district,
      region,
      type: guessType(name),
      source_url: `https://bbgaga.com/en/babyroom/${encodeURIComponent(slug)}`,
    });
  }

  return rooms;
}

async function fetchWithRetry(url: string, retries = 2): Promise<string> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'BabyTracker/1.0 (baby care room directory)' },
      });
      if (res.ok) return await res.text();
      if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    } catch {
      if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

export async function scrapeAndSync(db: D1Database): Promise<SyncResult> {
  // Log start
  await db.prepare(
    `INSERT INTO data_sync_log (sync_type, status) VALUES ('babyrooms_full', 'in_progress')`
  ).run();

  let added = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const { url, region } of REGIONS_TO_SCRAPE) {
    try {
      const regionHtml = await fetchWithRetry(url);
      const districtLinks = parseRegionPage(regionHtml);

      for (const districtUrl of districtLinks) {
        try {
          // Throttle requests
          await new Promise(r => setTimeout(r, 500));

          const districtHtml = await fetchWithRetry(districtUrl);
          const rooms = parseDistrictPage(districtHtml, districtUrl, region);

          for (const room of rooms) {
            try {
              const existing = await db.prepare(
                `SELECT id FROM babycare_rooms WHERE name = ? AND district = ?`
              ).bind(room.name, room.district).first();

              if (existing) {
                await db.prepare(
                  `UPDATE babycare_rooms SET source = 'bbgaga', source_url = ?, updated_at = datetime('now') WHERE id = ?`
                ).bind(room.source_url, existing.id).run();
                updated++;
              } else {
                await db.prepare(
                  `INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, source, source_url) VALUES (?, ?, ?, ?, ?, ?, 'bbgaga', ?)`
                ).bind(room.name, room.name_en || null, room.district, room.region, room.address || null, room.type, room.source_url).run();
                added++;
              }
            } catch {
              // Skip individual room errors
            }
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Unknown';
          errors.push(`District ${districtUrl}: ${msg}`);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown';
      errors.push(`Region ${url}: ${msg}`);
    }
  }

  const status = errors.length === 0 ? 'success' : (added > 0 || updated > 0 ? 'partial' : 'failed');
  const errorMsg = errors.length > 0 ? errors.slice(0, 5).join('; ') : null;

  // Update sync log
  await db.prepare(
    `UPDATE data_sync_log SET status = ?, records_added = ?, records_updated = ?, error_msg = ?, completed_at = datetime('now') WHERE id = (SELECT MAX(id) FROM data_sync_log WHERE sync_type = 'babyrooms_full')`
  ).bind(status, added, updated, errorMsg).run();

  return { status, records_added: added, records_updated: updated, error_msg: errorMsg || undefined };
}

export async function shouldSync(db: D1Database): Promise<boolean> {
  const lastSync = await db.prepare(
    `SELECT started_at FROM data_sync_log WHERE sync_type = 'babyrooms_full' AND status IN ('success', 'partial') ORDER BY id DESC LIMIT 1`
  ).first();

  if (!lastSync?.started_at) return true;

  const lastTime = new Date(lastSync.started_at as string).getTime();
  const hoursSince = (Date.now() - lastTime) / (1000 * 60 * 60);
  return hoursSince > 20; // Sync if more than 20 hours since last
}
