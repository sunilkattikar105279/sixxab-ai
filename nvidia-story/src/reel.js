// SIXXAB Money · The Nvidia story (9:16), Nov 13, 2026. Facts: founded 1993; CUDA 2006; AlexNet 2012; first $5T company Oct 29 2025 (AP/Reuters);
// 1996 NV1 failure, ~1 month of cash; Q4 2018 -54% (CNBC); DeepSeek Jan 27 2025 -$589B (Bloomberg); SEC $5.5M settlement May 2022;
// Nov 12 2026: Huang resigned (Nvidia 8-K) after admitting an affair; U.S. officials tied the woman to Chinese intelligence (NYT); China denies.
import { RAW, SEC, DUR as VDUR, TITLE, HOST } from './words.js';
import { LV } from './levels.js';
export const W = 1080, H = 1920;
export const DUR = VDUR;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const ss = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const ease = (t, a, b) => ss((t - a) / (b - a));
const eoc = x => 1 - Math.pow(1 - clamp(x), 3);
const eob = x => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

const C = { bg: '#070B11', bg2: '#0D141E', line: '#1B2533', dim: '#5B6B80', txt: '#E8EEF6', acc: '#2EE59D', yel: '#FFD23F', red: '#FF5A5A', grn: '#3DDC84', blue: '#5AA8FF' };
const SANS = 'Inter', MONO = 'Plex';
const S = SEC;   // { hook, market, why, money, watch, levels, cta }
const ORDER = ['hook', 'market', 'why', 'money', 'watch', 'levels', 'cta'].filter(k => S[k] !== null && S[k] !== undefined);
const LABEL = { market: 'WINS', why: 'FALLS', money: 'MISTAKES', watch: 'LESSONS' };
const FIRST = 'market';
const stageAt = t => { let s = 'hook'; for (const k of ORDER) if (t >= S[k]) s = k; return s; };
const endOf = k => { const i = ORDER.indexOf(k); return i < ORDER.length - 1 ? S[ORDER[i + 1]] : DUR; };

const NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const WORDS = (() => { const out = []; const w = RAW.map(([w, a, b]) => ({ w, a, b })); const bare = s => s.toLowerCase().replace(/[^a-z]/g, ''), tail = s => (s.match(/[.,:?]+$/) || [''])[0];
  for (let i = 0; i < w.length; i++) {
    const b0 = bare(w[i].w);
    if (NUM[b0] !== undefined && w[i + 1] && bare(w[i + 1].w) === 'point' && w[i + 2] && NUM[bare(w[i + 2].w)] !== undefined) {
      let txt = NUM[b0] + '.' + NUM[bare(w[i + 2].w)], end = w[i + 2].b, tl = tail(w[i + 2].w), j = i + 2;
      if (w[j + 1] && bare(w[j + 1].w) === 'percent') { j++; txt += '%'; end = w[j].b; tl = tail(w[j].w); }
      out.push({ w: txt + tl, a: w[i].a, b: end }); i = j; continue; }
    if (NUM[b0] !== undefined && b0 !== 'seven' && w[i + 1] && bare(w[i + 1].w) === 'percent') { out.push({ w: NUM[b0] + '%' + tail(w[i + 1].w), a: w[i].a, b: w[i + 1].b }); i++; continue; }
    if (b0 === 'seven' && w[i + 1] && bare(w[i + 1].w) === 'thirty') { out.push({ w: '7:30', a: w[i].a, b: w[i + 1].b }); i++; continue; }
    if (b0 === 'november' && w[i + 1] && bare(w[i + 1].w) === 'seventeenth') { out.push({ w: 'Nov 17.', a: w[i].a, b: w[i + 1].b }); i++; continue; }
    if (b0 === 'long' && w[i + 1] && bare(w[i + 1].w) === 'term') { out.push({ w: 'long-term', a: w[i].a, b: w[i + 1].b }); i++; continue; }
    out.push(w[i]); }
  return out; })();
const CHUNKS = (() => { const out = []; let cur = [];
  WORDS.forEach((x, i) => { cur.push(x); const len = cur.map(c => c.w).join(' ').length, nx = WORDS[i + 1];
    if (/[.?,:]$/.test(x.w) && len > 5 || cur.length >= 3 || len > 15 || !nx || (nx && nx.a - x.b > .3)) { out.push(cur); cur = []; } });
  return out.map(ws => ({ ws, a: ws[0].a, b: ws[ws.length - 1].b })); })();
