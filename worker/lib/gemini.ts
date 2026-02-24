/**
 * Gemini Web API Client - Ported from Python reverse-engineered client
 *
 * Interacts with gemini.google.com using the same internal API endpoints
 * that the browser uses. Requires Google authentication cookies.
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

const BASE_URL = 'https://gemini.google.com';
const UPLOAD_URL = 'https://push.clients6.google.com/upload/';
const STREAM_GENERATE_PATH = '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate';

export interface GeminiResponse {
  text: string;
  conversationId: string;
  responseId: string;
  thinking: string | null;
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

/**
 * Parse cookie string from browser DevTools format into a Record.
 */
export function parseCookies(cookieStr: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of cookieStr.split(';')) {
    const trimmed = pair.trim();
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      cookies[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
  return cookies;
}

/**
 * Format cookies record back into a Cookie header string.
 */
function formatCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export class GeminiClient {
  private cookies: Record<string, string>;
  private language: string;
  private model: string;
  private state: SessionState;

  /**
   * @param cookies - Dict of Google auth cookies
   * @param language - Language code (default: "zh-HK" for Hong Kong Traditional Chinese)
   * @param model - Model identifier:
   *   - "fbb127bbb056c959" (Fast - default)
   *   - "5bf011840784117a" (Thinking)
   *   - "9d8ca3786ebdfbea" (Pro)
   */
  constructor(
    cookies: Record<string, string>,
    language: string = 'zh-HK',
    model: string = 'fbb127bbb056c959',
  ) {
    this.cookies = cookies;
    this.language = language;
    this.model = model;
    this.state = {
      snlm0e: null,
      bl: null,
      fsid: null,
      pushId: null,
      reqid: (Math.floor(Math.random() * 900000) + 100000) * 10,
      conversationId: '',
      responseId: '',
      choiceId: '',
    };
  }

  /**
   * Fetch the Gemini app page to extract session tokens.
   */
  private async initSession(): Promise<void> {
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const resp = await fetch(`${BASE_URL}/app`, {
      headers: {
        'User-Agent': ua,
        'Cookie': formatCookieHeader(this.cookies),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': `${this.language},${this.language.split('-')[0]};q=0.9`,
      },
      redirect: 'follow',
    });

    if (!resp.ok) {
      throw new Error(`Failed to initialize Gemini session: HTTP ${resp.status}`);
    }

    const html = await resp.text();

    // Extract SNlM0e (CSRF/AT token)
    const atMatch = html.match(/"SNlM0e":"([^"]+)"/);
    if (!atMatch) {
      throw new Error('Could not find SNlM0e token. Cookies may be invalid or expired.');
    }
    this.state.snlm0e = atMatch[1];

    // Extract cfb2h (build label)
    const blMatch = html.match(/"cfb2h":"([^"]+)"/);
    this.state.bl = blMatch
      ? blMatch[1]
      : 'boq_assistant-bard-web-server_20260222.13_p0';

    // Extract FdrFJe (session ID)
    const fsidMatch = html.match(/"FdrFJe":"([^"]+)"/);
    this.state.fsid = fsidMatch
      ? fsidMatch[1]
      : String(Math.floor(Math.random() * 9e18) + 1e18);

    // Extract qKIAYe (push ID for image uploads)
    const pushMatch = html.match(/"qKIAYe":"([^"]+)"/);
    this.state.pushId = pushMatch ? pushMatch[1] : null;
  }

  private async ensureSession(): Promise<void> {
    if (!this.state.snlm0e) {
      await this.initSession();
    }
  }

  /**
   * Upload an image to Google's servers for use in chat.
   */
  async uploadImage(imageBytes: Uint8Array, filename: string, mimeType: string): Promise<UploadedImage> {
    await this.ensureSession();

    if (!this.state.pushId) {
      throw new Error('Push ID not available. Session may not be initialized correctly.');
    }

    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const cookieHeader = formatCookieHeader(this.cookies);

    // Step 1: Initiate resumable upload
    const initResp = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        'User-Agent': ua,
        'Cookie': cookieHeader,
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(imageBytes.length),
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Tenant-Id': 'bard-storage',
        'Push-Id': this.state.pushId,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: `File name: ${filename}`,
    });

    if (!initResp.ok) {
      throw new Error(`Image upload initiation failed: HTTP ${initResp.status}`);
    }

    const uploadUrl = initResp.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) {
      throw new Error('Upload initiation failed: no upload URL in response');
    }

    // Step 2: Upload the actual file bytes
    const uploadResp = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'User-Agent': ua,
        'Cookie': cookieHeader,
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0',
        'X-Tenant-Id': 'bard-storage',
        'Push-Id': this.state.pushId,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: imageBytes,
    });

    if (!uploadResp.ok) {
      throw new Error(`Image upload failed: HTTP ${uploadResp.status}`);
    }

    const imageRef = (await uploadResp.text()).trim();
    if (!imageRef) {
      throw new Error('Upload failed: empty image reference in response');
    }

    return { imageRef, filename, mimeType };
  }

  /**
   * Build the f.req payload for StreamGenerate.
   */
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
        null, null, null, null, null, null,
        '',
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
    params.set('f.req', JSON.stringify(outer));
    params.set('at', this.state.snlm0e!);
    return params.toString();
  }

  /**
   * Parse the streaming response from Gemini.
   */
  private parseStreamResponse(text: string): GeminiResponse {
    const lines = text.split('\n');
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

    let responseText = '';
    let thinkingText = '';
    let conversationId = '';
    let responseId = '';
    let choiceId = '';

    for (const chunk of chunks) {
      try {
        if (!chunk?.[0] || chunk[0].length < 3 || !chunk[0][2]) continue;
        const inner = JSON.parse(chunk[0][2]);

        // Extract conversation and response IDs
        if (inner?.[1]) {
          const ids = inner[1];
          if (ids.length >= 2) {
            if (ids[0]) conversationId = ids[0];
            if (ids[1]) responseId = ids[1];
          }
        }

        // Extract response text at [4][0][1]
        if (inner?.[4]) {
          for (const respItem of inner[4]) {
            if (!respItem || respItem.length <= 1) continue;
            if (respItem[0]) choiceId = respItem[0];
            const textParts = respItem[1];
            if (Array.isArray(textParts)) {
              const combined = textParts
                .filter((t: any) => typeof t === 'string')
                .join('');
              if (combined && combined.length > responseText.length) {
                responseText = combined;
              }
            }

            // Check for thinking at [37]
            if (respItem.length > 37 && respItem[37]) {
              try {
                const thinking = respItem[37][0][0];
                if (typeof thinking === 'string' && thinking.length > thinkingText.length) {
                  thinkingText = thinking;
                }
              } catch {}
            }
          }
        }

        // Fallback: check [26] for structured content
        if (!responseText && inner?.[26]) {
          try {
            const textBits: string[] = [];
            function extractText(obj: any): void {
              if (typeof obj === 'string' && obj.length > 0) {
                textBits.push(obj);
              } else if (Array.isArray(obj)) {
                for (const item of obj) extractText(item);
              }
            }
            extractText(inner[26]);
            if (textBits.length) {
              const candidate = textBits.join('\n');
              if (candidate.length > responseText.length) {
                responseText = candidate;
              }
            }
          } catch {}
        }
      } catch {
        continue;
      }
    }

    // Update conversation state for follow-up messages
    this.state.conversationId = conversationId;
    this.state.responseId = responseId;
    this.state.choiceId = choiceId;

    return {
      text: responseText,
      conversationId,
      responseId,
      thinking: thinkingText || null,
    };
  }

  /**
   * Send a message to Gemini and get the response.
   */
  async chat(prompt: string, imageBytes?: Uint8Array, imageFilename?: string, imageMimeType?: string): Promise<GeminiResponse> {
    await this.ensureSession();

    // Handle image upload if provided
    let uploadedImage: UploadedImage | undefined;
    if (imageBytes) {
      uploadedImage = await this.uploadImage(
        imageBytes,
        imageFilename || 'image.jpg',
        imageMimeType || 'image/jpeg',
      );
    }

    this.state.reqid += 100000;

    const params = new URLSearchParams({
      bl: this.state.bl!,
      'f.sid': this.state.fsid!,
      hl: this.language,
      _reqid: String(this.state.reqid),
      rt: 'c',
    });

    const url = `${BASE_URL}${STREAM_GENERATE_PATH}?${params.toString()}`;
    const payload = this.buildRequestPayload(prompt, uploadedImage);

    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': ua,
        'Cookie': formatCookieHeader(this.cookies),
        'Origin': BASE_URL,
        'Referer': `${BASE_URL}/`,
        'X-Same-Domain': '1',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Accept': '*/*',
        'Accept-Language': `${this.language},${this.language.split('-')[0]};q=0.9`,
      },
      body: payload,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Gemini API error: HTTP ${resp.status} ${errText.slice(0, 200)}`);
    }

    const text = await resp.text();
    return this.parseStreamResponse(text);
  }

  /**
   * Start a new conversation (reset conversation state).
   */
  newConversation(): void {
    this.state.conversationId = '';
    this.state.responseId = '';
    this.state.choiceId = '';
  }

  /**
   * Force re-initialization of the session.
   */
  resetSession(): void {
    this.state.snlm0e = null;
    this.state.bl = null;
    this.state.fsid = null;
    this.newConversation();
  }
}
