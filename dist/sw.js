// SIXXAB AI service worker: offline shell, never caches API calls.
const CACHE = 'sixxab-2t3jph';
const PRECACHE = ["/","/login","/app","/assets/landing-1da8333.css","/assets/app-11valjs.css","/assets/landing-56E73D4S.js","/assets/login-HE2QDK7Y.js","/assets/app-UAFQYC74.js","/assets/chunk-VKJKSTLC.js","/assets/chunk-BNVJBQWY.js"];
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
