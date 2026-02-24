import { Hono } from 'hono';
import type { Bindings } from '../index';
import { GeminiClient, parseCookies } from '../lib/gemini';

export const aiRoutes = new Hono<{ Bindings: Bindings }>();

const TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

// Track whether we've agreed to the Meta license for the vision model
let visionLicenseAgreed = false;

async function ensureVisionLicense(ai: any) {
  if (visionLicenseAgreed) return;
  try {
    await ai.run(VISION_MODEL, { prompt: 'agree' });
  } catch (e) {
    // May throw if already agreed — that's fine
  }
  visionLicenseAgreed = true;
}

function buildSystemPrompt(
  baby: any,
  todayFeeds: any[],
  todayDiapers: any[],
  todaySleeps: any[],
  latestGrowth: any,
  pendingVaccines: any[],
  recentFeedStats: any,
): string {
  const now = new Date();
  const birthDate = baby?.birth_date ? new Date(baby.birth_date) : null;
  const ageInDays = birthDate ? Math.floor((now.getTime() - birthDate.getTime()) / 86400000) : 0;
  const ageMonths = birthDate ? Math.floor(ageInDays / 30.44) : 0;

  const feedTotal = todayFeeds.reduce((s: number, f: any) => s + (f.amount_ml || 0), 0);
  const feedSummary = todayFeeds.length > 0
    ? `今日已餵 ${todayFeeds.length} 次，共 ${feedTotal}ml`
    : '今日尚未餵奶';
  const feedDetails = todayFeeds.map((f: any) => {
    const t = new Date(f.time);
    return `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')} - ${f.amount_ml}ml${f.note ? ' (' + f.note + ')' : ''}`;
  }).join('\n');

  const diaperTypeMap: Record<string, string> = { pee: '小便', poo: '大便', both: '大便+小便', dry: '乾淨' };
  const diaperSummary = todayDiapers.length > 0
    ? `今日換片 ${todayDiapers.length} 次`
    : '今日尚未換片';
  const diaperDetails = todayDiapers.map((d: any) => {
    const t = new Date(d.time);
    return `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')} - ${diaperTypeMap[d.type] || d.type}${d.color ? '，' + d.color : ''}${d.texture ? '，' + d.texture : ''}`;
  }).join('\n');

  let sleepTotal = 0;
  const sleepDetails = todaySleeps.map((s: any) => {
    const st = new Date(s.start_time);
    if (s.end_time) {
      const et = new Date(s.end_time);
      const durMin = Math.round((et.getTime() - st.getTime()) / 60000);
      sleepTotal += durMin;
      return `${st.getHours()}:${String(st.getMinutes()).padStart(2, '0')} - ${et.getHours()}:${String(et.getMinutes()).padStart(2, '0')}（${durMin}分鐘）`;
    }
    return `${st.getHours()}:${String(st.getMinutes()).padStart(2, '0')} - 正在睡覺中`;
  }).join('\n');

  const growthInfo = latestGrowth
    ? `最近體重 ${latestGrowth.weight || '未記錄'}kg，身高 ${latestGrowth.height || '未記錄'}cm，頭圍 ${latestGrowth.head_circumference || '未記錄'}cm（${latestGrowth.date}）`
    : '暫無生長記錄';

  const vaccineInfo = pendingVaccines.length > 0
    ? pendingVaccines.map((v: any) => `${v.name}${v.dose ? '(' + v.dose + ')' : ''} - ${v.scheduled_date}（${v.status === 'overdue' ? '已過期' : '待接種'}）`).join('\n')
    : '近期沒有待接種疫苗';

  const weekStats = recentFeedStats
    ? `過去7天：共餵 ${recentFeedStats.count} 次，總計 ${recentFeedStats.total_ml}ml，平均每次 ${recentFeedStats.avg_ml}ml`
    : '';

  return `你是一個專業、友善的嬰兒健康顧問 AI 助手。你正在幫助一位香港的新手父母照顧他們的寶寶。

## 寶寶資料
- 名稱：${baby?.name || '寶寶'}
- 性別：${baby?.gender === 'F' ? '女' : '男'}
- 出生日期：${baby?.birth_date || '未設定'}
- 目前年齡：約 ${ageInDays} 天（${ageMonths} 個月）
- 出生體重：${baby?.birth_weight || '未記錄'} kg
- 血型：${baby?.blood_type || '未記錄'}
- 蠶豆病(G6PD)：${baby?.has_g6pd ? '有' : '沒有'}

## 今日記錄（${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日）

### 餵奶
${feedSummary}
${feedDetails || '（無記錄）'}
${weekStats ? '\n近一週統計：' + weekStats : ''}

### 換片
${diaperSummary}
${diaperDetails || '（無記錄）'}

### 睡眠
今日總睡眠：約 ${Math.round(sleepTotal / 60 * 10) / 10} 小時
${sleepDetails || '（無記錄）'}

## 生長發育
${growthInfo}

## 疫苗
${vaccineInfo}

## 回答規則
1. 請用繁體中文（香港用語）回答
2. 回答要簡潔、實用、溫暖
3. 根據寶寶的實際年齡和數據給出針對性建議
4. 如果涉及健康問題，提醒家長諮詢醫生
5. 不要編造或假設數據中沒有的資訊
6. 可以根據餵奶、睡眠、換片數據分析趨勢並提供建議
7. 寶寶有蠶豆病的話，提醒注意相關禁忌
8. 如用戶上傳圖片，仔細分析圖片內容並結合寶寶數據回答
9. 回答中不要使用 markdown 格式標記`;
}

