/**
 * ⚡ BNE Admin PWA Service Worker Engine (v2 Cache Busting)
 * --------------------------------------------------------
 * Enables offline caching, aggressive cache busting, and Chrome Native PWA Installation.
 */

const CACHE_NAME = 'bne-admin-cache-v2';
const ASSETS_TO_CACHE = [
  './admin.html',
  './admin-manifest.json',
  './style.css',
  './site-config.js',
  './images/bne-icon-192.png',
  './images/bne-icon-512.png',
  './images/admin-icon.png'
];

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker v2] Installing BNE Admin SW...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker v2] Caching fresh core assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker v2] Activating BNE Admin SW...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[ServiceWorker v2] Clearing stale cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        return networkResponse;
      });
    }).catch(() => {
      return caches.match('./admin.html');
    })
  );
});
