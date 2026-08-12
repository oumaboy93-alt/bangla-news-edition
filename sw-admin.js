/**
 * ⚡ BNE Dedicated Admin Service Worker (Isolated PWA Engine)
 * -----------------------------------------------------------
 * Strictly isolated for admin.html to enable PWA installation
 * without affecting the main news portal.
 */

const CACHE_NAME = 'bne-admin-isolated-v3';
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
  console.log('[Isolated Admin SW] Installing...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Isolated Admin SW] Caching admin assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[Isolated Admin SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Isolated Admin SW] Deleting legacy cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  /* Only handle admin specific requests to avoid scope bleed */
  if (!url.pathname.includes('admin') && !url.pathname.includes('bne-icon') && !url.pathname.includes('style.css')) {
    return;
  }

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