/**
 * Handle chat via Google Gemini (reverse-engineered web API).
 * Returns SSE-formatted response to keep frontend compatible.
 */
async function handleGeminiChat(
  cookieStr: string,
  systemPrompt: string,
  message: string,
  history: any[],
  image: string | null,
): Promise<Response> {
  const cookies = parseCookies(cookieStr);
  const client = new GeminiClient(cookies, 'zh-HK');

  // Build the full prompt: system context + conversation history + user message
  // Gemini doesn't have a system/user role distinction like OpenAI, so we combine
  const historyText = history
    .map((h: any) => h.role === 'user' ? `用戶：${h.content}` : `助手：${h.content}`)
    .join('\n\n');

  const fullPrompt = `${systemPrompt}\n\n---\n\n${historyText ? historyText + '\n\n' : ''}用戶：${message}`;

  // Handle image if present
  let imageBytes: Uint8Array | undefined;
  if (image) {
    const base64 = image.includes(',') ? image.split(',')[1] : image;
    const binaryStr = atob(base64);
    imageBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      imageBytes[i] = binaryStr.charCodeAt(i);
    }
  }

  const geminiResp = await client.chat(fullPrompt, imageBytes, 'image.jpg', 'image/jpeg');

  if (!geminiResp.text) {
    throw new Error('Gemini returned empty response');
  }

  // Convert to SSE format that the frontend expects
  // Simulate streaming by sending the text in chunks
  const text = geminiResp.text;
  const chunkSize = 4; // characters per chunk for a smooth typing effect
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let offset = 0;
      function pushChunk() {
        if (offset >= text.length) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }
        const end = Math.min(offset + chunkSize, text.length);
        const chunk = text.slice(offset, end);
        const sseData = JSON.stringify({ response: chunk });
        controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
        offset = end;
        // Use a microtask to avoid blocking
        pushChunk();
      }
      pushChunk();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * Handle chat via Cloudflare AI (original implementation).
 */
