// ===== SCOOP OOH ASSETS - SERVICE WORKER =====
const CACHE_NAME = 'scoop-ooh-cache-v49';
const ASSETS_TO_CACHE = [
  './',
  "./index.html",
  "./login.html",
  "./manifest.json",
  "./assets/css/styles.css",
  "./assets/js/main.js",
  "./assets/js/login.js"
  './images/scooplogo_black_180x180.png',
  './images/scooplogo_black_192x192.png',
  './images/scooplogo_black_512x512.png',
];

// ===== INSTALL EVENT =====
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing new version...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Pre-caching essential assets...');
      // Use Promise.allSettled to prevent failure if a file is missing
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => cache.add(url))
      );
    }).then(() => self.skipWaiting())
  );
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
    }).then(() => self.clients.claim())
  );
});

// ===== FETCH EVENT =====
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Serve from cache if available
      if (cachedResponse) return cachedResponse;

      // Try network request
      return fetch(event.request)
        .then(networkResponse => {
          // Only cache successful same-origin requests
          if (
            networkResponse &&
            networkResponse.ok &&
            event.request.url.startsWith(self.location.origin)
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          // Optional: fallback for images, CSS, JS
          // return caches.match('./assets/images/fallback.png');
        });
    })
  );
});

// ===== AUTO-UPDATE SUPPORT =====
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
