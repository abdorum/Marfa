// Offline support. Raad's API is never cached here: student data lives in
// the device store, sealed, written by the app itself. The build stamps a new
// version (vite.config.ts), so each update replaces the old cache.
const VERSION = 'taleeb-__BUILD__';
/** A page that takes longer than this opens from the cache, then updates for next time. */
const NAVIGATE_WAIT_MS = 3000;
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/avatars.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const put = (req, res) => {
  if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
  return res;
};

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // The owner's page is not the app: never from the cache, never cached as it.
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return;

  // Pages: network first, so updates arrive; the cached shell when offline or
  // when the network is too slow, so the app opens at once with what it has.
  if (req.mode === 'navigate') {
    const net = fetch(req).then(res => put('/', res));
    e.waitUntil(net.catch(() => {}));
    e.respondWith(new Promise(resolve => {
      const timer = setTimeout(() => caches.match('/').then(hit => hit && resolve(hit)), NAVIGATE_WAIT_MS);
      net.then(res => { clearTimeout(timer); resolve(res); })
        .catch(() => { clearTimeout(timer); caches.match('/').then(hit => resolve(hit || Response.error())); });
    }));
    return;
  }
  // Hashed build files never change: cache first.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res))));
    return;
  }
  // Everything else: cached copy now, refreshed in the background.
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => put(req, res)).catch(() => hit || Response.error());
    return hit || net;
  }));
});
