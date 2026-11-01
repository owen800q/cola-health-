/**
 * Byte-range support for static media. Workers Sites (serveStatic) always
 * answers 200 with the whole file, but iOS Safari refuses to play audio
 * without 206 responses, and seeking or relaying the file needs them too.
 */
import type { MiddlewareHandler } from 'hono';

export async function withRange(res: Response, range: string | undefined): Promise<Response> {
  if (res.status !== 200) return res;
  const headers = new Headers(res.headers);
  headers.set('Accept-Ranges', 'bytes');
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === '' && m[2] === '')) return new Response(res.body, { status: 200, headers });

  const body = await res.arrayBuffer();
  const size = body.byteLength;
  let start: number;
  let end: number;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end || size === 0) {
    headers.set('Content-Range', `bytes */${size}`);
    headers.delete('Content-Length');
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}

/** Adds Range support to .mp3 responses produced by later handlers. */
export const mediaRange: MiddlewareHandler = async (c, next) => {
  await next();
  if (!c.req.path.endsWith('.mp3')) return;
  const res = await withRange(c.res, c.req.header('Range'));
  c.res = undefined; // otherwise Hono copies the full-file headers onto the new response
  c.res = res;
};
