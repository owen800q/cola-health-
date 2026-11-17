import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

// The recognition test needs the real 21 MB model, which is not committed.
// Fetch it once with `npm run test:ocr-model`; without it that test is skipped.
const MODEL = process.env.OCR_MODEL_TAR || 'tests/.cache/PP-OCRv6_small_rec.tar';
const hasModel = existsSync(MODEL);
const PASSWORD = '20260116';

let mf;
async function ocr(body, { password = PASSWORD, ip = '10.0.2.1' } = {}) {
  const headers = { 'Content-Type': 'application/octet-stream', 'CF-Connecting-IP': ip };
  if (password != null) headers['X-Private-Password'] = password;
  return mf.dispatchFetch('http://localhost/api/private-info/ocr', { method: 'POST', headers, body });
}

before(async () => {
  const result = await build({
    stdin: { contents: `import { Hono } from 'hono';
      import { privateInfoRoutes } from './worker/routes/privateinfo';
      import { privateInfoOcrRoutes } from './worker/routes/privateinfo-ocr';
      const app = new Hono();
      app.route('/api/private-info/ocr', privateInfoOcrRoutes);
      app.route('/api/private-info', privateInfoRoutes);
      export default app;`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
    // Wrangler ships the engine as a precompiled module; do the same here.
    plugins: [{ name: 'wasm-module', setup(b) {
      b.onResolve({ filter: /\.wasm$/ }, () => ({ path: './oar_ocr_rec.wasm', external: true }));
    } }],
  });
  mf = new Miniflare({
    modules: [
      { type: 'ESModule', path: 'index.mjs', contents: result.outputFiles[0].text },
      { type: 'CompiledWasm', path: 'oar_ocr_rec.wasm', contents: await readFile('worker/ocr/oar_ocr_rec.wasm') },
    ],
    d1Databases: ['DB'], r2Buckets: ['OCR_MODELS'], host: '127.0.0.1',
  });
  if (hasModel) {
    const bucket = await mf.getR2Bucket('OCR_MODELS');
    // A plain ArrayBuffer: Miniflare's proxy cannot serialise a Node Buffer.
    const tar = await readFile(MODEL);
    await bucket.put('PP-OCRv6_small_rec.tar', tar.buffer.slice(tar.byteOffset, tar.byteOffset + tar.byteLength));
  }
});
after(async () => { if (mf) await mf.dispose(); });

test('OCR is locked behind the private-info password', async () => {
  const image = await readFile('tests/fixtures/card-number.jpg');
  for (const [i, password] of [null, '', '20260117'].entries()) {
    const response = await ocr(image, { password, ip: '10.0.3.' + i });
    assert.equal(response.status, 401, String(password));
    assert.ok(!(await response.text()).includes('A123456'));
  }
});

test('OCR rejects missing and oversized pictures before running the model', async () => {
  assert.equal((await ocr(new Uint8Array(0))).status, 400);
  assert.equal((await ocr(new Uint8Array(1024 * 1024 + 1))).status, 413);
});

test('PP-OCRv6 small reads a cropped card number', { skip: !hasModel && `model not found at ${MODEL}` }, async () => {
  const image = await readFile('tests/fixtures/card-number.jpg');
  for (let run = 0; run < 2; run++) {
    const response = await ocr(image);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const result = await response.json();
    assert.equal(result.text, 'A123456(7)');
    assert.ok(result.score > 0.8, `score ${result.score}`);
  }
  // Something that is not a picture is the caller's mistake, and leaves the engine usable.
  assert.equal((await ocr(new TextEncoder().encode('not an image'))).status, 400);
  assert.equal((await (await ocr(image)).json()).text, 'A123456(7)');
});
