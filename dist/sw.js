// SIXXAB AI service worker: offline shell, never caches API calls.
const CACHE = 'sixxab-1kdg1cj';
const PRECACHE = ["/","/login","/app","/assets/landing-5o1ruk.css","/assets/app-778nxj.css","/assets/landing-RUEAMOEP.js","/assets/login-Q6AJH7ZH.js","/assets/app-OWYM2IXX.js","/assets/chunk-DFNXPYYK.js","/assets/chunk-3PQJVX4Y.js"];
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