export const CUES = CHUNKS.map(c => ({ t0: c.a, t1: c.b + .15, text: c.ws.map(w => w.w).join(' ') }));
const LOG = [
  [S.market + .3, '$ agent story --nvidia'], [S.market + 1.0, '> founded 1993  ok'], [S.market + 4.2, '> CUDA 2006  ok'], [S.market + 13.4, '> peak mcap $5.03T  ok'],
  [S.why + .3, '> scan drawdowns'], [S.why + 6.6, '> Q4 2018: -54%'], [S.why + 9.8, '> 2025-01-27: -$589B'],
  [S.money + .3, '> audit decisions'], [S.money + 3.0, '> SEC settlement 2022: $5.5M'], [S.money + 13.8, '> 8-K: CEO resigned  ok'],
  [S.watch + .3, '> extract lessons  ok'],
].map(([t, s]) => ({ t, s }));
export function events() {
  const ev = []; ORDER.slice(1).forEach(k => ev.push({ t: S[k], type: 'whoosh' })); LOG.forEach(l => ev.push({ t: l.t, type: 'tick' }));
  [[0.2, 'hit'], [S.money + 13.8, 'stamp'], [S.cta + .3, 'hit']].forEach(([t, type]) => ev.push({ t, type }));
  return ev;
}
// ---- helpers ----
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function text(g, s, x, y, o = {}) { g.font = `${o.w || 600} ${o.size || 40}px ${o.f || SANS}`; g.fillStyle = o.c || C.txt; g.textAlign = o.al || 'left'; g.textBaseline = 'alphabetic'; g.letterSpacing = (o.ls || 0) + 'px'; g.fillText(s, x, y); return g.measureText(s).width; }
function typed(s, t, t0, cps = 38) { const n = Math.floor((t - t0) * cps); return n <= 0 ? '' : s.slice(0, n); }
function check(g, x, y, s, c, k = 1) { g.save(); g.strokeStyle = c; g.lineWidth = s * .16; g.lineCap = 'round'; g.lineJoin = 'round';
  const p = [[x - s * .35, y], [x - s * .08, y + s * .28], [x + s * .4, y - s * .3]], L1 = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]), L2 = Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]), d = (L1 + L2) * clamp(k);
  g.beginPath(); g.moveTo(...p[0]); if (d < L1) g.lineTo(lerp(p[0][0], p[1][0], d / L1), lerp(p[0][1], p[1][1], d / L1)); else { g.lineTo(...p[1]); g.lineTo(lerp(p[1][0], p[2][0], (d - L1) / L2), lerp(p[1][1], p[2][1], (d - L1) / L2)); } g.stroke(); g.restore(); }
function glow(g, c, b) { g.shadowColor = c; g.shadowBlur = b; }
function stamp(g, t, t0, s, x, y, col, size = 48, rot = -.12) { const k = clamp((t - t0) / .16); if (k <= 0) return; const sc = 1 + 1.2 * (1 - k);
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(sc, sc); g.globalAlpha *= k; g.font = `900 ${size}px ${SANS}`; g.letterSpacing = '2px'; const w = g.measureText(s).width;
  g.strokeStyle = col; g.lineWidth = 6; rr(g, -w / 2 - 26, -size * .95, w + 52, size * 1.4, 10); g.stroke(); text(g, s, 0, size * .3, { size, w: 900, c: col, al: 'center', ls: 2 }); g.restore(); }

