import { Hono } from 'hono';
import type { Bindings } from '../index';
import { GeminiClient, parseCookies } from '../lib/gemini';

export const aiRoutes = new Hono<{ Bindings: Bindings }>();

// Fallback Gemini cookies when GEMINI_COOKIES env var is not set
const FALLBACK_GEMINI_COOKIES = '_gcl_au=1.1.977754358.1771923802; _ga=GA1.1.1001900884.1771923803; NID=529=13p9dc5B_O1xpUeN2nbBNm-MKCG9XQ5OHcf6GW_YCHFojxVCGh9wQOULQi0Qfx32k_r789vJrVuQPBpC_iGrdpXEFUVxhuWGsy8DC19vofj0ExXc58FlWdkaenKrTKdll1ixsaDsPVvrgVKuouLrICTC0BbljdyDTASy_gqBqop10jKpJDsLAN2Hr6wArKWz3zRnC5VEUV9VB-ewnpgWrofQrSZomkHeihgjuSDDcmQFcjsZqIsA3gRZHq-HHMvabAh9_vZ1iBKnCwBV5cpFnYQ-zKhpXVG7uvOkb-01IqYghFx5qBrS16VYnDjiQaiuYs80gRkKNOh6o-_3vjaMq1geMLLf_VOsN0kQj32IwU1TTOxjEzMHeW5r6KC2E2dMj_Jq00EJz9fl5b-qsgmyON1KZtDclJTAlpQIQTygb1H7P1LyLrp_P9rUKD15Ojdd-wK4tUSYZBaPLABX1VI723Df6F8t-Q-uGx_eJ6JLRxOJJrMnbi8mh7__icgQEo9iyMg6cOTutswZhFYtF-u_EURI9e8wctj8w56BICtMQHeVl-2Ts06UH_PyVHYrHc4CTzyD0dwaVu3BxUl1SVsco2yTMCwURV8ukZd_iK5C23y-ocVSh4qC6c4K7FtKyIEll_-KbL8a-_XcF_fHcNqAZ0we2dsMeMrilUWY4pzD3jvl2b-XxIm_0uxaRGs; SID=g.a0007AjiqBFReyhJbzm_Hru12c0uTpeqFKGul7hnJyw4pK84ervvhxlU4hPT1eAf5fcT8847lQACgYKAQsSARcSFQHGX2MiK9SQovf7V6oYSFjJnquMpxoVAUF8yKpagVpPstQzlvCqsZ4n9NNH0076; __Secure-1PSID=g.a0007AjiqBFReyhJbzm_Hru12c0uTpeqFKGul7hnJyw4pK84ervvEl324eIRkQOo6CnjIGsD3AACgYKAbESARcSFQHGX2MiDfddxMdsbe97zM9ixQL-AhoVAUF8yKqrLDMN7rYJVVcn5Aq4O4kD0076; __Secure-3PSID=g.a0007AjiqBFReyhJbzm_Hru12c0uTpeqFKGul7hnJyw4pK84ervv9dHec5qk1CDracoUjhennQACgYKAY8SARcSFQHGX2Mi3zQ4EEL7bHYq71cSXgE58xoVAUF8yKqtVKCvBR94FPqzcBjh-2Kp0076; HSID=A41T310v4w1MiPGQ4; SSID=ABXF2dH_QNxZIbJBP; APISID=9pU7kKrvYUvwJaIp/ABtQInAVV80FXaxKo; SAPISID=loaHlg4by_wkNeu_/AHAy9YGUDdKIDxvJL; __Secure-1PAPISID=loaHlg4by_wkNeu_/AHAy9YGUDdKIDxvJL; __Secure-3PAPISID=loaHlg4by_wkNeu_/AHAy9YGUDdKIDxvJL; _ga_WC57KJ50ZZ=GS2.1.s1771923802$o1$g1$t1771923839$j23$l0$h0; _ga_BF8Q35BMLM=GS2.1.s1771923804$o1$g1$t1771923839$j25$l0$h0; __Secure-1PSIDTS=sidts-CjIBBj1CYjOBB0KtEDzq1vmyOCY8c6f5DfiSejvFZH0lGU4rMi24yM0ze6pXnI1Kqn1fXhAA; __Secure-3PSIDTS=sidts-CjIBBj1CYjOBB0KtEDzq1vmyOCY8c6f5DfiSejvFZH0lGU4rMi24yM0ze6pXnI1Kqn1fXhAA; SIDCC=AKEyXzWqgqoE71r0ctFjIA5vMQ2rROf9TQJHcGcDy1Bk8eQB4o6tTQ7rUUkSGH5BJexjqjFV; __Secure-1PSIDCC=AKEyXzV8BhpppEEL5Rp1OHGyBa0GcTDUq0o-C4W7xSrsUUHSiT51TQ7TfOIZxdWZOi_67Uyq6A; __Secure-3PSIDCC=AKEyXzXgxJnP7QGg-fuUkk2z6t17rTAkONnzeZe1oiCSGBBsJUpFXZiByL7Gtw1m6haqATwjKg';

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
9. 可以使用 markdown 格式（如粗體、列表、標題等）使回答更清晰易讀`;
}

/**
 * Handle chat via Google Gemini (reverse-engineered web API).
 *
 * When GEMINI_PROXY is set, the GeminiClient routes all HTTP requests
 * through the Vercel proxy to avoid Google blocking Cloudflare IPs.
 * The Gemini client logic (session init, payload building, response parsing)
 * still runs here on the CF Worker.
 */
async function handleGeminiChat(
  cookieStr: string,
  proxyUrl: string | null,
  systemPrompt: string,
  message: string,
  history: any[],
  image: string | null,
): Promise<Response> {
  const cookies = parseCookies(cookieStr);
  const client = new GeminiClient(cookies, 'zh-HK', 'fbb127bbb056c959', proxyUrl);

  const historyText = history
    .map((h: any) => h.role === 'user' ? `用戶：${h.content}` : `助手：${h.content}`)
    .join('\n\n');

  const fullPrompt = `${systemPrompt}\n\n---\n\n${historyText ? historyText + '\n\n' : ''}用戶：${message}`;

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

  const text = geminiResp.text;
  const chunkSize = 4;
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
      // Use Gemini — fall back to hardcoded cookies if env var is empty
      const cookieStr = c.env.GEMINI_COOKIES || FALLBACK_GEMINI_COOKIES;
      if (!cookieStr) {
        return c.json({ error: 'Google Gemini 未設定，請先配置 GEMINI_COOKIES' }, 503);
      }
      const proxyUrl = c.env.GEMINI_PROXY || null;
      return await handleGeminiChat(cookieStr, proxyUrl, systemPrompt, message, trimmedHistory, image);
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
    if (errorMsg.includes('sorry') || errorMsg.includes('CAPTCHA') || errorMsg.includes('blocked this IP') || errorMsg.includes('Too many redirects')) {
      return c.json({ error: 'Google 封鎖咗呢個 IP，請設定 GEMINI_PROXY 環境變數指向一個有乾淨 IP 嘅代理' }, 403);
    }
    if (errorMsg.includes('SNlM0e') || errorMsg.includes('Cookies') || errorMsg.includes('expired') || errorMsg.includes('login')) {
      return c.json({ error: 'Google 驗證已過期，請重新設定 Cookies' }, 401);
    }
    if (errorMsg.includes('parsing failed')) {
      return c.json({ error: 'Gemini 回應解析失敗，請重試 (' + errorMsg.slice(0, 200) + ')' }, 502);
    }
    return c.json({ error: 'AI 服務暫時不可用，請稍後再試 (' + errorMsg.slice(0, 100) + ')' }, 503);
  }
});
