// 🚀 Auto-Updating Service Worker (with update notification)
const CACHE_VERSION = 'scoop-cache-v' + new Date().toISOString().split('T')[0];
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/scoop_512x512.ico',
  './icons/scoop_black_192x192.png',
  './icons/scoop_black_512x512.ico',
  './icons/scoop_black_512x512.png',
  './asset-digital-content.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first with background update
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req)
        .then(networkRes => {
          caches.open(CACHE_VERSION).then(cache => cache.put(req, networkRes.clone()));
          return networkRes;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ✅ Notify all pages when a new SW takes over
self.addEventListener('activate', () => {
  self.clients.matchAll({ type: 'window' }).then(clients => {
    for (const client of clients) {
      client.postMessage({ type: 'NEW_VERSION_READY' });
    }
  });
});

// Handle skip waiting
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
