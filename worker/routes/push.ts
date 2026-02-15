import { Hono } from 'hono';
import type { Bindings } from '../index';

export const pushRoutes = new Hono<{ Bindings: Bindings }>();

// POST /api/push/subscribe
pushRoutes.post('/subscribe', async (c) => {
  const db = c.env.DB;
  const { endpoint, keys } = await c.req.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return c.json({ error: 'Invalid subscription' }, 400);
  }

  await db.prepare(`
    INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth)
    VALUES (?, ?, ?)
  `).bind(endpoint, keys.p256dh, keys.auth).run();

  return c.json({ ok: true });
});

// DELETE /api/push/unsubscribe
pushRoutes.delete('/unsubscribe', async (c) => {
  const db = c.env.DB;
  const { endpoint } = await c.req.json();
  if (!endpoint) {
    return c.json({ error: 'endpoint is required' }, 400);
  }
  await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
  return c.json({ ok: true });
});

// POST /api/push/test
pushRoutes.post('/test', async (c) => {
  // In production, this would use web-push library to send actual push
  // For now, return success to indicate the endpoint works
  return c.json({ ok: true, message: 'Test notification would be sent' });
});

// GET /api/push/vapid-key
pushRoutes.get('/vapid-key', async (c) => {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || '' });
});
