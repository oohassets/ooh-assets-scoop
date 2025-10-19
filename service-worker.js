const CACHE_NAME = 'scoop-cache-v3'; // 🔁 increment version when files update
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/scoop_512x512.png',
  './icons/scoop_black_512x512.ico',
  './icons/thepearl.mp4'
];

// ✅ INSTALL: pre-cache essential files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // activate immediately
});

// ✅ ACTIVATE: remove old caches and claim pages
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim(); // take control of all pages right away
});

// ✅ FETCH: network-first for HTML, cache-first for others
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // HTML requests → network-first
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          return response;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Other requests → cache-first fallback to network
  event.respondWith(
    caches.match(req).then(cached =>
      cached ||
      fetch(req).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return response;
      })
    )
  );
});

// ✅ AUTO REFRESH CLIENTS when a new SW is activated
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', async event => {
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window' });
      for (const client of clientsList) {
        client.navigate(client.url); // 🔄 refresh page automatically
      }
    })()
  );
});
