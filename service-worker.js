// ===== SCOOP OOH ASSETS - SERVICE WORKER =====
const CACHE_NAME = 'scoop-ooh-cache-v83.2';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './manifest.json',
  './assets/css/styles.css',
  './assets/js/main.js',
  './assets/js/login.js',
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
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {

      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then(networkResponse => {
          if (
            networkResponse &&
            networkResponse.ok &&
            event.request.url.startsWith(self.location.origin)
          ) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, clone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
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
