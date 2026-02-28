/**
 * Gemini Reverse-Engineered API — Vercel Edge Function
 *
 * Runs the full Gemini web client on Vercel's edge infrastructure,
 * bypassing Google's Cloudflare IP blocks.
 *
 * POST /api/gemini
 *   Body (JSON):
 *     cookies:   string   — Google auth cookies (semicolon-separated)
 *     prompt:    string   — Full prompt text (system + history + user message)
 *     image?:    string   — Base64 image data (without data: prefix)
 *     language?: string   — Language code (default: zh-HK)
 *     model?:    string   — Model ID (default: fbb127bbb056c959)
 *   Headers:
 *     X-Proxy-Key: shared auth secret
 *
 *   Returns: SSE stream identical to what the frontend expects
 */

export const config = { runtime: "edge" };

const PROXY_KEY = process.env.PROXY_KEY || "";

// ─── Gemini Client (ported from worker/lib/gemini.ts) ───

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

const BASE_URL = "https://gemini.google.com";
const UPLOAD_URL = "https://push.clients6.google.com/upload/";
const STREAM_GENERATE_PATH =
  "/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";

interface GeminiResponse {
  text: string;
  conversationId: string;
  responseId: string;
  thinking: string | null;
  rawLength: number;
  chunkCount: number;
}

interface UploadedImage {
  imageRef: string;
  filename: string;
  mimeType: string;
}

interface SessionState {
  snlm0e: string | null;
  bl: string | null;
  fsid: string | null;
  pushId: string | null;
  reqid: number;
  conversationId: string;
  responseId: string;
  choiceId: string;
}

