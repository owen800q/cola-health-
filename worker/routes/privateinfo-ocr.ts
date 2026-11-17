import { Hono } from 'hono';
import type { Bindings } from '../index';
import { OcrInputError, recognizeLine } from '../lib/ocr';
import { requirePrivatePassword } from './privateinfo';

// Kept apart from the record routes so only this file pulls in the OCR engine.
export const privateInfoOcrRoutes = new Hono<{ Bindings: Bindings }>();

// A cropped card number is a few dozen KB; anything near this is not a crop.
const MAX_IMAGE_BYTES = 1024 * 1024;

privateInfoOcrRoutes.use('*', requirePrivatePassword);

// Reads the text in a cropped photo (e.g. a card number) with PP-OCRv6 small.
// The picture is only held in memory for the request; nothing is stored.
privateInfoOcrRoutes.post('/', async (c) => {
  if (!c.env.OCR_MODELS) return c.json({ error: '未設定文字辨識模型' }, 503);
  const image = new Uint8Array(await c.req.arrayBuffer());
  if (!image.length) return c.json({ error: '請提供圖片' }, 400);
  if (image.length > MAX_IMAGE_BYTES) return c.json({ error: '圖片太大，請裁細啲再試' }, 413);
  try {
    return c.json(await recognizeLine(c.env.OCR_MODELS, image));
  } catch (error) {
    if (error instanceof OcrInputError) return c.json({ error: '讀唔到呢張圖片，請再試' }, 400);
    console.error('private-info ocr failed:', error);
    return c.json({ error: '文字辨識暫時用唔到，請稍後再試' }, 500);
  }
});
