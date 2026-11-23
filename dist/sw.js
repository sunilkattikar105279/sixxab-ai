// SIXXAB AI service worker: offline shell, never caches API calls.
const CACHE = 'sixxab-smpygn';
const PRECACHE = ["/","/login","/app","/assets/landing-1j2lhsr.css","/assets/app-11valjs.css","/assets/landing-PJSS2NJA.js","/assets/login-SAK6AMNO.js","/assets/app-QXSJO6Q5.js","/assets/chunk-TMORM5E7.js","/assets/chunk-3PQJVX4Y.js"];
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
