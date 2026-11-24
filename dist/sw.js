// SIXXAB AI service worker: offline shell, never caches API calls.
const CACHE = 'sixxab-1wr09wd';
const PRECACHE = ["/","/login","/app","/assets/landing-1da8333.css","/assets/app-157xe4a.css","/assets/landing-ZNBDO4FT.js","/assets/login-AAZ42USS.js","/assets/app-ZWWPEQBZ.js","/assets/chunk-ZXNBBQGZ.js","/assets/chunk-M5GVXBFQ.js"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match(url.pathname.startsWith('/app') ? '/app' : '/'))));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
