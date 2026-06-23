// ===== SCOOP OOH ASSETS - SERVICE WORKER =====
const CACHE_NAME = 'scoop-ooh-cache-v117.20';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './manifest.json',
  // Organized CSS
  './assets/css/theme.css',
  './assets/css/layout.css',
  './assets/css/navigation.css',
  './assets/css/dashboard.css',
  './assets/css/content-inventory.css',
  // Organized JS
  './assets/js/app.js',
  './assets/js/router.js',
  './assets/js/theme.js',
  './assets/js/maps.js',
  './assets/js/asset-rates.js',
  './assets/js/authGuard.js',
  './assets/js/navigation.js',
  './assets/js/utils.js',
  './assets/js/scoop-ai.js',
  // Firebase
  './firebase/firebase.js',
  // Pages
  './pages/dashboard.html',
  './pages/bookings.html',
  './pages/content-inventory.html',
  './pages/vehicle-report.html',
  './pages/asset-dimension-checker.html',
  './pages/image-compressor.html',
  // Legacy JS still needed by sub-pages
  './assets/js/login.js',
  // Images
  './images/scooplogo_black_180x180.png',
  './images/scooplogo_black_192x192.png',
  './images/scooplogo_black_512x512.png',
];

importScripts("https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA4amK6CZuiU3_Nfaw4OLD17BqWrX0VYAA",
  authDomain: "scoopassets.firebaseapp.com",
  projectId: "scoopassets",
  storageBucket: "scoopassets.firebasestorage.app",
  messagingSenderId: "989559041483",
  appId: "1:989559041483:web:0feba5f279189f03791a4",
  databaseURL: "https://scoopassets-default-rtdb.firebaseio.com/"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/ooh-assets-scoop/logo.png"
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});


// ===== INSTALL EVENT =====
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing new version...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Pre-caching essential assets...');
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
  // Skip cross-origin requests — let the browser handle them natively.
  // Intercepting them causes CORS preflight to fail and returns an
  // unconvertible undefined when .catch() has no non-navigate fallback.
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.ok && networkResponse.status !== 206) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          // Return a proper 503 so respondWith() never receives undefined
          return new Response('Network unavailable', { status: 503 });
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
