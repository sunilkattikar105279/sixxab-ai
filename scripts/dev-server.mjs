// Local preview that mirrors Vercel: static dist/ with clean URLs + api/*.js functions.
// Usage: node scripts/dev-server.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const port = Number(process.argv[2] || 4173);
// Apply the same global headers as production (CSP etc.) so local checks catch policy breakage.
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const globalHeaders = Object.fromEntries((vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? []).map((h) => [h.key, h.value]));
const _writeHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (status, headers) {
  return _writeHead.call(this, status, { ...globalHeaders, ...(headers || {}) });
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml' };

function resolveStatic(p) {
  const clean = decodeURIComponent(p.split('?')[0]);
  const candidates = [clean, `${clean}.html`, path.join(clean, 'index.html')];
  if (clean.startsWith('/app')) candidates.push('/app/index.html');
  for (const c of candidates) {
    const f = path.join(dist, c);
    if (f.startsWith(dist) && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/api/')) {
    let name = url.pathname.slice(5).replace(/\/$/, '');
    // Mirror vercel.json: the account and admin endpoints share one function.
    if (['me', 'admin', 'governance', 'billing', 'raise', 'crm', 'support', 'accounts'].includes(name)) { url.searchParams.set('route', name); name = 'platform'; }
    const file = path.join(root, 'api', `${name}.js`);
    if (!/^[a-z-]+$/.test(name) || !fs.existsSync(file)) { res.writeHead(404).end('{"error":"not found"}'); return; }
    const mod = await import(pathToFileURL(file).href);
    const handler = mod[req.method];
    if (!handler) { res.writeHead(405).end(); return; }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
    const out = await handler(request);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
    return;
  }
  const f = resolveStatic(url.pathname);
  if (!f) { res.writeHead(404, { 'content-type': TYPES['.html'] }).end(fs.readFileSync(path.join(dist, '404.html'))); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
}).listen(port, () => console.log(`Preview on http://localhost:${port}`));
