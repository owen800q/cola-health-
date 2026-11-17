// PP-OCRv6 small text-line recognition inside the Worker.
//
// The engine is `ocr-wasm/` (oar-ocr's recognition pipeline on a pure-Rust
// ONNX runtime), compiled to WebAssembly and committed as
// `worker/ocr/oar_ocr_rec.wasm`. The 21 MB model is too big to bundle, so it is
// streamed from R2 into the module's memory the first time an isolate needs it.
import engine from '../ocr/oar_ocr_rec.wasm';

/** PaddleOCR export: an uncompressed tar holding `inference.onnx`. */
const MODEL_ARCHIVE = 'PP-OCRv6_small_rec.tar';
const MODEL_FILE = 'inference.onnx';
/** Model input width at height 48: crops up to 10:1 keep their proportions. */
const INPUT_WIDTH = 480;
const TAR_BLOCK = 512;

type Engine = {
  memory: WebAssembly.Memory;
  ocr_alloc(len: number): number;
  ocr_free(ptr: number, len: number): void;
  ocr_load(ptr: number, len: number, width: number): number;
  ocr_recognize(ptr: number, len: number): number;
  ocr_score(): number;
  ocr_result_ptr(): number;
  ocr_result_len(): number;
};

export type OcrResult = { text: string; score: number };

/** The picture could not be read; the caller sent something unusable. */
export class OcrInputError extends Error {}

let loading: Promise<Engine> | null = null;

function resultText(ocr: Engine): string {
  return new TextDecoder().decode(new Uint8Array(ocr.memory.buffer, ocr.ocr_result_ptr(), ocr.ocr_result_len()));
}

/** Finds a file inside an uncompressed tar using ranged reads only. */
async function locateInTar(bucket: R2Bucket, key: string, file: string): Promise<{ offset: number; length: number }> {
  let offset = 0;
  for (let entry = 0; entry < 32; entry++) {
    const head = await bucket.get(key, { range: { offset, length: TAR_BLOCK } });
    if (!head) throw new Error(`OCR model ${key} is missing from the bucket`);
    const header = new Uint8Array(await head.arrayBuffer());
    if (header.length < TAR_BLOCK || header[0] === 0) break;
    const field = (start: number, length: number) =>
      new TextDecoder().decode(header.subarray(start, start + length)).split('\0')[0].trim();
    const length = parseInt(field(124, 12), 8);
    if (!Number.isFinite(length)) break;
    if (field(0, 100).replace(/^\.\//, '') === file) return { offset: offset + TAR_BLOCK, length };
    offset += TAR_BLOCK + Math.ceil(length / TAR_BLOCK) * TAR_BLOCK;
  }
  throw new Error(`${file} not found in ${key}`);
}

async function load(bucket: R2Bucket): Promise<Engine> {
  const ocr = new WebAssembly.Instance(engine, {}).exports as unknown as Engine;
  const { offset, length } = await locateInTar(bucket, MODEL_ARCHIVE, MODEL_FILE);
  const model = await bucket.get(MODEL_ARCHIVE, { range: { offset, length } });
  if (!model) throw new Error(`OCR model ${MODEL_ARCHIVE} is missing from the bucket`);

  // Stream straight into the module's memory so the model is never held twice.
  const ptr = ocr.ocr_alloc(length);
  let written = 0;
  const reader = model.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (written + value.length > length) throw new Error('OCR model is larger than its tar entry');
    new Uint8Array(ocr.memory.buffer, ptr + written, value.length).set(value);
    written += value.length;
  }
  if (written !== length) throw new Error(`OCR model truncated: ${written} of ${length} bytes`);
  const status = ocr.ocr_load(ptr, length, INPUT_WIDTH);
  ocr.ocr_free(ptr, length);
  if (status !== 0) throw new Error('OCR model failed to load: ' + resultText(ocr));
  return ocr;
}

/** Reads the single line of text in a tightly cropped JPEG or PNG. */
export async function recognizeLine(bucket: R2Bucket, image: Uint8Array): Promise<OcrResult> {
  // One engine per isolate. A failed load is forgotten so the next call retries.
  const pending = (loading ??= load(bucket));
  let ocr: Engine;
  try {
    ocr = await pending;
  } catch (error) {
    if (loading === pending) loading = null;
    throw error;
  }
  try {
    const ptr = ocr.ocr_alloc(image.length);
    new Uint8Array(ocr.memory.buffer, ptr, image.length).set(image);
    const status = ocr.ocr_recognize(ptr, image.length);
    ocr.ocr_free(ptr, image.length);
    if (status !== 0) throw new OcrInputError(resultText(ocr));
    return { text: resultText(ocr).trim(), score: ocr.ocr_score() };
  } catch (error) {
    // A trap (e.g. out of memory) leaves the instance unusable: start afresh.
    if (!(error instanceof OcrInputError) && loading === pending) loading = null;
    throw error;
  }
}
