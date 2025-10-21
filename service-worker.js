// Updated service worker (no video, optimized caching)
const CACHE_VERSION = 'v2.0';
const CACHE_NAME = `scoop-cache-${CACHE_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/scoop_512x512.ico',
  './icons/scoop_black_512x512.ico',
  './icons/scoop_black_512x512.png'
];

// Install event — cache key static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // activate immediately
});

// Activate event — remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim(); // control all clients immediately
});

// Fetch event — cache-first strategy for same-origin assets
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Only cache GET requests for same-origin resources
  if (req.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then(cachedResponse => {
      if (cachedResponse) {
        // Return cached file, update in background
        fetch(req).then(freshResponse => {
          caches.open(CACHE_NAME).then(cache => cache.put(req, freshResponse.clone()));
        }).catch(() => {});
        return cachedResponse;
      }

      // Fetch from network if not in cache
      return fetch(req)
        .then(networkResponse => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(req, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => cachedResponse); // fallback if offline
    })
  );
});
