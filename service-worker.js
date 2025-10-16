// service-worker.js

const CACHE_NAME = 'scoop-assets-v1';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './scoop_512x512.ico',
  './scoop_32x32.ico',
  './manifest.json'
];

// Install: cache app files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache first, then network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});