async function handleCloudflareChat(
  ai: any,
  messages: any[],
  image: string | null,
): Promise<Response> {
  const hasImage = !!image;
  const model = hasImage ? VISION_MODEL : TEXT_MODEL;

  if (hasImage) {
    await ensureVisionLicense(ai);
  }

  const aiParams: any = {
    messages,
    stream: true,
    max_tokens: 1024,
  };

  if (hasImage) {
    const base64 = image!.includes(',') ? image!.split(',')[1] : image!;
    const binaryStr = atob(base64);
    const imageBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      imageBytes[i] = binaryStr.charCodeAt(i);
    }
    aiParams.image = Array.from(imageBytes);
  } else {
    aiParams.temperature = 0.7;
  }

  const stream = await ai.run(model as any, aiParams);

  return new Response(stream as ReadableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// POST /api/ai/chat
aiRoutes.post('/chat', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const message = body.message;
  const history = body.history || [];
  const image = body.image || null; // base64 data URL
  const dayFrom = body.from; // local day start ISO from frontend
  const dayTo = body.to;     // local day end ISO from frontend
  const provider = body.provider || 'google'; // 'google' or 'cloudflare'

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return c.json({ error: '請輸入問題' }, 400);
  }

  const trimmedHistory = history.slice(-6);

  // Gather context from D1 in parallel
  const [baby, todayFeeds, todayDiapers, todaySleeps, latestGrowth, vaccines, recentFeedStats] =
    await Promise.all([
      db.prepare('SELECT * FROM baby WHERE id = 1').first(),
      dayFrom && dayTo
        ? db.prepare("SELECT time, amount_ml, note FROM feeds WHERE time >= ? AND time <= ? ORDER BY time DESC").bind(dayFrom, dayTo).all()
        : db.prepare("SELECT time, amount_ml, note FROM feeds WHERE date(time) = date('now') ORDER BY time DESC").all(),
      dayFrom && dayTo
        ? db.prepare("SELECT time, type, color, texture, note FROM diapers WHERE time >= ? AND time <= ? ORDER BY time DESC").bind(dayFrom, dayTo).all()
        : db.prepare("SELECT time, type, color, texture, note FROM diapers WHERE date(time) = date('now') ORDER BY time DESC").all(),
      dayFrom && dayTo
        ? db.prepare("SELECT start_time, end_time, quality, note FROM sleeps WHERE start_time >= ? AND start_time <= ? ORDER BY start_time DESC").bind(dayFrom, dayTo).all()
        : db.prepare("SELECT start_time, end_time, quality, note FROM sleeps WHERE date(start_time) = date('now') ORDER BY start_time DESC").all(),
      db.prepare('SELECT * FROM growth ORDER BY date DESC LIMIT 1').first(),
      db.prepare("SELECT name, dose, scheduled_date, status FROM vaccines WHERE status IN ('pending','overdue') ORDER BY scheduled_date ASC LIMIT 5").all(),
      db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(amount_ml),0) as total_ml,
        COALESCE(ROUND(AVG(amount_ml),0),0) as avg_ml
        FROM feeds WHERE time >= date('now', '-7 days')`).first(),
    ]);

  const systemPrompt = buildSystemPrompt(
    baby, todayFeeds.results, todayDiapers.results, todaySleeps.results,
    latestGrowth, vaccines.results, recentFeedStats,
  );

  try {
    if (provider === 'google') {
      // Use Gemini
      const cookieStr = c.env.GEMINI_COOKIES;
      if (!cookieStr) {
        return c.json({ error: 'Google Gemini 未設定，請先配置 GEMINI_COOKIES' }, 503);
      }
      return await handleGeminiChat(cookieStr, systemPrompt, message, trimmedHistory, image);
    } else {
      // Use Cloudflare AI (original)
      const messages: any[] = [{ role: 'system', content: systemPrompt }];
      for (const h of trimmedHistory) {
        messages.push({ role: h.role, content: h.content });
      }
      messages.push({ role: 'user', content: message });

      return await handleCloudflareChat(c.env.AI, messages, image);
    }
  } catch (err: any) {
    const errorMsg = String(err?.message || err || '');
    console.error('AI error:', errorMsg);
    if (errorMsg.includes('rate limit') || errorMsg.includes('quota') || errorMsg.includes('limit')) {
      return c.json({ error: '今日 AI 使用量已達上限，請明天再試' }, 429);
    }
    if (errorMsg.includes('SNlM0e') || errorMsg.includes('Cookies')) {
      return c.json({ error: 'Google 驗證已過期，請重新設定 Cookies' }, 401);
    }
    return c.json({ error: 'AI 服務暫時不可用，請稍後再試 (' + errorMsg.slice(0, 100) + ')' }, 503);
  }
});
