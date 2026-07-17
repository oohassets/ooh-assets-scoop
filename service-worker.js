// ===== SCOOP OOH ASSETS - SERVICE WORKER =====
const CACHE_NAME = 'scoop-ooh-cache-v243'; // Update this version to force cache refresh

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
  './assets/css/bookings.css',
  './assets/css/splash.css',
  // Organized JS
  './assets/js/pwa.js',
  './assets/js/app.js',
  './assets/js/router.js',
  './assets/js/theme.js',
  './assets/js/maps.js',
  './assets/js/asset-location-menu.js',
  './assets/js/asset-rates.js',
  './assets/js/circuit-map.js',
  './assets/js/authGuard.js',
  './assets/js/navigation.js',
  './assets/js/utils.js',
  './assets/js/scoop-ai.js',
  './assets/js/notifications.js',
  './assets/js/rtdb-root.js',
  './assets/js/load-chartjs.js',
  // Firebase
  './firebase/firebase.js',
  // Pages
  './pages/splash.html',
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
  './images/screenshot-desktop.png',
  './images/screenshot-mobile.png',
  './images/thepearlisland.jpg',
  './images/udcpattern.png',
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
  console.log(`[SW] 🔧 Installing ${CACHE_NAME}`);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log(`[SW] 📦 Caching ${ASSETS_TO_CACHE.length} assets...`);
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url =>
          cache.add(url).catch(err => console.warn(`[SW] ⚠️ Failed to cache: ${url}`, err))
        )
      );
    }).then(results => {
      const failed = results.filter(r => r.status === 'rejected').length;
      console.log(`[SW] ✅ Install complete — ${ASSETS_TO_CACHE.length - failed} cached, ${failed} failed`);
      console.log('[SW] ⏭️ Calling skipWaiting() — taking control immediately');
      return self.skipWaiting();
    })
  );
});

// ===== ACTIVATE EVENT =====
self.addEventListener('activate', event => {
  console.log(`[SW] ⚡ Activating ${CACHE_NAME}`);
  event.waitUntil(
    caches.keys().then(keys => {
      const old = keys.filter(k => k !== CACHE_NAME);
      if (old.length) {
        console.log(`[SW] 🗑️ Removing ${old.length} old cache(s):`, old);
      } else {
        console.log('[SW] ✨ No old caches to remove');
      }
      return Promise.all(old.map(k => caches.delete(k)));
    }).then(() => {
      console.log('[SW] 🎉 Activated and claiming clients');
      return self.clients.claim();
    })
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
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] ⏭️ SKIP_WAITING received — activating now');
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    console.log(`[SW] 📋 Version requested — responding with ${CACHE_NAME}`);
    event.source?.postMessage({ type: 'SW_VERSION', version: CACHE_NAME });
  }
});
