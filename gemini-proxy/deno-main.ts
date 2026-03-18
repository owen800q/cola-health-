/**
 * Gemini Proxy — Deno Deploy edition
 *
 * Forwards requests from the main Cloudflare Worker to Google Gemini,
 * bypassing Google's datacenter-IP CAPTCHA block.
 *
 * Protocol:
 *   POST /
 *     X-Target-Url:    the real target URL
 *     X-Target-Method: HTTP method (GET/POST)
 *     X-Proxy-Key:     shared auth secret
 *     All other headers + body → forwarded to target
 *
 * Health check:
 *   GET /health → 200 OK
 */

const PROXY_KEY = Deno.env.get("PROXY_KEY") || "";

Deno.serve({ port: 8000 }, async (req: Request): Promise<Response> => {
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

  // Health check endpoint
  const url = new URL(req.url);
  if (url.pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok", ts: Date.now() }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const targetUrl = req.headers.get("X-Target-Url");
  const targetMethod = req.headers.get("X-Target-Method") || "GET";

  if (!targetUrl) {
    return new Response(
      JSON.stringify({ error: "Missing X-Target-Url header" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Auth check
  if (PROXY_KEY) {
    const provided = req.headers.get("X-Proxy-Key");
    if (provided !== PROXY_KEY) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // Build forwarded headers — strip proxy-specific and hop-by-hop headers
  const skipHeaders = new Set([
    "host",
    "x-target-url",
    "x-target-method",
    "x-proxy-key",
    "connection",
    "transfer-encoding",
  ]);

  const forwardHeaders = new Headers();
  for (const [key, value] of req.headers.entries()) {
    if (!skipHeaders.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  }

  // Set Host to match the target
  try {
    forwardHeaders.set("Host", new URL(targetUrl).host);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid X-Target-Url" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Forward the request to Google
  // Buffer the body as ArrayBuffer so Content-Length is preserved correctly.
  // Streaming req.body directly can lose Content-Length, which breaks
  // Google's resumable upload protocol for image attachments.
  try {
    let body: ArrayBuffer | undefined;
    if (targetMethod !== "GET" && targetMethod !== "HEAD" && req.body) {
      body = await req.arrayBuffer();
      forwardHeaders.set("Content-Length", String(body.byteLength));
    }

    const resp = await fetch(targetUrl, {
      method: targetMethod,
      headers: forwardHeaders,
      body,
      redirect: "follow",
    });

    // Build response, forwarding all headers
    const respHeaders = new Headers(resp.headers);
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Expose-Headers", "*");

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Proxy fetch failed: ${err}` }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
});