function background(g, t) {
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  const gr = g.createRadialGradient(W / 2, 820, 50, W / 2, 820, 900); gr.addColorStop(0, 'rgba(46,229,157,0.10)'); gr.addColorStop(1, 'rgba(46,229,157,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(120,150,180,0.06)'; g.lineWidth = 1; const off = (t * 18) % 60;
  for (let x = 0; x <= W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = -60 + off; y <= H; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
}
function pipeline(g, t) {
  const keys = Object.keys(LABEL), x0 = 130, x1 = 950, y = 205, st = stageAt(t);
  text(g, 'SIXXAB MONEY  ·  THE NVIDIA STORY', W / 2, 128, { size: 28, w: 700, c: C.dim, al: 'center', f: MONO, ls: 3 });
  const inK = ease(t, S[FIRST] - .3, S[FIRST] + .3); g.save(); g.globalAlpha = inK;
  g.strokeStyle = C.line; g.lineWidth = 6; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  const prog = keys.reduce((a, k) => a + (t >= S[k] ? Math.min(1, (t - S[k]) / (endOf(k) - S[k])) : 0), 0);
  const px = lerp(x0, x1, clamp((prog - .5) / (keys.length - 1)));
  g.strokeStyle = C.acc; glow(g, C.acc, 16); g.beginPath(); g.moveTo(x0, y); g.lineTo(Math.max(x0, px), y); g.stroke(); g.shadowBlur = 0;
  keys.forEach((k, i) => { const x = lerp(x0, x1, i / (keys.length - 1)), done = t >= endOf(k), act = st === k, r = 22 * (act ? 1 + .12 * Math.sin((t - S[k]) * 8) : 1);
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = done ? C.acc : act ? C.bg2 : C.bg; g.fill(); g.lineWidth = 4; g.strokeStyle = done || act ? C.acc : C.line; if (act) glow(g, C.acc, 22); g.stroke(); g.shadowBlur = 0;
    if (done) check(g, x, y, 22, C.bg, ease(t, endOf(k), endOf(k) + .25));
    text(g, LABEL[k], x, y + 62, { size: 22, w: 700, f: MONO, c: act ? C.acc : done ? C.txt : C.dim, al: 'center' }); });
  g.restore();
}
const CLOCK = { market: ['$5T', 'THE RISE · 1993 – 2025'], why: ['−$589B', 'THE FALLS'], money: ['3', 'THE MISTAKES'], watch: ['3', 'THE LESSONS'], cta: ['NVDA', 'STORY · SIXXAB MONEY'] };
function clock(g, t) { const st = stageAt(t); if (st === 'hook') return; const [a, b] = CLOCK[st], flip = 1 - ease(t, S[st], S[st] + .22);
  g.save(); g.translate(W / 2, 395); g.scale(1, 1 - flip * .7); g.globalAlpha = 1 - flip * .8; glow(g, 'rgba(46,229,157,.45)', 28);
  text(g, a, 0, 0, { size: 124, w: 500, f: MONO, al: 'center' }); g.shadowBlur = 0; text(g, b, 0, 58, { size: 26, w: 600, f: MONO, al: 'center', c: st === 'levels' ? C.yel : C.acc, ls: 3 }); g.restore(); }

// ---- hook (0 .. S.market): green key (clone underneath) + TITLE card ----
const KEY = '#00FF00';
function titleCard(g, t) {
  const k = 1, out = ease(t, S[FIRST] - .25, S[FIRST]);   // title fully visible from frame 0 (also the reel cover)
  g.save(); g.globalAlpha = k * (1 - out); if (!HOST) { g.translate(W / 2, 760); g.translate(-W / 2, -300); }
  rr(g, 70, 150, W - 140, 300, 34); g.fillStyle = 'rgba(7,11,17,0.92)'; g.fill(); g.strokeStyle = C.acc; g.lineWidth = 4; g.stroke();
  text(g, 'SIXXAB MONEY · DAILY BRIEF', W / 2, 222, { size: 30, w: 700, f: MONO, al: 'center', c: C.acc, ls: 4 });
  text(g, TITLE.date, W / 2, 268, { size: 26, w: 500, f: MONO, al: 'center', c: '#B8C4D2', ls: 2 });
  text(g, TITLE.l1, W / 2, 342, { size: 58, w: 900, al: 'center', c: C.txt });
  text(g, TITLE.l2, W / 2, 412, { size: 50, w: 800, al: 'center', c: C.yel });
  g.restore();
}
// ---- phone ----
const PX = 250, PY = 520, PW = 580, PH = 800;
function phoneFrame(g, t, inner) {
  const inK = eob((t - S[FIRST]) / .55), outK = ease(t, S.cta, S.cta + .4); if (inK <= 0 || outK >= 1) return;
  g.save(); const sc = lerp(.6, 1, clamp(inK)) * (1 - outK * .15); g.translate(W / 2, PY + PH / 2); g.scale(sc, sc); g.rotate((1 - clamp(inK)) * -.12); g.translate(-W / 2, -(PY + PH / 2)); g.globalAlpha = clamp(inK * 2) * (1 - outK);
  glow(g, 'rgba(0,0,0,.6)', 60); rr(g, PX - 16, PY - 16, PW + 32, PH + 32, 70); g.fillStyle = '#1A222D'; g.fill(); g.shadowBlur = 0; g.strokeStyle = '#2C3846'; g.lineWidth = 3; g.stroke();
  rr(g, PX, PY, PW, PH, 56); g.fillStyle = '#0B1119'; g.fill(); g.save(); g.clip(); inner(); g.restore();
  rr(g, PX + PW / 2 - 70, PY + 18, 140, 34, 17); g.fillStyle = '#000'; g.fill(); g.restore();
}
function inStage(t, k, fn) { const a = S[k], b = endOf(k); if (t < a - .01 || t > b + .3) return; const ki = eoc((t - a) / .35), ko = ease(t, b - .02, b + .28);
  return g => { g.save(); g.globalAlpha *= ki * (1 - ko); g.translate((1 - ki) * 60 - ko * 60, 0); fn(g); g.restore(); }; }
function header(g, s, sub) { text(g, s, PX + 40, PY + 112, { size: 38, w: 700 }); if (sub) text(g, sub, PX + 40, PY + 150, { size: 22, w: 500, f: MONO, c: C.dim }); g.fillStyle = C.line; g.fillRect(PX + 40, PY + 172, PW - 80, 2); }
function rowCard(g, t, t0, y, n, sub, val, col) { const k = eoc((t - t0) / .35); if (k <= 0) return; g.save(); g.globalAlpha *= k; g.translate((1 - k) * 40, 0);
  rr(g, PX + 30, y - 50, PW - 60, 120, 20); g.fillStyle = '#121B26'; g.fill(); text(g, n, PX + 56, y, { size: 32, w: 700 }); text(g, sub, PX + 56, y + 44, { size: 24, w: 500, f: MONO, c: C.dim });
  text(g, val, PX + PW - 56, y + 22, { size: 44, w: 800, f: MONO, c: col, al: 'right' }); g.restore(); }
function stMarket(g, t) { header(g, 'The rise', '1993 → 2025');
  rowCard(g, t, S.market + .5, PY + 250, '1993', 'founded', 'START', C.acc); rowCard(g, t, S.market + 4.0, PY + 400, '2006', 'CUDA launches', 'BET', C.acc);
  rowCard(g, t, S.market + 8.3, PY + 550, '2012', 'AI on its GPUs', 'AI', C.acc); rowCard(g, t, S.market + 13.2, PY + 700, 'Oct 2025', 'first ever', '$5T', C.yel); }
function stWhy(g, t) { header(g, 'The falls', 'biggest drawdowns');
  rowCard(g, t, S.why + 1.6, PY + 250, '1996', 'first chip flops', '~30 DAYS', C.red); rowCard(g, t, S.why + 6.4, PY + 400, '2018', 'crypto bust', '−50%', C.red);
  rowCard(g, t, S.why + 9.6, PY + 550, 'Jan 2025', 'DeepSeek day', '−$589B', C.red); }
function cards(g, t, items, col, ic) { items.forEach(([t0, n, s], i) => { const k = eob((t - t0) / .4); if (k <= 0) return; const y = PY + 195 + i * 168;
    g.save(); g.globalAlpha *= clamp(k * 2); rr(g, PX + 30, y, PW - 60, 140, 22); g.fillStyle = '#121B26'; g.fill(); g.strokeStyle = col; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(PX + 92, y + 70, 34, 0, Math.PI * 2); g.fillStyle = col; g.fill(); text(g, ic === 'n' ? String(i + 1) : ic, PX + 92, y + 87, { size: 44, w: 900, c: C.bg, al: 'center' });
    text(g, n, PX + 140, y + 62, { size: 30, w: 700 }); text(g, s, PX + 140, y + 102, { size: 22, w: 500, c: '#B8C4D2' }); g.restore(); }); }
function stMoney(g, t) { header(g, 'The mistakes', 'what went wrong');
  cards(g, t, [[S.money + .6, 'Wrong standard', 'first chip bet against the market'], [S.money + 2.8, 'Crypto overbuild', 'inventory glut + $5.5M SEC deal'], [S.money + 7.6, 'Personal judgment', 'admitted affair, security probe']], C.red, 'n');
  if (t > S.money + 13.8) { const k = eob((t - S.money - 13.8) / .3); g.save(); g.translate(PX + PW / 2, PY + 738); g.rotate(-.06); g.scale(1 + .6 * (1 - clamp(k)), 1 + .6 * (1 - clamp(k))); g.globalAlpha *= clamp(k);
    rr(g, -170, -40, 340, 72, 12); g.strokeStyle = C.red; g.lineWidth = 5; g.stroke(); text(g, 'CEO RESIGNED', 0, 14, { size: 36, w: 900, f: MONO, c: C.red, al: 'center' }); g.restore(); } }
function stWatch(g, t) { header(g, 'The lessons', 'take these with you');
  cards(g, t, [[S.watch + .4, 'Admit it fast', 'cut a losing bet early'], [S.watch + 2.2, 'Bet early', 'build for where the world goes'], [S.watch + 4.1, 'Judgment counts', 'off the job is part of the job']], C.acc, '✓'); }
function stLevels() {}
function cta(g, t) {
  if (t < S.cta) return; const k = eob((t - S.cta - .1) / .5), k2 = eob((t - S.cta - 0.4) / .45), k3 = eoc((t - S.cta - 1.2) / .5), k4 = eoc((t - S.cta - 1.6) / .4);
  g.save(); g.globalAlpha = clamp(k * 2); text(g, 'Follow', W / 2, 700, { size: 84, w: 800, al: 'center' }); g.restore();
  if (k2 > 0) { g.save(); g.translate(W / 2, 840); const s = clamp(k2, 0, 1.1); g.scale(s, s); g.globalAlpha = clamp(k2 * 2);
    rr(g, -380, -80, 760, 160, 36); g.fillStyle = C.acc; glow(g, C.acc, 60); g.fill(); g.shadowBlur = 0; text(g, '@sixxab_money', 0, 30, { size: 82, w: 900, c: C.bg, al: 'center' }); g.restore(); }
  if (k3 > 0) { g.save(); g.globalAlpha = k3; text(g, 'money stories that make you smarter', W / 2, 1010, { size: 46, w: 700, al: 'center' }); g.restore(); }
  if (k4 > 0) { g.save(); g.globalAlpha = k4; text(g, 'NOT FINANCIAL ADVICE · Sources: Nvidia 8-K (Nov 12, 2026), SEC (2022), Reuters, NYT, CNBC, AP', W / 2, 1110, { size: 19, w: 500, f: MONO, al: 'center', c: C.dim }); g.restore(); }
}
function terminal(g, t) { if (t < S[FIRST] || t > S.cta + .4) return; const a = 1 - ease(t, S.cta, S.cta + .4), shown = LOG.filter(l => t >= l.t).slice(-2);
  g.save(); g.globalAlpha = a; rr(g, 90, 1352, W - 180, 104, 18); g.fillStyle = 'rgba(13,20,30,.92)'; g.fill(); g.strokeStyle = C.line; g.lineWidth = 2; g.stroke();
  shown.forEach((l, i) => { const last = i === shown.length - 1, s = last ? typed(l.s, t, l.t, 60) : l.s, ok = / ok$/.test(s);
    text(g, ok ? s.slice(0, -3) : s, 116, 1392 + i * 42, { size: 26, w: 500, f: MONO, c: last ? C.txt : C.dim }); if (ok) text(g, ' ok', 116 + g.measureText(s.slice(0, -3)).width, 1392 + i * 42, { size: 26, w: 500, f: MONO, c: C.grn }); });
  g.restore(); }
function captions(g, t) {
  const c = CHUNKS.find(c => t >= c.a - .05 && t <= c.b + .2); if (!c) return; const y = 1560, size = 64; g.font = `900 ${size}px ${SANS}`; g.letterSpacing = '0px';
  const ws = c.ws.map(w => w.w.toUpperCase()), sp = g.measureText(' ').width, widths = ws.map(w => g.measureText(w).width), tot = widths.reduce((a, b) => a + b, 0) + sp * (ws.length - 1);
  const s = lerp(.85, 1, clamp(eob((t - c.a + .05) / .18))); g.save(); g.translate(W / 2, y); g.scale(s, s);
  rr(g, -tot / 2 - 34, -size * .95, tot + 68, size * 1.45, 26); g.fillStyle = '#0A0A0A'; g.fill();
  let x = -tot / 2; c.ws.forEach((w, i) => { const act = t >= w.a - .03 && t <= (c.ws[i + 1] ? c.ws[i + 1].a : c.b + .2); text(g, ws[i], x, 0, { size, w: 900, c: act ? C.yel : '#FFFFFF' }); x += widths[i] + sp; });
  g.restore(); }

export function render(g, t) {
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.shadowBlur = 0;
  if (t < S[FIRST]) { if (HOST) { g.fillStyle = KEY; g.fillRect(0, 0, W, H); } else { background(g, t); titleCard(g, t); } captions(g, t); return; } // HOST: title comes from out/title.png (transparent overlay over the clone)
  background(g, t); pipeline(g, t); clock(g, t);
  phoneFrame(g, t, () => { for (const [k, fn] of [['market', stMarket], ['why', stWhy], ['money', stMoney], ['watch', stWatch], ['levels', stLevels]].filter(([k]) => ORDER.includes(k))) { const f = inStage(t, k, gg => fn(gg, t)); if (f) f(g); } });
  terminal(g, t); cta(g, t); captions(g, t);
  const wk = 1 - ease(t, S[FIRST], S[FIRST] + .25); if (HOST && wk > 0) { g.fillStyle = KEY; g.fillRect(0, 0, W, H * wk); }
}