function parseCookies(cookieStr: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of cookieStr.split(";")) {
    const trimmed = pair.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      cookies[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
  return cookies;
}

function formatCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function mergeSetCookies(
  resp: Response,
  cookies: Record<string, string>,
): void {
  const raw = resp.headers.get("set-cookie") || "";
  // Edge runtime may not have getSetCookie, parse manually
  const parts = raw.split(/,(?=\s*\w+=)/);
  for (const sc of parts) {
    const firstSemicolon = sc.indexOf(";");
    const nameValue = firstSemicolon > 0 ? sc.slice(0, firstSemicolon) : sc;
    const eqIdx = nameValue.indexOf("=");
    if (eqIdx > 0) {
      const name = nameValue.slice(0, eqIdx).trim();
      const value = nameValue.slice(eqIdx + 1).trim();
      cookies[name] = value;
    }
  }
}

class GeminiClient {
  private cookies: Record<string, string>;
  private language: string;
  private model: string;
  private state: SessionState;
  private ua: string;

  constructor(
    cookies: Record<string, string>,
    language: string = "zh-HK",
    model: string = "fbb127bbb056c959",
  ) {
    this.cookies = { ...cookies };
    this.language = language;
    this.model = model;
    this.ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    this.state = {
      snlm0e: null,
      bl: null,
      fsid: null,
      pushId: null,
      reqid: (Math.floor(Math.random() * 900000) + 100000) * 10,
      conversationId: "",
      responseId: "",
      choiceId: "",
    };
  }

  private async initSession(): Promise<void> {
    const resp = await fetch(`${BASE_URL}/app`, {
      method: "GET",
      headers: {
        "User-Agent": this.ua,
        Cookie: formatCookieHeader(this.cookies),
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": `${this.language},${this.language.split("-")[0]};q=0.9,en;q=0.8`,
      },
      redirect: "follow",
    });

    mergeSetCookies(resp, this.cookies);

    if (!resp.ok) {
      throw new Error(
        `Failed to initialize Gemini session: HTTP ${resp.status}`,
      );
    }

    const html = await resp.text();

    // Diagnostic: capture page title and final URL for debugging
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const pageTitle = titleMatch ? titleMatch[1].trim() : "unknown";
    const finalUrl = resp.url || "unknown";

    if (html.includes("google.com/sorry") || html.includes("/sorry/index")) {
      throw new Error(
        `Google blocked this IP (sorry/CAPTCHA). Page: "${pageTitle}", URL: ${finalUrl}`,
      );
    }

    if (html.includes("accounts.google.com/ServiceLogin")) {
      throw new Error(
        `Gemini redirected to login page (ServiceLogin). Page: "${pageTitle}", URL: ${finalUrl}. Cookies may be expired.`,
      );
    }

    if (html.includes("consent.google.com")) {
      throw new Error(
        `Google consent page detected. Page: "${pageTitle}", URL: ${finalUrl}. This is a region/consent issue, not expired cookies.`,
      );
    }

    const atMatch = html.match(/"SNlM0e":"([^"]+)"/);
    if (!atMatch) {
      throw new Error(
        `Could not find SNlM0e token (page: "${pageTitle}", URL: ${finalUrl}, htmlLen: ${html.length}). Preview: ${html.slice(0, 300).replace(/\n/g, " ")}`,
      );
    }
    this.state.snlm0e = atMatch[1];

    const blMatch = html.match(/"cfb2h":"([^"]+)"/);
    this.state.bl = blMatch
      ? blMatch[1]
      : "boq_assistant-bard-web-server_20260222.13_p0";

    const fsidMatch = html.match(/"FdrFJe":"([^"]+)"/);
    this.state.fsid = fsidMatch
      ? fsidMatch[1]
      : String(Math.floor(Math.random() * 9e18) + 1e18);

    const pushMatch = html.match(/"qKIAYe":"([^"]+)"/);
    this.state.pushId = pushMatch ? pushMatch[1] : null;
  }

  private async ensureSession(): Promise<void> {
    if (!this.state.snlm0e) {
      await this.initSession();
    }
  }

  async uploadImage(
    imageBytes: Uint8Array,
    filename: string,
    mimeType: string,
  ): Promise<UploadedImage> {
    await this.ensureSession();

    if (!this.state.pushId) {
      throw new Error(
        "Push ID not available. Session may not be initialized correctly.",
      );
    }

    const cookieHeader = formatCookieHeader(this.cookies);

    const initResp = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        "User-Agent": this.ua,
        Cookie: cookieHeader,
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(imageBytes.length),
        "X-Goog-Upload-Protocol": "resumable",
        "X-Tenant-Id": "bard-storage",
        "Push-Id": this.state.pushId,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: `File name: ${filename}`,
    });

    mergeSetCookies(initResp, this.cookies);

    if (!initResp.ok) {
      throw new Error(
        `Image upload initiation failed: HTTP ${initResp.status}`,
      );
    }

    const uploadUrl = initResp.headers.get("X-Goog-Upload-URL");
    if (!uploadUrl) {
      throw new Error("Upload initiation failed: no upload URL in response");
    }

    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "User-Agent": this.ua,
        Cookie: formatCookieHeader(this.cookies),
        "X-Goog-Upload-Command": "upload, finalize",
        "X-Goog-Upload-Offset": "0",
        "X-Tenant-Id": "bard-storage",
        "Push-Id": this.state.pushId,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: imageBytes,
    });

    mergeSetCookies(uploadResp, this.cookies);

    if (!uploadResp.ok) {
      throw new Error(`Image upload failed: HTTP ${uploadResp.status}`);
    }

    const imageRef = (await uploadResp.text()).trim();
    if (!imageRef) {
      throw new Error("Upload failed: empty image reference in response");
    }

    return { imageRef, filename, mimeType };
  }

  private buildRequestPayload(prompt: string, image?: UploadedImage): string {
    let imageData: any = null;
    if (image) {
      imageData = [
        [[image.imageRef, 1, null, image.mimeType], image.filename],
      ];
    }

    const inner = [
      [prompt, 0, null, imageData, null, null, 0],
      [this.language],
      [
        this.state.conversationId,
        this.state.responseId,
        this.state.choiceId,
        null,
        null,
        null,
        null,
        null,
        null,
        "",
      ],
      null,
      null,
      null,
      [0],
      1,
      null,
      null,
      1,
      0,
      null,
      null,
      null,
      null,
      null,
      [[0]],
      0,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      1,
      null,
      null,
      [4],
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      [1],
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      0,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      [],
      null,
      null,
      null,
      null,
      [Math.floor(Date.now() / 1000), 0],
      null,
      1,
    ];

    const outer = [null, JSON.stringify(inner)];

    const params = new URLSearchParams();
    params.set("f.req", JSON.stringify(outer));
    params.set("at", this.state.snlm0e!);
    return params.toString();
  }

  private parseStreamResponse(text: string): GeminiResponse {
    const lines = text.split("\n");
    const chunks: any[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (/^\d+$/.test(line)) {
        i++;
        if (i < lines.length) {
          try {
            chunks.push(JSON.parse(lines[i]));
          } catch {}
        }
      }
      i++;
    }

    let responseText = "";
    let thinkingText = "";
    let conversationId = "";
    let responseId = "";
    let choiceId = "";

    for (const chunk of chunks) {
      try {
        if (!chunk?.[0]) continue;

        const entries =
          Array.isArray(chunk[0]) && Array.isArray(chunk[0][0])
            ? chunk
            : [chunk];

        for (const entry of entries) {
          if (!entry?.[0] || entry[0].length < 3 || !entry[0][2]) continue;

          let inner: any;
          try {
            inner = JSON.parse(entry[0][2]);
          } catch {
            continue;
          }

          if (inner?.[1]) {
            const ids = inner[1];
            if (Array.isArray(ids) && ids.length >= 2) {
              if (ids[0]) conversationId = ids[0];
              if (ids[1]) responseId = ids[1];
            }
          }

          if (inner?.[4] && Array.isArray(inner[4])) {
            for (const respItem of inner[4]) {
              if (
                !respItem ||
                !Array.isArray(respItem) ||
                respItem.length <= 1
              )
                continue;
              if (respItem[0]) choiceId = respItem[0];
              const textParts = respItem[1];
              if (Array.isArray(textParts)) {
                const combined = textParts
                  .filter((t: any) => typeof t === "string")
                  .join("");
                if (combined && combined.length > responseText.length) {
                  responseText = combined;
                }
              }

              if (respItem.length > 37 && respItem[37]) {
                try {
                  const thinking = respItem[37]?.[0]?.[0];
                  if (
                    typeof thinking === "string" &&
                    thinking.length > thinkingText.length
                  ) {
                    thinkingText = thinking;
                  }
                } catch {}
              }
            }
          }

          if (!responseText && inner?.[26]) {
            try {
              const textBits: string[] = [];
              const extractText = (obj: any): void => {
                if (typeof obj === "string" && obj.length > 0) {
                  textBits.push(obj);
                } else if (Array.isArray(obj)) {
                  for (const item of obj) extractText(item);
                }
              };
              extractText(inner[26]);
              if (textBits.length) {
                const candidate = textBits.join("\n");
                if (candidate.length > responseText.length) {
                  responseText = candidate;
                }
              }
            } catch {}
          }
        }
      } catch {
        continue;
      }
    }

    return {
      text: responseText,
      conversationId,
      responseId,
      thinking: thinkingText || null,
      rawLength: text.length,
      chunkCount: chunks.length,
    };
  }

  async chat(
    prompt: string,
    imageBytes?: Uint8Array,
    imageFilename?: string,
    imageMimeType?: string,
  ): Promise<GeminiResponse> {
    await this.ensureSession();

    let uploadedImage: UploadedImage | undefined;
    if (imageBytes) {
      uploadedImage = await this.uploadImage(
        imageBytes,
        imageFilename || "image.jpg",
        imageMimeType || "image/jpeg",
      );
    }

    this.state.reqid += 100000;

    const params = new URLSearchParams({
      bl: this.state.bl!,
      "f.sid": this.state.fsid!,
      hl: this.language,
      _reqid: String(this.state.reqid),
      rt: "c",
    });

    const url = `${BASE_URL}${STREAM_GENERATE_PATH}?${params.toString()}`;
    const payload = this.buildRequestPayload(prompt, uploadedImage);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": this.ua,
        Cookie: formatCookieHeader(this.cookies),
        Origin: BASE_URL,
        Referer: `${BASE_URL}/`,
        "X-Same-Domain": "1",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "*/*",
        "Accept-Language": `${this.language},${this.language.split("-")[0]};q=0.9,en;q=0.8`,
      },
      body: payload,
    });

    mergeSetCookies(resp, this.cookies);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(
        `Gemini API error: HTTP ${resp.status} ${errText.slice(0, 300)}`,
      );
    }

    const text = await resp.text();
    const result = this.parseStreamResponse(text);

    if (!result.text) {
      const preview = text.slice(0, 500).replace(/\n/g, "\\n");
      throw new Error(
        `Gemini response parsing failed (rawLen=${result.rawLength}, chunks=${result.chunkCount}). ` +
          `Preview: ${preview}`,
      );
    }

    return result;
  }
}

