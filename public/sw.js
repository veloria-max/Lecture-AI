'use strict';
/* Service worker: caches the app shell so the app opens and runs offline.
   - App shell + static assets: cache-first (works with no network).
   - API calls (/api, /ws): network-only;
     offline, the app falls back to local IndexedDB data in app.js.
   Bump CACHE on each release so clients pick up new assets. */
const CACHE = 'lecturenotes-v24';
const SHELL = [
  '/',
  '/index.html',
  '/app.js?v=26',
  '/whisper.js?v=26',
  '/styles.css?v=26',
  '/db.js?v=26',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-maskable.svg',
];
// Note: the Whisper worker (/whisper-worker.js) and the transformers.js library
// (cross-origin CDN) + model weights are cached separately by the browser and by
// transformers.js's own Cache Storage after the first online run.

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // Per-URL so one bad entry doesn't void the whole shell (addAll is atomic).
      Promise.allSettled(SHELL.map((u) => c.add(u).catch((err) => { console.warn('[sw] precache failed', u, err); })))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isApi(url) {
  return url.pathname.startsWith('/api/') ||
         url.pathname.startsWith('/ws/');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // never cache mutations
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // let cross-origin (model CDN) go to network
  if (isApi(url)) return;                            // API: default network; app handles offline

  // Static/app shell: cache-first, then network, then cached index for navigations.
  e.respondWith(
    caches.match(req, { ignoreSearch: false }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        try {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        } catch {}
        return res;
      }).catch(async () => {
        if (req.mode === 'navigate') return (await caches.match('/index.html')) || Response.error();
        return Response.error();
      });
    })
  );
});
