// Builds the launch site into dist/ (static, prerendered) and the API functions into api/ (bundled, zero runtime deps).
// Usage: npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const apiOut = path.join(root, 'api');
const SITE = 'https://sixxab.ai';
const TITLE = 'SIXXAB AI | AI that starts, scales and runs your business';
const DESC = 'Your first employee and your whole team: Founder, CXO and department AI agents that plan, build, market and sell around the clock, with you in command.';

fs.rmSync(dist, { recursive: true, force: true });
fs.rmSync(apiOut, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });

const common = { bundle: true, minify: true, sourcemap: false, target: ['es2020'], jsx: 'automatic', legalComments: 'none', logLevel: 'warning', define: { 'process.env.NODE_ENV': '"production"' } };

// 1. Client bundles
await esbuild.build({
  ...common,
  entryPoints: { landing: 'src/entries/landing.tsx', login: 'src/entries/login.tsx', app: 'src/entries/app.tsx' },
  outdir: path.join(dist, 'assets'),
  format: 'esm',
  splitting: true,
  chunkNames: 'chunk-[hash]',
  entryNames: '[name]-[hash]',
  metafile: true,
  absWorkingDir: root,
}).then((r) => fs.writeFileSync(path.join(root, '.build-meta.json'), JSON.stringify(r.metafile.outputs)));
const outputs = JSON.parse(fs.readFileSync(path.join(root, '.build-meta.json'), 'utf8'));
fs.rmSync(path.join(root, '.build-meta.json'));
const asset = (entry) => '/' + path.relative(dist, path.join(root, Object.keys(outputs).find((k) => outputs[k].entryPoint === entry)));

// 2. CSS (hashed)
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
const landingCss = fs.readFileSync('src/landing/styles.css', 'utf8') + '\nhtml{scroll-behavior:smooth}\n';
const appCss = fs.readFileSync('src/app/app.css', 'utf8');
const lcName = `/assets/landing-${hash(landingCss)}.css`;
const acName = `/assets/app-${hash(appCss)}.css`;
fs.writeFileSync(path.join(dist, lcName), landingCss);
fs.writeFileSync(path.join(dist, acName), appCss);

// 3. Prerender the landing page (SEO + instant paint), then hydrate on the client.
const ssrFile = path.join(root, '.ssr.mjs');
await esbuild.build({ ...common, minify: false, entryPoints: ['scripts/ssr-entry.tsx'], outfile: ssrFile, format: 'esm', platform: 'node', absWorkingDir: root, external: ['react', 'react-dom'] });
const { render } = await import(pathToFileURL(ssrFile).href + `?t=${Date.now()}`);
const landingHtml = render();
fs.rmSync(ssrFile);

const head = ({ title = TITLE, desc = DESC, pathName = '/', css }) => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${SITE}${pathName}">
<meta name="theme-color" content="#02060f">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SIXXAB AI">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${SITE}${pathName}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/og.png">
<link rel="icon" href="/icons/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="SIXXAB">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@100..800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${css}">`;

const page = ({ body, script, ...h }) => `<!doctype html>
<html lang="en">
<head>
${head(h)}
</head>
<body>
<div id="root">${body}</div>
${script ? `<script type="module" src="${script}"></script>` : ''}
</body>
</html>
`;

const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'SIXXAB AI', url: SITE, logo: `${SITE}/icons/icon-512.png`, email: 'sunil.kattikar@gmail.com', founder: { '@type': 'Person', name: 'Sunil Kattikar' } });
fs.writeFileSync(path.join(dist, 'index.html'), page({ body: landingHtml, script: asset('src/entries/landing.tsx'), css: lcName }).replace('</head>', `<script type="application/ld+json">${ld}</script>\n</head>`));
fs.writeFileSync(path.join(dist, 'login.html'), page({ title: 'Sign in | SIXXAB AI', pathName: '/login', body: '', script: asset('src/entries/login.tsx'), css: acName }));
fs.mkdirSync(path.join(dist, 'app'), { recursive: true });
fs.writeFileSync(path.join(dist, 'app', 'index.html'), page({ title: 'Workspace | SIXXAB AI', pathName: '/app', body: '', script: asset('src/entries/app.tsx'), css: acName }).replace('<meta name="description"', '<meta name="robots" content="noindex">\n<meta name="description"'));

// 4. Legal pages
const legalSrc = JSON.parse(fs.readFileSync('content/legal.json', 'utf8'));
for (const [slug, doc] of Object.entries(legalSrc)) {
  const body = `<main class="legal"><p><a href="/">&larr; SIXXAB AI</a></p><h1>${doc.title}</h1><p class="muted">Effective ${doc.effective}</p>${doc.sections.map((s) => `<h2>${s.h}</h2>${s.p.map((x) => `<p>${x}</p>`).join('')}`).join('')}</main>`;
  fs.writeFileSync(path.join(dist, `${slug}.html`), page({ title: `${doc.title} | SIXXAB AI`, desc: doc.title, pathName: `/${slug}`, body, css: acName }));
}
fs.writeFileSync(path.join(dist, '404.html'), page({ title: 'Not found | SIXXAB AI', body: '<main class="legal"><h1>Page not found</h1><p><a href="/">Go to the SIXXAB AI home page</a></p></main>', css: acName }));

// 5. PWA: icons, manifest, service worker, OG image, robots, sitemap
const markSvg = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#02060f"/><defs><radialGradient id="g" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#ffe2b2" stop-opacity=".35"/><stop offset="1" stop-color="#02060f" stop-opacity="0"/></radialGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/><g transform="translate(${pad} ${(size - (size - 2 * pad) * 17 / 23) / 2}) scale(${(size - 2 * pad) / 23})" fill="#ffffff"><path d="M8.15 0.9 L4.55 0.9 L0.5 9.3 L4.1 9.3 Z"/><path d="M17.0 0 L13.4 0 L6.15 16.4 L9.75 16.4 Z"/><path d="M22.9 0 L19.3 0 L15.0 7.6 L18.6 7.6 Z"/><path d="M22.6 6.9 L19.0 6.9 L14.05 16.4 L17.65 16.4 Z"/></g></svg>`;
const icons = [['icon-192.png', 192, 36], ['icon-512.png', 512, 96], ['maskable-512.png', 512, 140], ['apple-touch-icon.png', 180, 34], ['favicon-32.png', 32, 4]];
for (const [name, size, pad] of icons) await sharp(Buffer.from(markSvg(size, pad))).png().toFile(path.join(dist, 'icons', name));
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#02060f"/><defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#ffd696" stop-opacity=".45"/><stop offset=".35" stop-color="#3a5aa0" stop-opacity=".2"/><stop offset="1" stop-color="#02060f" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="630" fill="url(#g)"/><g transform="translate(80 80) scale(2.6)" fill="#fff"><path d="M8.15 0.9 L4.55 0.9 L0.5 9.3 L4.1 9.3 Z"/><path d="M17.0 0 L13.4 0 L6.15 16.4 L9.75 16.4 Z"/><path d="M22.9 0 L19.3 0 L15.0 7.6 L18.6 7.6 Z"/><path d="M22.6 6.9 L19.0 6.9 L14.05 16.4 L17.65 16.4 Z"/></g><text x="160" y="122" font-family="DejaVu Sans, Arial, sans-serif" font-size="40" letter-spacing="8" fill="#fff">SIXXAB <tspan fill="#ffe2b2">AI</tspan></text><text x="80" y="330" font-family="DejaVu Sans, Arial, sans-serif" font-size="72" fill="#fff">Start it. Scale it. Run it.</text><text x="80" y="420" font-family="DejaVu Sans, Arial, sans-serif" font-size="44" fill="#ffe2b2">AI that runs your company.</text><text x="80" y="540" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#a2a9b8">The solo founder's standing army · sixxab.ai</text></svg>`;
await sharp(Buffer.from(og)).png().toFile(path.join(dist, 'og.png'));

fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify({
  name: 'SIXXAB AI', short_name: 'SIXXAB', description: DESC, start_url: '/app', scope: '/', display: 'standalone', orientation: 'portrait',
  background_color: '#02060f', theme_color: '#02060f',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

const precache = ['/', '/login', '/app', lcName, acName, ...Object.keys(outputs).filter((k) => k.endsWith('.js')).map((k) => '/' + path.relative(dist, path.join(root, k)))];
const version = hash(precache.join('|') + landingHtml.length);
fs.writeFileSync(path.join(dist, 'sw.js'), `// SIXXAB AI service worker: offline shell, never caches API calls.
const CACHE = 'sixxab-${version}';
const PRECACHE = ${JSON.stringify(precache)};
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
`);
fs.writeFileSync(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /app\nSitemap: ${SITE}/sitemap.xml\n`);
fs.writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/login', '/privacy', '/terms'].map((p) => `<url><loc>${SITE}${p}</loc></url>`).join('')}</urlset>\n`);

// 5b. Build info for the admin Governance tab: code size, tests, security config (no secrets).
{
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const src = ['core', 'server', 'src', 'scripts'].flatMap((d) => walk(d)).filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !f.endsWith('build-info.ts'));
  const lines = src.reduce((n, f) => n + fs.readFileSync(f, 'utf8').split('\n').length, 0);
  const tests = walk('tests').filter((f) => /\.test\.ts$/.test(f)).reduce((n, f) => n + (fs.readFileSync(f, 'utf8').match(/^test\(/gm) ?? []).length, 0);
  const e2e = (fs.readFileSync('tests/e2e.mjs', 'utf8').match(/^await check\(/gm) ?? []).length;
  const migrations = walk('supabase/migrations').map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const rlsTables = (migrations.match(/enable row level security/gi) ?? []).length;
  const cspHeader = /Content-Security-Policy/.test(fs.readFileSync('vercel.json', 'utf8'));
  const apiRoutes = fs.readdirSync('server/api').filter((f) => f.endsWith('.ts')).length;
  const info = { builtAt: new Date().toISOString(), files: src.length, lines, tests, e2e, rlsTables, cspHeader, apiRoutes };
  fs.writeFileSync('server/build-info.ts', `// Generated by scripts/build.mjs. Do not edit.\nexport const BUILD_INFO = ${JSON.stringify(info, null, 2)};\n`);
}

// 6. API functions: one bundled ESM file per route, no node_modules needed at runtime.
const routes = fs.readdirSync('server/api').filter((f) => f.endsWith('.ts'));
await esbuild.build({
  entryPoints: routes.map((f) => path.join('server/api', f)),
  outdir: apiOut,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node20'],
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
  absWorkingDir: root,
  banner: { js: '// Generated by scripts/build.mjs from server/api. Do not edit.' },
});

const size = (dir) => fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()).length;
console.log(`Built dist/ (${size(dist)} files) and api/ (${routes.length} routes)`);
