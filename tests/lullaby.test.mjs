import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, test } from 'node:test';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const S = require('../public/js/lullaby-sources.js');
const origin = 'https://cola.example';

test('auto tries saved relay, then this site, then the China mirror', () => {
  assert.deepEqual(S.sources({ origin, route: 'auto' }), [origin + S.PATH, S.CN_MIRROR]);
  assert.deepEqual(S.sources({ origin, route: 'auto', proxy: 'https://relay.example:9998/tok/' }),
    ['https://relay.example:9998/tok/proxy/cola.example/sleeping_song.mp3', origin + S.PATH, S.CN_MIRROR]);
  assert.deepEqual(S.sources({ origin, route: 'auto', lastGood: S.CN_MIRROR }), [S.CN_MIRROR, origin + S.PATH]);
  assert.deepEqual(S.sources({ origin, route: 'auto', lastGood: 'https://stale.example/x.mp3' }), [origin + S.PATH, S.CN_MIRROR]);
});

test('a chosen route plays only from that source', () => {
  assert.deepEqual(S.sources({ origin, route: 'direct', proxy: 'relay.example' }), [origin + S.PATH]);
  assert.deepEqual(S.sources({ origin, route: 'cn' }), [S.CN_MIRROR]);
  assert.deepEqual(S.sources({ origin, route: 'proxy', proxy: 'relay.example' }), ['https://relay.example/proxy/cola.example/sleeping_song.mp3']);
  assert.deepEqual(S.sources({ origin, route: 'proxy' }), [S.CN_MIRROR]);
  assert.equal(S.normalizeProxy('  '), '');
  assert.equal(S.normalizeProxy('http://[bad'), '');
});

let app;
const FILE = new Uint8Array(1000).map((_, i) => i % 256);
before(async () => {
  const result = await build({
    stdin: { contents: `import { Hono } from 'hono';
      import { mediaRange } from './worker/lib/range';
      const app = new Hono();
      app.get('*', mediaRange);
      app.get('*', () => new Response(new Uint8Array(1000).map((_, i) => i % 256),
        { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '1000' } }));
      export default app;`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
  });
  app = (await import('data:text/javascript,' + encodeURIComponent(result.outputFiles[0].text))).default;
});

async function get(range) {
  return app.request('/sleeping_song.mp3', range ? { headers: { Range: range } } : {});
}

test('mp3 answers byte ranges with 206', async () => {
  let r = await get();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Accept-Ranges'), 'bytes');
  assert.equal((await r.arrayBuffer()).byteLength, 1000);

  r = await get('bytes=0-1');
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('Content-Range'), 'bytes 0-1/1000');
  assert.equal(r.headers.get('Content-Length'), '2');
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [0, 1]);

  r = await get('bytes=998-');
  assert.equal(r.headers.get('Content-Range'), 'bytes 998-999/1000');
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [FILE[998], FILE[999]]);

  r = await get('bytes=-3');
  assert.equal(r.headers.get('Content-Range'), 'bytes 997-999/1000');

  r = await get('bytes=500-99999');
  assert.equal(r.headers.get('Content-Range'), 'bytes 500-999/1000');

  r = await get('bytes=1000-');
  assert.equal(r.status, 416);
  assert.equal(r.headers.get('Content-Range'), 'bytes */1000');

  assert.equal((await get('bytes=0-1,5-6')).status, 200);
});
