import { Hono } from 'hono';
import type { Bindings } from '../index';

export const exportRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/export/pdf?type=weekly&from=YYYY-MM-DD&to=YYYY-MM-DD&sections=feed,diaper,sleep,growth
exportRoutes.get('/pdf', async (c) => {
  const db = c.env.DB;
  const from = c.req.query('from');
  const to = c.req.query('to');
  const sections = (c.req.query('sections') || 'feed,diaper,sleep,growth,temperature').split(',');

  if (!from || !to) {
    return c.json({ error: 'from and to dates are required' }, 400);
  }

  const baby = await db.prepare('SELECT * FROM baby WHERE id = 1').first<any>();
  if (!baby) return c.json({ error: 'No baby profile found' }, 404);

  // Calculate age
  const birthDate = new Date(baby.birth_date);
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const ageDaysStart = Math.floor((fromDate.getTime() - birthDate.getTime()) / 86400000);
  const ageDaysEnd = Math.floor((toDate.getTime() - birthDate.getTime()) / 86400000);

  let feedSummary = null;
  let diaperSummary = null;
  let sleepSummary = null;
  let growthData = null;
  let tempSummary = null;

  if (sections.includes('feed')) {
    const feeds = await db.prepare(`
      SELECT COUNT(*) as count, SUM(amount_ml) as total_ml, AVG(amount_ml) as avg_ml
      FROM feeds WHERE date(time) BETWEEN ? AND ?
    `).bind(from, to).first<any>();
    const days = Math.max(1, (toDate.getTime() - fromDate.getTime()) / 86400000 + 1);
    feedSummary = {
      daily_avg_ml: Math.round((feeds.total_ml || 0) / days),
      avg_per_feed: Math.round(feeds.avg_ml || 0),
      daily_feeds: Math.round(feeds.count / days * 10) / 10,
    };
  }

  if (sections.includes('diaper')) {
    const diapers = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN type IN ('pee','both') THEN 1 ELSE 0 END) as pee,
        SUM(CASE WHEN type IN ('poo','both') THEN 1 ELSE 0 END) as poo
      FROM diapers WHERE date(time) BETWEEN ? AND ?
    `).bind(from, to).first<any>();
    const days = Math.max(1, (toDate.getTime() - fromDate.getTime()) / 86400000 + 1);
    diaperSummary = {
      daily_pee: Math.round(diapers.pee / days * 10) / 10,
      daily_poo: Math.round(diapers.poo / days * 10) / 10,
    };
  }

  if (sections.includes('sleep')) {
    const sleeps = await db.prepare(`
      SELECT * FROM sleeps
      WHERE date(start_time) BETWEEN ? AND ? AND end_time IS NOT NULL
    `).bind(from, to).all();
    let totalMin = 0, longest = 0;
    for (const s of sleeps.results as any[]) {
      const dur = (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000;
      totalMin += dur;
      if (dur > longest) longest = dur;
    }
    const days = Math.max(1, (toDate.getTime() - fromDate.getTime()) / 86400000 + 1);
    sleepSummary = {
      daily_hours: Math.round(totalMin / 60 / days * 10) / 10,
      longest_hours: Math.round(longest / 60 * 10) / 10,
    };
  }

  if (sections.includes('growth')) {
    const g = await db.prepare(
      'SELECT * FROM growth WHERE date BETWEEN ? AND ? ORDER BY date DESC LIMIT 1'
    ).bind(from, to).first<any>();
    growthData = g;
  }

  if (sections.includes('temperature')) {
    const temps = await db.prepare(`
      SELECT
        COUNT(*) as count,
        ROUND(MAX(temperature), 1) as max_temp,
        ROUND(MIN(temperature), 1) as min_temp,
        ROUND(AVG(temperature), 1) as avg_temp,
        SUM(CASE WHEN fever = 1 THEN 1 ELSE 0 END) as fever_count
      FROM temperatures WHERE date(time) BETWEEN ? AND ?
    `).bind(from, to).first<any>();
    if (temps && temps.count > 0) {
      tempSummary = temps;
    }
  }

  // Generate HTML-based PDF
  const html = generatePdfHtml({
    babyName: baby.name,
    from, to,
    ageDaysStart, ageDaysEnd,
    feedSummary, diaperSummary, sleepSummary, growthData, tempSummary,
  });

  return c.html(html, 200, {
    'Content-Type': 'text/html; charset=utf-8',
  });
});

// Preview endpoint returns JSON summary
exportRoutes.get('/preview', async (c) => {
  const db = c.env.DB;
  const from = c.req.query('from');
  const to = c.req.query('to');
  const sections = (c.req.query('sections') || 'feed,diaper,sleep,growth,temperature').split(',');

  if (!from || !to) {
    return c.json({ error: 'from and to dates are required' }, 400);
  }

  const baby = await db.prepare('SELECT * FROM baby WHERE id = 1').first<any>();
  const birthDate = new Date(baby.birth_date);
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const ageDaysStart = Math.floor((fromDate.getTime() - birthDate.getTime()) / 86400000);
  const ageDaysEnd = Math.floor((toDate.getTime() - birthDate.getTime()) / 86400000);

  const result: any = { babyName: baby.name, from, to, ageDaysStart, ageDaysEnd };

  if (sections.includes('feed')) {
    const feeds = await db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(amount_ml),0) as total_ml, COALESCE(AVG(amount_ml),0) as avg_ml
      FROM feeds WHERE date(time) BETWEEN ? AND ?
    `).bind(from, to).first<any>();
    const days = Math.max(1, (toDate.getTime() - fromDate.getTime()) / 86400000 + 1);
    result.feed = {
      daily_avg_ml: Math.round((feeds.total_ml || 0) / days),
      avg_per_feed: Math.round(feeds.avg_ml || 0),
      daily_feeds: Math.round(feeds.count / days * 10) / 10,
    };
  }

  if (sections.includes('diaper')) {
    const diapers = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN type IN ('pee','both') THEN 1 ELSE 0 END) as pee,
        SUM(CASE WHEN type IN ('poo','both') THEN 1 ELSE 0 END) as poo
      FROM diapers WHERE date(time) BETWEEN ? AND ?
    `).bind(from, to).first<any>();
    const days = Math.max(1, (toDate.getTime() - fromDate.getTime()) / 86400000 + 1);
    result.diaper = {
      daily_pee: Math.round((diapers.pee || 0) / days * 10) / 10,
      daily_poo: Math.round((diapers.poo || 0) / days * 10) / 10,
    };
  }

  if (sections.includes('sleep')) {
    const sleeps = await db.prepare(`
      SELECT * FROM sleeps WHERE date(start_time) BETWEEN ? AND ? AND end_time IS NOT NULL
    `).bind(from, to).all();
    let totalMin = 0, longest = 0;
    for (const s of sleeps.results as any[]) {
      const dur = (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000;
      totalMin += dur;
      if (dur > longest) longest = dur;
    }
    const days = Math.max(1, (toDate.getTime() - fromDate.getTime()) / 86400000 + 1);
    result.sleep = {
      daily_hours: Math.round(totalMin / 60 / days * 10) / 10,
      longest_hours: Math.round(longest / 60 * 10) / 10,
    };
  }

  if (sections.includes('growth')) {
    const g = await db.prepare(
      'SELECT * FROM growth WHERE date BETWEEN ? AND ? ORDER BY date DESC LIMIT 1'
    ).bind(from, to).first();
    result.growth = g || null;
  }

  if (sections.includes('temperature')) {
    const temps = await db.prepare(`
      SELECT
        COUNT(*) as count,
        ROUND(MAX(temperature), 1) as max_temp,
        ROUND(MIN(temperature), 1) as min_temp,
        ROUND(AVG(temperature), 1) as avg_temp,
        SUM(CASE WHEN fever = 1 THEN 1 ELSE 0 END) as fever_count
      FROM temperatures WHERE date(time) BETWEEN ? AND ?
    `).bind(from, to).first<any>();
    result.temperature = (temps && temps.count > 0) ? temps : null;
  }

  return c.json(result);
});

function generatePdfHtml(data: {
  babyName: string;
  from: string; to: string;
  ageDaysStart: number; ageDaysEnd: number;
  feedSummary: any; diaperSummary: any; sleepSummary: any; growthData: any; tempSummary: any;
}): string {
  const formatDate = (d: string) => {
    const date = new Date(d);
    return `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日`;
  };

  let sections = '';

  if (data.feedSummary) {
    sections += `
    <div class="section">
      <h2>飲奶摘要</h2>
      <div class="row"><span>每日平均奶量</span><span>${data.feedSummary.daily_avg_ml} ml</span></div>
      <div class="row"><span>每餐平均</span><span>${data.feedSummary.avg_per_feed} ml</span></div>
      <div class="row"><span>每日餵奶次數</span><span>${data.feedSummary.daily_feeds} 次</span></div>
    </div>`;
  }

  if (data.diaperSummary) {
    sections += `
    <div class="section">
      <h2>換片摘要</h2>
      <div class="row"><span>每日小便</span><span>${data.diaperSummary.daily_pee} 次</span></div>
      <div class="row"><span>每日大便</span><span>${data.diaperSummary.daily_poo} 次</span></div>
    </div>`;
  }

  if (data.sleepSummary) {
    sections += `
    <div class="section">
      <h2>睡眠摘要</h2>
      <div class="row"><span>每日總睡眠</span><span>${data.sleepSummary.daily_hours} 小時</span></div>
      <div class="row"><span>最長連續</span><span>${data.sleepSummary.longest_hours} 小時</span></div>
    </div>`;
  }

  if (data.growthData) {
    sections += `
    <div class="section">
      <h2>成長數據</h2>
      ${data.growthData.weight ? `<div class="row"><span>體重</span><span>${data.growthData.weight} kg</span></div>` : ''}
      ${data.growthData.height ? `<div class="row"><span>身高</span><span>${data.growthData.height} cm</span></div>` : ''}
      ${data.growthData.head_circumference ? `<div class="row"><span>頭圍</span><span>${data.growthData.head_circumference} cm</span></div>` : ''}
    </div>`;
  }

  if (data.tempSummary) {
    sections += `
    <div class="section">
      <h2>體溫記錄</h2>
      <div class="row"><span>量度次數</span><span>${data.tempSummary.count} 次</span></div>
      <div class="row"><span>最高體溫</span><span>${data.tempSummary.max_temp}°C</span></div>
      <div class="row"><span>最低體溫</span><span>${data.tempSummary.min_temp}°C</span></div>
      <div class="row"><span>平均體溫</span><span>${data.tempSummary.avg_temp}°C</span></div>
      ${data.tempSummary.fever_count > 0 ? `<div class="row"><span style="color:#F43530">發燒次數</span><span style="color:#F43530;font-weight:700">${data.tempSummary.fever_count} 次</span></div>` : '<div class="row"><span>發燒次數</span><span>0 次</span></div>'}
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-Hant-HK">
<head>
<meta charset="UTF-8">
<title>${data.babyName} — 健康報告</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: "PingFang HK", "Microsoft JhengHei", sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: linear-gradient(135deg, #10AEFF, #0085D1); color: #fff; padding: 24px; border-radius: 12px; margin-bottom: 20px; }
  .header h1 { margin: 0 0 8px; font-size: 22px; }
  .header p { margin: 4px 0; font-size: 14px; opacity: 0.9; }
  .section { background: #fff; border: 1px solid #eee; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
  .section h2 { font-size: 16px; color: #10AEFF; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
  .row span:last-child { font-weight: 600; }
  @media print { body { padding: 0; } .header { break-inside: avoid; } .section { break-inside: avoid; } }
</style>
</head>
<body>
<div class="header">
  <h1>${data.babyName} — 健康報告</h1>
  <p>${formatDate(data.from)} 至 ${formatDate(data.to)}</p>
  <p>出生第 ${data.ageDaysStart}–${data.ageDaysEnd} 天</p>
</div>
${sections}
<p style="text-align:center;color:#999;font-size:12px;margin-top:24px;">由可樂仔健康記錄 App 生成</p>
</body>
</html>`;
}