// ─── Edge Function Handler ───

export default async function handler(req: Request): Promise<Response> {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Auth check
  if (PROXY_KEY) {
    const provided = req.headers.get("X-Proxy-Key");
    if (provided !== PROXY_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { cookies: cookieStr, prompt, image, language, model } = body;

  if (!cookieStr || !prompt) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: cookies, prompt" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const cookies = parseCookies(cookieStr);
    const client = new GeminiClient(
      cookies,
      language || "zh-HK",
      model || "fbb127bbb056c959",
    );

    // Handle image if present (base64 string)
    let imageBytes: Uint8Array | undefined;
    if (image) {
      const base64 = image.includes(",") ? image.split(",")[1] : image;
      const binaryStr = atob(base64);
      imageBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        imageBytes[i] = binaryStr.charCodeAt(i);
      }
    }

    const geminiResp = await client.chat(
      prompt,
      imageBytes,
      "image.jpg",
      "image/jpeg",
    );

    // Return as SSE stream (same format the frontend expects)
    const text = geminiResp.text;
    const chunkSize = 4;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        let offset = 0;
        function pushChunk() {
          if (offset >= text.length) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    const errorMsg = String(err?.message || err || "");
    console.error("Gemini error:", errorMsg);

    const status = errorMsg.includes("CAPTCHA") || errorMsg.includes("blocked")
      ? 403
      : errorMsg.includes("expired") || errorMsg.includes("login") || errorMsg.includes("SNlM0e")
        ? 401
        : errorMsg.includes("parsing failed")
          ? 502
          : 500;

    return new Response(JSON.stringify({ error: errorMsg.slice(0, 500) }), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
