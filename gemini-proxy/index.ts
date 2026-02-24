/**
 * Gemini Proxy Worker
 *
 * A lightweight HTTP proxy that forwards requests to Google Gemini.
 * Deploy this on a server/service with a clean residential IP that
 * Google doesn't block (e.g., a home VPS, Oracle Cloud free tier, etc.).
 *
 * Protocol:
 *   POST /
 *   Headers:
 *     X-Target-Url:    the real destination URL
 *     X-Target-Method: the real HTTP method (GET, POST, etc.)
 *     X-Proxy-Key:     shared secret for auth (must match PROXY_KEY env var)
 *     (all other headers are forwarded to the target)
 *   Body: forwarded as-is
 *
 * Deploy options:
 *   1. Cloudflare Worker (different account / region)
 *   2. Node.js on any VPS:
 *        npx wrangler deploy   OR   node server.js
 *   3. Deno Deploy, Vercel Edge, etc.
 *
 * Environment variables:
 *   PROXY_KEY - shared secret to prevent unauthorized usage (optional)
 */

export default {
  async fetch(request: Request, env: Record<string, string>): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const targetUrl = request.headers.get('X-Target-Url');
    const targetMethod = request.headers.get('X-Target-Method') || 'GET';

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing X-Target-Url header' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Optional auth check
    const proxyKey = env.PROXY_KEY;
    if (proxyKey) {
      const provided = request.headers.get('X-Proxy-Key');
      if (provided !== proxyKey) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Build forwarded headers — exclude hop-by-hop and proxy-specific headers
    const skipHeaders = new Set([
      'host', 'x-target-url', 'x-target-method', 'x-proxy-key',
      'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor',
      'cf-worker', 'cdn-loop', 'connection',
    ]);

    const forwardHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (!skipHeaders.has(key.toLowerCase())) {
        forwardHeaders.set(key, value);
      }
    }

    // Set the Host header to match the target
    try {
      const targetHost = new URL(targetUrl).host;
      forwardHeaders.set('Host', targetHost);
    } catch {}

    // Forward the request
    const resp = await fetch(targetUrl, {
      method: targetMethod,
      headers: forwardHeaders,
      body: targetMethod !== 'GET' && targetMethod !== 'HEAD' ? request.body : undefined,
      redirect: 'follow',
    });

    // Forward the response back, including Set-Cookie headers
    const respHeaders = new Headers(resp.headers);
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Expose-Headers', '*');

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  },
};
