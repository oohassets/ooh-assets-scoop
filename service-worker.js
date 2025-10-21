// Auto-updating Service Worker — no manual cache bumping needed
const CACHE_NAME = 'scoop-cache-' + Date.now(); // new version on each deploy

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/scoop_512x512.ico',
  './icons/scoop_black_512x512.ico',
  './icons/scoop_black_512x512.png',
  './asset-digital-content.html' // optional: offline availability
];

// Install — cache assets and activate immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // activate instantly
});

// Activate — delete all old caches and take control of clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first strategy, update in background
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET requests for same-origin assets
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  event.respondWith(
    caches.match(request).then(cachedResponse => {
      const fetchPromise = fetch(request)
        .then(networkResponse => {
          caches.open(CACHE_NAME).then(cache => cache.put(request, networkResponse.clone()));
          return networkResponse;
        })
        .catch(() => cachedResponse);

      // Serve cached first (if available)
      return cachedResponse || fetchPromise;
    })
  );
});

// Force reload when a new service worker takes control
self.addEventListener('controllerchange', () => {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => client.navigate(client.url));
  });
});
