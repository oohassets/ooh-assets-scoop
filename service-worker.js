const CACHE_NAME = 'scoop-cache-' + Date.now(); // auto version each deploy

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/scoop_512x512.ico',
  './icons/scoop_black_512x512.ico'
];

// Install event — cache all assets
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

// Fetch event — use cache first, then network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(resp => 
      resp || fetch(event.request).then(response => {
        // Optionally update cache for new files
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, response.clone());
          return response;
        });
      }).catch(() => resp) // fallback if offline
    )
  );
});
