// ===== SCOOP OOH ASSETS - SERVICE WORKER =====
const CACHE_NAME = 'scoop-ooh-cache-v10';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/app.js',
  './icons/scoop_192x192.png',
  './icons/scoop_512x512.png',
];

// ===== INSTALL EVENT =====
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing new version...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Pre-caching essential assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// ===== ACTIVATE EVENT =====
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          })
      );
    })
  );
  self.clients.claim();
});

// ===== FETCH EVENT =====
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Serve from cache first
      if (cachedResponse) return cachedResponse;

      // Then try to fetch from network
      return fetch(event.request)
        .then(networkResponse => {
          // Clone before caching
          const responseClone = networkResponse.clone();

          caches.open(CACHE_NAME).then(cache => {
            // Only cache successful (200) and same-origin responses
            if (event.request.url.startsWith(self.location.origin) && networkResponse.ok) {
              cache.put(event.request, responseClone);
            }
          });

          return networkResponse;
        })
        .catch(() => {
          // Optionally return an offline fallback page
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// ===== OPTIONAL: AUTO-UPDATE NOTIFICATION =====
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
