import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';
import { babyRoutes } from './routes/baby';
import { feedRoutes } from './routes/feed';
import { diaperRoutes } from './routes/diaper';
import { sleepRoutes } from './routes/sleep';
import { vaccineRoutes } from './routes/vaccine';
import { growthRoutes } from './routes/growth';
import { reminderRoutes } from './routes/reminder';
import { statsRoutes } from './routes/stats';
import { exportRoutes } from './routes/export';
import { pushRoutes } from './routes/push';
import { timelineRoutes } from './routes/timeline';

export type Bindings = {
  DB: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/api/*', cors());

// Initialize DB on first request
app.use('/api/*', async (c, next) => {
  await next();
});

app.route('/api/baby', babyRoutes);
app.route('/api/feeds', feedRoutes);
app.route('/api/diapers', diaperRoutes);
app.route('/api/sleeps', sleepRoutes);
app.route('/api/vaccines', vaccineRoutes);
app.route('/api/growth', growthRoutes);
app.route('/api/reminders', reminderRoutes);
app.route('/api/stats', statsRoutes);
app.route('/api/export', exportRoutes);
app.route('/api/push', pushRoutes);
app.route('/api/timeline', timelineRoutes);

// Serve static files from Workers Sites KV
app.get('*', serveStatic({ root: './' }));
// SPA fallback - serve index.html for unmatched routes
app.get('*', serveStatic({ path: './index.html' }));

export default app;
