/**
 * ⚡ BNE Main-Site Service Worker (v1)
 * --------------------------------------------------------
 * - Offline caching of core assets (HTML, CSS, JS, images)
 * - Network-first for page navigations (সর্বদা তাজা খবর)
 * - Stale-while-revalidate for static assets (দ্রুত লোড)
 * - Cross-origin (RSS/proxy) requests স্পর্শ করে না
 */

const CACHE_NAME = 'bne-main-v1';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './site-config.js',
  './about-us.html',
  './privacy-policy.html',
  './contact-us.html',
  './admin.html',
  './manifest.webmanifest',
  './admin-manifest.json',
  './images/bne-icon-192.png',
  './images/bne-icon-512.png',
  './images/admin-icon.png',
  './images/national.jpg',
  './images/politics.jpg',
  './images/economy.jpg',
  './images/international.jpg',
  './images/sports.jpg',
  './images/entertainment.jpg',
  './images/technology.jpg',
  './images/health.jpg',
  './images/bne-og-cover.jpg',
  './images/bne-logo.png'
];

/* প্রতিটি অ্যাসেট আলাদা করে ক্যাশ — একটি ব্যর্থ হলেও ইনস্টল থেমে যায় না */
self.addEventListener('install', (event) => {
  console.log('[BNE SW] Installing...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) => cache.add(url))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[BNE SW] Activating...');
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* কেবল same-origin নিয়ন্ত্রণ */
  if (url.origin !== self.location.origin) return;

  /* পেজ নেভিগেশন → network-first, অফলাইনে ক্যাশড index.html */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  /* স্ট্যাটিক অ্যাসেট → stale-while-revalidate */
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
