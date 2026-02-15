const CACHE_NAME = 'cola-health-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/css/app.css',
  '/js/api.js',
  '/js/app.js',
  'https://fastly.jsdelivr.net/npm/vant@4/lib/index.css',
  'https://fastly.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js',
  'https://fastly.jsdelivr.net/npm/vue-router@4/dist/vue-router.global.prod.js',
  'https://fastly.jsdelivr.net/npm/vant@4/lib/vant.min.js',
];

// Install event — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch event — network first for API, cache first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: Network First
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone and cache successful GET responses
          if (event.request.method === 'GET' && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache for GET requests
          if (event.request.method === 'GET') {
            return caches.match(event.request);
          }
          return new Response(JSON.stringify({ error: '離線模式' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        })
    );
    return;
  }

  // Static assets: Cache First, fallback to network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Stale While Revalidate — serve cache and update in background
        fetch(event.request).then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response);
            });
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  let data = { title: '可樂仔健康記錄', body: '你有一個新提醒' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    vibrate: [200, 100, 200],
    data: data.data || { url: '/' },
    actions: [],
    tag: data.tag || 'default',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click — open app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(urlToOpen);
    })
  );
});
