// SIXXAB AI reel (9:16, ~38.6 s): "My last reel posted itself" — a fully automated Instagram reel pipeline, shown as a live agent run.
// 0–3.45 s is chroma green (#00FF00): the Host clip is keyed in underneath at composite time. Captions sit on opaque pills so the key stays clean.
export const W = 1080, H = 1920;
export const DUR = 38.6;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const ss = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const ease = (t, a, b) => ss((t - a) / (b - a));
const eoc = x => 1 - Math.pow(1 - clamp(x), 3);
const eob = x => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

const C = { bg: '#070B11', bg2: '#0D141E', line: '#1B2533', dim: '#5B6B80', txt: '#E8EEF6', cyan: '#3EE6C8', yel: '#FFD23F', red: '#FF5A5A', grn: '#3DDC84', blue: '#5AA8FF', key: '#00FF00' };
const SANS = 'Inter', MONO = 'Plex';
// stage starts (s) — aligned to the voiceover's sentence timings
const S = { hook: 0, find: 3.45, write: 9.05, build: 13.0, approve: 17.78, post: 22.6, dm: 26.9, learn: 31.05, cta: 34.2 };
const ORDER = ['find', 'write', 'build', 'approve', 'post', 'dm', 'learn', 'cta'];
const LABEL = { find: 'FIND', write: 'WRITE', build: 'BUILD', approve: 'APPROVE', post: 'POST', dm: 'DM', learn: 'LEARN' };
const stageAt = t => { let s = 'hook'; for (const k of ORDER) if (t >= S[k]) s = k; return s; };
const endOf = k => { const i = ORDER.indexOf(k); return i < ORDER.length - 1 ? S[ORDER[i + 1]] : DUR; };

// ---- voiceover words (Brian, from the TTS timing) ----
const WORDS = [["My",0,.174],["last",.244,.464],["reel",.522,.662],["posted",.72,1.045],["itself.",1.091,1.602],["I",1.8,1.869],["never",2.032,2.276],["opened",2.334,2.577],["Instagram.",2.635,3.274],["Seven",3.692,4.075],["a.m.",4.145,4.54],["An",4.772,5.05],["AI",5.097,5.399],["agent",5.445,5.724],["scans",5.77,6.118],["the",6.153,6.223],["market",6.269,6.594],["and",6.641,6.769],["picks",6.838,7.07],["one",7.14,7.372],["story",7.419,7.721],["with",7.767,7.895],["a",7.93,7.953],["real",8.022,8.197],["number",8.255,8.475],["in",8.545,8.603],["it.",8.649,8.835],["It",9.253,9.416],["writes",9.451,9.706],["the",9.741,9.81],["hook,",9.869,10.24],["the",10.356,10.449],["script,",10.519,11.018],["the",11.134,11.227],["caption",11.32,11.784],["and",11.854,11.924],["the",11.958,12.028],["hashtags.",12.063,12.817],["Then",13.177,13.363],["it",13.41,13.456],["builds",13.491,13.7],["the",13.723,13.793],["video.",13.828,14.327],["Charts,",14.594,15.163],["music,",15.279,15.824],["captions.",15.941,16.66],["No",16.927,17.113],["editor.",17.194,17.659],["It",17.891,18.042],["sends",18.1,18.355],["me",18.413,18.506],["one",18.576,18.739],["notification.",18.773,19.609],["I",19.923,19.992],["tap",20.109,20.341],["yes.",20.422,20.863],["That's",20.91,21.142],["the",21.177,21.246],["only",21.328,21.571],["step",21.618,21.827],["I",21.896,21.92],["keep.",22.001,22.372],["It",22.86,23.046],["publishes",23.104,23.568],["through",23.592,23.766],["the",23.801,23.87],["Instagram",23.905,24.404],["API",24.462,24.973],["and",25.112,25.356],["logs",25.472,25.751],["it",25.786,25.855],["on",25.89,25.96],["my",26.03,26.099],["calendar.",26.18,26.703],["Someone",27.121,27.573],["comments",27.632,28.038],["a",28.061,28.096],["keyword?",28.154,28.665],["The",28.827,28.967],["agent",29.013,29.257],["replies",29.292,29.663],["and",29.71,29.779],["sends",29.837,30.07],["them",30.104,30.232],["the",30.279,30.348],["guide.",30.395,30.813],["Every",31.3,31.556],["Sunday",31.614,31.916],["it",31.974,32.02],["reads",32.067,32.252],["the",32.287,32.357],["numbers",32.392,32.74],["and",32.786,32.926],["makes",32.984,33.169],["more",33.216,33.355],["of",33.378,33.425],["what",33.46,33.576],["worked.",33.622,34.017],["Comment",34.377,34.76],["AGENT",34.806,35.074],["and",35.12,35.201],["I'll",35.248,35.387],["send",35.422,35.561],["you",35.596,35.666],["the",35.7,35.77],["full",35.793,35.944],["workflow",35.991,36.327],["map.",36.385,36.919]].map(([w, a, b]) => ({ w, a, b }));
// chunk into caption lines: break after sentence ends, or at ~3 words / 16 chars
const CHUNKS = (() => { const out = []; let cur = [];
  WORDS.forEach((x, i) => { cur.push(x); const len = cur.map(c => c.w).join(' ').length, nx = WORDS[i + 1];
    if (/[.?,]$/.test(x.w) && len > 6 || cur.length >= 3 || len > 15 || !nx || (nx && nx.a - x.b > .3)) { out.push(cur); cur = []; } });
  return out.map(ws => ({ ws, a: ws[0].a, b: ws[ws.length - 1].b })); })();
export const CUES = CHUNKS.map(c => ({ t0: c.a, t1: c.b + .15, text: c.ws.map(w => w.w).join(' ') }));

// ---- sound events for the score ----
export function events() {
  const ev = [];
  ORDER.forEach(k => ev.push({ t: S[k], type: 'whoosh' }));
  LOG.forEach(l => ev.push({ t: l.t, type: 'tick' }));
  [[20.12, 'tap'], [20.25, 'ok'], [23.3, 'ding'], [25.5, 'pop'], [27.6, 'pop'], [29.3, 'pop'], [30.0, 'ding'], [33.4, 'ok'], [34.8, 'hit'], [16.93, 'stamp'], [7.25, 'stamp']].forEach(([t, type]) => ev.push({ t, type }));
  return ev;
}

// ---- terminal log (time, stage, text) ----
const LOG = [
  [3.6, '$ agent run --daily  07:00'], [4.8, '> fetch screener: 52-week lows'], [6.0, '> 5 AI stocks at new 52w lows'], [7.25, '> story: QQQ on the -15% line  ok'],
  [9.3, '> write hook'], [10.5, '> write script  6 beats'], [11.3, '> caption + first comment'], [12.1, '> hashtags  15'],
  [13.25, '> render 1080x1920 @24fps'], [14.6, '> chart  ok'], [15.3, '> score  -14 LUFS  ok'], [16.0, '> captions  ok'],
  [17.9, '> notify owner: approve?'], [20.2, '> approved by human  ok'],
  [22.9, '> POST /media  (container)'], [23.4, '> POST /media_publish  ok'], [25.5, '> calendar.create  12:31'],
  [27.2, '> watch comments: "PLAN"'], [29.3, '> reply public  ok'], [30.0, '> DM levels-sheet.pdf  ok'],
  [31.3, '> read insights  7d'], [32.5, '> rank hooks by watch time'], [33.4, '> next week: more like hook C'],
].map(([t, s]) => ({ t, s }));

// ---- drawing helpers ----
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function text(g, s, x, y, o = {}) {
  g.font = `${o.w || 600} ${o.size || 40}px ${o.f || SANS}`; g.fillStyle = o.c || C.txt; g.textAlign = o.al || 'left'; g.textBaseline = o.bl || 'alphabetic';
  if (o.ls) g.letterSpacing = o.ls + 'px'; else g.letterSpacing = '0px';
  g.fillText(s, x, y); return g.measureText(s).width;
}
function typed(s, t, t0, cps = 38) { const n = Math.floor((t - t0) * cps); return n <= 0 ? '' : s.slice(0, n); }
function check(g, x, y, s, c, k = 1) { g.save(); g.strokeStyle = c; g.lineWidth = s * .16; g.lineCap = 'round'; g.lineJoin = 'round';
  const pts = [[x - s * .35, y], [x - s * .08, y + s * .28], [x + s * .4, y - s * .3]]; const L1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), L2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]), d = (L1 + L2) * clamp(k);
  g.beginPath(); g.moveTo(...pts[0]); if (d < L1) g.lineTo(lerp(pts[0][0], pts[1][0], d / L1), lerp(pts[0][1], pts[1][1], d / L1)); else { g.lineTo(...pts[1]); g.lineTo(lerp(pts[1][0], pts[2][0], (d - L1) / L2), lerp(pts[1][1], pts[2][1], (d - L1) / L2)); }
  g.stroke(); g.restore(); }
function glow(g, c, b) { g.shadowColor = c; g.shadowBlur = b; }

// ---- background ----
function background(g, t) {
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  const gr = g.createRadialGradient(W / 2, 820, 50, W / 2, 820, 900); gr.addColorStop(0, 'rgba(62,230,200,0.10)'); gr.addColorStop(1, 'rgba(62,230,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(120,150,180,0.06)'; g.lineWidth = 1; const off = (t * 18) % 60;
  for (let x = 0; x <= W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = -60 + off; y <= H; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
}

// ---- pipeline strip (top) ----
function pipeline(g, t) {
  const keys = Object.keys(LABEL), x0 = 90, x1 = 990, y = 205, st = stageAt(t), si = ORDER.indexOf(st);
  const inK = ease(t, S.find, S.find + .5); g.save(); g.globalAlpha = inK; g.translate(0, (1 - inK) * -40);
  text(g, 'SIXXAB AI  ·  AGENT RUN', W / 2, 128, { size: 28, w: 700, c: C.dim, al: 'center', f: MONO, ls: 4 });
  g.strokeStyle = C.line; g.lineWidth = 6; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  // progress fill
  const prog = keys.reduce((a, k, i) => a + (t >= S[k] ? Math.min(1, (t - S[k]) / (endOf(k) - S[k])) : 0), 0) / keys.length * (keys.length) ;
  const px = lerp(x0, x1, clamp((prog - .5) / (keys.length - 1)));
  g.strokeStyle = C.cyan; glow(g, C.cyan, 16); g.beginPath(); g.moveTo(x0, y); g.lineTo(Math.max(x0, px), y); g.stroke(); g.shadowBlur = 0;
  keys.forEach((k, i) => {
    const x = lerp(x0, x1, i / (keys.length - 1)), done = t >= endOf(k) || st === 'cta', act = st === k;
    const pulse = act ? 1 + .12 * Math.sin((t - S[k]) * 8) : 1, r = 22 * pulse;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = done ? C.cyan : act ? C.bg2 : C.bg; g.fill();
    g.lineWidth = 4; g.strokeStyle = done || act ? C.cyan : C.line; if (act) glow(g, C.cyan, 22); g.stroke(); g.shadowBlur = 0;
    if (done) check(g, x, y, 22, C.bg, ease(t, endOf(k), endOf(k) + .25));
    text(g, LABEL[k], x, y + 62, { size: 22, w: 700, f: MONO, c: act ? C.cyan : done ? C.txt : C.dim, al: 'center' });
  });
  g.restore();
}

// ---- clock ----
const CLOCK = { find: ['07:00', '07:03'], write: ['07:04', '07:08'], build: ['07:09', '07:19'], approve: ['07:20', '07:20'], post: ['12:31', '12:31'], dm: ['12:32', '21:47'], learn: ['SUN', 'SUN'], cta: ['24/7', '24/7'] };
const SUB = { find: 'TUE · SCAN', write: 'TUE · DRAFT', build: 'TUE · RENDER', approve: 'TUE · WAITING ON YOU', post: 'TUE · PUBLISH', dm: 'ALL DAY · INBOX', learn: '18:00 · WEEKLY READ', cta: 'WHILE YOU SLEEP' };
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const fmt = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0');
function clock(g, t) {
  const st = stageAt(t); if (st === 'hook') return; const [a, b] = CLOCK[st], k = clamp((t - S[st]) / (endOf(st) - S[st]));
  const val = a.includes(':') && b.includes(':') ? fmt(lerp(toMin(a), toMin(b), k)) : a;
  const flip = 1 - ease(t, S[st], S[st] + .22);
  g.save(); g.translate(W / 2, 395); g.scale(1, 1 - flip * .7); g.globalAlpha = 1 - flip * .8;
  glow(g, 'rgba(62,230,200,.5)', 28); text(g, val, 0, 0, { size: 132, w: 500, f: MONO, al: 'center', c: C.txt }); g.shadowBlur = 0;
  text(g, SUB[st], 0, 58, { size: 26, w: 600, f: MONO, al: 'center', c: st === 'approve' ? C.yel : C.cyan, ls: 3 });
  g.restore();
}

// ---- phone ----
const PX = 250, PY = 520, PW = 580, PH = 800;
function phoneFrame(g, t, inner) {
  const inK = eob((t - S.find) / .55), outK = ease(t, S.cta, S.cta + .4);
  if (inK <= 0 || outK >= 1) return;
  g.save(); const sc = lerp(.6, 1, clamp(inK)) * (1 - outK * .15); g.translate(W / 2, PY + PH / 2); g.scale(sc, sc); g.rotate((1 - clamp(inK)) * -.12); g.translate(-W / 2, -(PY + PH / 2)); g.globalAlpha = clamp(inK * 2) * (1 - outK);
  glow(g, 'rgba(0,0,0,.6)', 60); rr(g, PX - 16, PY - 16, PW + 32, PH + 32, 70); g.fillStyle = '#1A222D'; g.fill(); g.shadowBlur = 0;
  g.strokeStyle = '#2C3846'; g.lineWidth = 3; g.stroke();
  rr(g, PX, PY, PW, PH, 56); g.fillStyle = '#0B1119'; g.fill(); g.save(); g.clip(); inner(); g.restore();
  rr(g, PX + PW / 2 - 70, PY + 18, 140, 34, 17); g.fillStyle = '#000'; g.fill();
  g.restore();
}
// stage cross-fade inside phone
function inStage(t, k, fn) { const a = S[k], b = endOf(k); if (t < a - .01 || t > b + .3) return; const ki = eoc((t - a) / .35), ko = ease(t, b - .02, b + .28);
  return (g) => { g.save(); g.globalAlpha *= ki * (1 - ko); g.translate((1 - ki) * 60 - ko * 60, 0); fn(g); g.restore(); }; }
function header(g, s, sub) { text(g, s, PX + 40, PY + 112, { size: 38, w: 800 === 0 ? 700 : 700 }); if (sub) text(g, sub, PX + 40, PY + 150, { size: 22, w: 500, f: MONO, c: C.dim }); g.fillStyle = C.line; g.fillRect(PX + 40, PY + 172, PW - 80, 2); }

function stFind(g, t) {
  header(g, 'Market scan', 'screener · 252-day range');
  const rows = [['ORCL', 'Oracle', '-56%'], ['AVGO', 'Broadcom', '-41%'], ['CRWV', 'CoreWeave', '-70%'], ['APH', 'Amphenol', '-60%'], ['VST', 'Vistra', '-39%']];
  rows.forEach(([tk, nm, p], i) => { const t0 = S.find + .9 + i * .28, k = eoc((t - t0) / .3); if (k <= 0) return; const y = PY + 230 + i * 74;
    g.save(); g.globalAlpha *= k; g.translate((1 - k) * 40, 0);
    text(g, tk, PX + 40, y, { size: 30, w: 700, f: MONO }); text(g, nm, PX + 170, y, { size: 26, w: 500, c: C.dim }); text(g, p, PX + PW - 40, y, { size: 30, w: 700, f: MONO, c: C.red, al: 'right' });
    rr(g, PX + 40, y + 16, PW - 80, 6, 3); g.fillStyle = C.line; g.fill(); rr(g, PX + 40, y + 16, (PW - 80) * .08, 6, 3); g.fillStyle = C.red; g.fill(); g.restore(); });
  text(g, 'from 52-week high · all at new lows', PX + 40, PY + 620, { size: 20, w: 500, f: MONO, c: C.dim });
  // pick
  const pk = eob((t - 7.0) / .45); if (pk > 0) { const y = PY + 660; g.save(); g.globalAlpha *= clamp(pk * 2);
    rr(g, PX + 30, y, PW - 60, 104, 20); g.fillStyle = 'rgba(62,230,200,.12)'; g.fill(); g.strokeStyle = C.cyan; g.lineWidth = 3; glow(g, C.cyan, 18); g.stroke(); g.shadowBlur = 0;
    text(g, 'STORY PICKED', PX + 56, y + 40, { size: 20, w: 700, f: MONO, c: C.cyan, ls: 2 }); text(g, 'QQQ closes on the -15% line', PX + 56, y + 80, { size: 30, w: 700 }); g.restore(); }
}
function stWrite(g, t) {
  header(g, 'Draft', 'reel_0110.md');
  const blocks = [[9.87, 'HOOK', 'QQQ just had its worst day since 2020.', C.yel], [10.52, 'SCRIPT', null, C.blue], [11.32, 'CAPTION', 'The 3 QQQ levels I\'m watching...', C.cyan], [12.06, 'HASHTAGS', '#stockmarket #nasdaq #QQQ #investing', C.grn]];
  let y = PY + 225;
  blocks.forEach(([t0, lab, body, col]) => { const k = eoc((t - t0) / .3); if (k <= 0) { y += lab === 'SCRIPT' ? 170 : 120; return; }
    g.save(); g.globalAlpha *= k; text(g, lab, PX + 40, y, { size: 20, w: 700, f: MONO, c: col, ls: 2 });
    if (body) { const s = typed(body, t, t0 + .1, 48); g.font = `600 27px ${SANS}`; const words = s.split(' '); let line = '', yy = y + 42; for (const w of words) { if (g.measureText(line + w).width > PW - 90) { text(g, line, PX + 40, yy, { size: 27 }); line = ''; yy += 36; } line += w + ' '; } text(g, line, PX + 40, yy, { size: 27 }); }
    else for (let i = 0; i < 3; i++) { const w = [.92, .78, .6][i] * clamp((t - t0 - i * .15) / .35); rr(g, PX + 40, y + 26 + i * 34, (PW - 80) * w, 16, 8); g.fillStyle = '#26323F'; g.fill(); }
    g.restore(); y += lab === 'SCRIPT' ? 170 : 120; });
  if (Math.floor(t * 2.5) % 2 === 0) { g.fillStyle = C.cyan; g.fillRect(PX + 40, PY + PH - 70, 14, 30); }
}
function stBuild(g, t) {
  header(g, 'Render', '1080x1920 · 24 fps');
  // mini 9:16 preview
  const mx = PX + 155, my = PY + 200, mw = 270, mh = 420; rr(g, mx, my, mw, mh, 18); g.fillStyle = '#F6F3EC'; g.fill();
  g.save(); rr(g, mx, my, mw, mh, 18); g.clip();
  const pts = [[0, .3], [.15, .35], [.3, .32], [.45, .45], [.6, .5], [.72, .72], [.82, .65], [1, .58]]; const k = clamp((t - 13.3) / 1.6);
  g.strokeStyle = '#222'; g.lineWidth = 5; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([u, v], i) => { const uu = Math.min(u, k); const p = pts.find(q => q[0] >= uu) || pts[pts.length - 1]; if (u > k && i > 0) { const pr = pts[i - 1]; const f = (k - pr[0]) / (u - pr[0]); if (f > 0) g.lineTo(mx + 20 + (mw - 40) * k, my + 60 + (mh * .5) * lerp(pr[1], v, f)); return; } const X = mx + 20 + (mw - 40) * u, Y = my + 60 + mh * .5 * v; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
  if (t > 15.0) { for (let i = 0; i < 18; i++) { const hgt = (8 + 30 * Math.abs(Math.sin(i * 1.7 + t * 7))) * ease(t, 15.0, 15.4); g.fillStyle = '#C0392B'; g.fillRect(mx + 30 + i * 12, my + mh - 120 - hgt / 2, 7, hgt); } }
  if (t > 15.9) { const kk = eoc((t - 15.9) / .3); rr(g, mx + 30, my + mh - 70, (mw - 60) * kk, 36, 10); g.fillStyle = '#111'; g.fill(); if (kk > .9) text(g, 'CAPTIONS', mx + mw / 2, my + mh - 45, { size: 18, w: 900, c: C.yel, al: 'center' }); }
  g.restore();
  const p = clamp((t - 13.2) / 3.6); const by = PY + 670; rr(g, PX + 40, by, PW - 80, 22, 11); g.fillStyle = C.line; g.fill(); rr(g, PX + 40, by, Math.max(22, (PW - 80) * p), 22, 11); g.fillStyle = p >= 1 ? C.grn : C.cyan; g.fill();
  text(g, p >= 1 ? 'done  reel.mp4' : 'rendering ' + Math.floor(p * 100) + '%', PX + 40, by + 66, { size: 24, w: 500, f: MONO, c: p >= 1 ? C.grn : C.dim });
  const sk = clamp((t - 16.93) / .16); if (sk > 0) { const s = 1 + 1.2 * (1 - sk); g.save(); g.translate(PX + PW / 2, PY + 410); g.rotate(-.14); g.scale(s, s); g.globalAlpha *= sk;
    g.strokeStyle = C.red; g.lineWidth = 6; rr(g, -190, -48, 380, 96, 10); g.stroke(); text(g, 'NO EDITOR', 0, 18, { size: 50, w: 900, c: C.red, al: 'center', ls: 3 }); g.restore(); }
}
function stApprove(g, t) {
  // lock screen
  const gr = g.createLinearGradient(0, PY, 0, PY + PH); gr.addColorStop(0, '#13202E'); gr.addColorStop(1, '#0A0F16'); g.fillStyle = gr; g.fillRect(PX, PY, PW, PH);
  text(g, 'Tuesday, November 10', PX + PW / 2, PY + 130, { size: 26, w: 500, c: C.dim, al: 'center' });
  text(g, '7:20', PX + PW / 2, PY + 250, { size: 120, w: 600, al: 'center' });
  const nk = eob((t - 17.95) / .5); if (nk > 0) { const y = PY + 330 + (1 - clamp(nk)) * -80; g.save(); g.globalAlpha *= clamp(nk * 2);
    rr(g, PX + 26, y, PW - 52, 330, 30); g.fillStyle = 'rgba(40,52,66,.95)'; g.fill();
    rr(g, PX + 52, y + 28, 48, 48, 12); g.fillStyle = C.cyan; g.fill(); text(g, 'S', PX + 76, y + 64, { size: 30, w: 900, c: C.bg, al: 'center' });
    text(g, 'SIXXAB AGENT', PX + 116, y + 62, { size: 22, w: 700, f: MONO, c: C.dim }); text(g, 'now', PX + PW - 52, y + 62, { size: 22, w: 500, c: C.dim, al: 'right' });
    text(g, 'Reel ready to post', PX + 52, y + 120, { size: 32, w: 700 }); text(g, '"AI stocks at 52-week lows" · 45s', PX + 52, y + 160, { size: 24, w: 500, c: '#B8C4D2' });
    const ok = t >= 20.15; const bx = PX + 52, bw = (PW - 52 * 2 - 20) / 2, byy = y + 210;
    rr(g, bx, byy, bw, 84, 20); g.fillStyle = '#334255'; g.fill(); text(g, 'Edit', bx + bw / 2, byy + 54, { size: 30, w: 700, al: 'center', c: '#C9D3DF' });
    const ax = bx + bw + 20; rr(g, ax, byy, bw, 84, 20); g.fillStyle = ok ? C.grn : C.cyan; if (ok) glow(g, C.grn, 24); g.fill(); g.shadowBlur = 0;
    if (ok) { check(g, ax + 52, byy + 42, 34, C.bg, ease(t, 20.15, 20.4)); text(g, 'Approved', ax + bw / 2 + 22, byy + 54, { size: 28, w: 800, c: C.bg, al: 'center' }); } else text(g, 'Approve', ax + bw / 2, byy + 54, { size: 30, w: 800, c: C.bg, al: 'center' });
    // finger tap
    const fk = clamp((t - 19.5) / .6), tap = t > 20.1 && t < 20.6; if (t > 19.5 && t < 21.2) { const fx = lerp(PX + PW - 40, ax + bw / 2 + 30, eoc(fk)), fy = lerp(PY + PH - 40, byy + 50, eoc(fk));
      g.beginPath(); g.arc(fx, fy, tap ? 30 : 38, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.35)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3; g.stroke();
      if (t > 20.1) { const rk = clamp((t - 20.1) / .5); g.beginPath(); g.arc(fx, fy, 30 + rk * 70, 0, Math.PI * 2); g.strokeStyle = `rgba(255,255,255,${.6 * (1 - rk)})`; g.lineWidth = 4; g.stroke(); } }
    g.restore(); }
  const hk = eob((t - 20.95) / .4); if (hk > 0) { g.save(); g.globalAlpha *= clamp(hk * 2); g.translate(PX + PW / 2, PY + 740); g.scale(clamp(hk, 0, 1.2), clamp(hk, 0, 1.2));
    rr(g, -230, -40, 460, 72, 36); g.fillStyle = C.yel; g.fill(); text(g, 'THE ONLY HUMAN STEP', 0, 9, { size: 28, w: 900, c: C.bg, al: 'center', ls: 1 }); g.restore(); }
}
function stPost(g, t) {
  header(g, 'Published', '@sixxab_money · reel');
  const tx = PX + 120, ty = PY + 200, tw = 340, th = 400; rr(g, tx, ty, tw, th, 20); g.fillStyle = '#F6F3EC'; g.fill();
  g.save(); rr(g, tx, ty, tw, th, 20); g.clip(); g.strokeStyle = '#222'; g.lineWidth = 5; g.beginPath(); [[0, .2], [.2, .3], [.35, .28], [.5, .45], [.65, .55], [.75, .8], [1, .62]].forEach(([u, v], i) => { const X = tx + 25 + (tw - 50) * u, Y = ty + 80 + 200 * v; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
  g.strokeStyle = '#C0392B'; g.setLineDash([10, 8]); g.lineWidth = 3; g.beginPath(); g.moveTo(tx, ty + 250); g.lineTo(tx + tw, ty + 250); g.stroke(); g.setLineDash([]);
  text(g, 'AI STOCKS AT', tx + tw / 2, ty + th - 80, { size: 30, w: 900, c: '#111', al: 'center' }); text(g, '52-WEEK LOWS', tx + tw / 2, ty + th - 40, { size: 30, w: 900, c: '#C0392B', al: 'center' }); g.restore();
  // play triangle
  g.beginPath(); g.moveTo(tx + tw / 2 - 22, ty + 150); g.lineTo(tx + tw / 2 + 28, ty + 180); g.lineTo(tx + tw / 2 - 22, ty + 210); g.closePath(); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
  const pk = eob((t - 23.3) / .45); if (pk > 0) { g.save(); g.globalAlpha *= clamp(pk * 2); g.translate(PX + PW / 2, PY + 650); g.scale(clamp(pk, 0, 1.15), clamp(pk, 0, 1.15));
    rr(g, -200, -38, 400, 76, 38); g.fillStyle = C.grn; g.fill(); check(g, -150, 0, 34, C.bg, ease(t, 23.3, 23.6)); text(g, 'Live · 12:31 PM', 22, 11, { size: 30, w: 800, c: C.bg, al: 'center' }); g.restore(); }
  const ck = eoc((t - 25.5) / .4); if (ck > 0) { const y = PY + 720 - (1 - ck) * -120; g.save(); g.globalAlpha *= ck;
    rr(g, PX + 40, y, PW - 80, 64, 16); g.fillStyle = '#18222E'; g.fill(); g.fillStyle = C.blue; g.fillRect(PX + 40, y, 8, 64);
    text(g, 'CAL', PX + 68, y + 41, { size: 20, w: 700, f: MONO, c: C.blue }); text(g, '12:31  Posted: AI stocks reel', PX + 130, y + 42, { size: 24, w: 600 }); g.restore(); }
}
function bubble(g, x, y, w, who, msg, col, mine, k) { if (k <= 0) return; g.save(); g.globalAlpha *= clamp(k * 2); const s = clamp(k, 0, 1.08); g.translate(x + (mine ? w : 0), y); g.scale(s, s); g.translate(-(mine ? w : 0), 0);
  g.beginPath(); g.arc(mine ? w - 26 : 26, 30, 26, 0, Math.PI * 2); g.fillStyle = col; g.fill();
  const bx = mine ? 0 : 70; rr(g, bx, 0, w - 70, 100, 24); g.fillStyle = mine ? '#1E3A4A' : '#1C2633'; g.fill();
  text(g, who, bx + 24, 36, { size: 20, w: 700, f: MONO, c: C.dim }); text(g, msg, bx + 24, 76, { size: 28, w: 700 }); g.restore(); }
function stDm(g, t) {
  header(g, 'Comments → DM', 'keyword watch: PLAN');
  bubble(g, PX + 30, PY + 220, PW - 60, '@viewer', 'PLAN', '#8E6CFF', false, eob((t - 27.6) / .4));
  bubble(g, PX + 30, PY + 350, PW - 60, '@sixxab_money', 'Sent! Check your DMs', C.cyan, true, eob((t - 29.3) / .4));
  const dk = eob((t - 30.0) / .45); if (dk > 0) { const y = PY + 500; g.save(); g.globalAlpha *= clamp(dk * 2);
    text(g, 'DIRECT MESSAGE', PX + 40, y, { size: 20, w: 700, f: MONO, c: C.cyan, ls: 2 });
    rr(g, PX + 40, y + 24, PW - 80, 150, 24); g.fillStyle = '#16212C'; g.fill(); g.strokeStyle = C.line; g.lineWidth = 2; g.stroke();
    rr(g, PX + 66, y + 50, 76, 98, 8); g.fillStyle = C.red; g.fill(); text(g, 'PDF', PX + 104, y + 108, { size: 22, w: 900, c: '#fff', al: 'center' });
    text(g, 'levels-sheet.pdf', PX + 166, y + 90, { size: 28, w: 700 }); text(g, 'Here\'s your guide', PX + 166, y + 128, { size: 24, w: 500, c: '#B8C4D2' }); g.restore(); }
}
function stLearn(g, t) {
  header(g, 'Weekly read', 'avg watch time by hook · example');
  const bars = [['Hook A', .42, C.dim], ['Hook B', .55, C.dim], ['Hook C', .86, C.cyan]];
  bars.forEach(([n, v, c], i) => { const y = PY + 250 + i * 130, k = eoc((t - 31.5 - i * .25) / .7); text(g, n, PX + 40, y, { size: 28, w: 700 });
    rr(g, PX + 40, y + 20, PW - 80, 42, 12); g.fillStyle = C.line; g.fill(); rr(g, PX + 40, y + 20, Math.max(24, (PW - 80) * v * k), 42, 12); g.fillStyle = c; if (i === 2 && t > 33.3) glow(g, C.cyan, 24); g.fill(); g.shadowBlur = 0; });
  const wk = eob((t - 33.35) / .4); if (wk > 0) { g.save(); g.globalAlpha *= clamp(wk * 2); g.translate(PX + PW / 2, PY + 680); g.scale(clamp(wk, 0, 1.15), clamp(wk, 0, 1.15));
    rr(g, -220, -40, 440, 80, 40); g.strokeStyle = C.cyan; g.lineWidth = 4; g.stroke(); text(g, 'MORE LIKE HOOK C', 0, 11, { size: 30, w: 900, c: C.cyan, al: 'center' });
    // loop arrow
    g.restore(); }
}
function cta(g, t) {
  if (t < S.cta) return; const k = eob((t - S.cta - .15) / .5), k2 = eob((t - 34.8) / .45);
  g.save(); g.globalAlpha = clamp(k * 2); text(g, 'Comment', W / 2, 760, { size: 84, w: 800, al: 'center' }); g.restore();
  if (k2 > 0) { g.save(); g.translate(W / 2, 900); const s = clamp(k2, 0, 1.12); g.scale(s, s); g.globalAlpha = clamp(k2 * 2);
    rr(g, -330, -100, 660, 200, 40); g.fillStyle = C.cyan; glow(g, C.cyan, 60); g.fill(); g.shadowBlur = 0; text(g, 'AGENT', 0, 52, { size: 150, w: 900, c: C.bg, al: 'center', ls: 6 }); g.restore(); }
  const k3 = eoc((t - 35.7) / .5); if (k3 > 0) { g.save(); g.globalAlpha = k3; text(g, 'get the full workflow map', W / 2, 1100, { size: 46, w: 600, al: 'center', c: C.txt });
    text(g, 'FIND · WRITE · BUILD · APPROVE · POST · DM · LEARN', W / 2, 1180, { size: 24, w: 500, f: MONO, al: 'center', c: C.dim }); g.restore(); }
}

// ---- terminal (under phone) ----
function terminal(g, t) {
  if (t < S.find || t > S.cta + .4) return; const a = 1 - ease(t, S.cta, S.cta + .4);
  const shown = LOG.filter(l => t >= l.t).slice(-2); g.save(); g.globalAlpha = a;
  rr(g, 90, 1352, W - 180, 104, 18); g.fillStyle = 'rgba(13,20,30,.92)'; g.fill(); g.strokeStyle = C.line; g.lineWidth = 2; g.stroke();
  shown.forEach((l, i) => { const last = i === shown.length - 1, s = last ? typed(l.s, t, l.t, 60) : l.s; const ok = / ok$/.test(s);
    text(g, ok ? s.slice(0, -3) : s, 116, 1392 + i * 42, { size: 26, w: 500, f: MONO, c: last ? C.txt : C.dim }); if (ok) text(g, ' ok', 116 + g.measureText(s.slice(0, -3)).width, 1392 + i * 42, { size: 26, w: 500, f: MONO, c: C.grn }); });
  g.restore();
}

// ---- captions (bottom, word highlight) ----
function captions(g, t) {
  const c = CHUNKS.find(c => t >= c.a - .05 && t <= c.b + .2); if (!c) return;
  const y = 1560, size = 64; g.font = `900 ${size}px ${SANS}`; g.letterSpacing = '0px';
  const ws = c.ws.map(w => w.w.toUpperCase()), sp = g.measureText(' ').width, widths = ws.map(w => g.measureText(w).width), tot = widths.reduce((a, b) => a + b, 0) + sp * (ws.length - 1);
  const pop = eob((t - c.a + .05) / .18), s = lerp(.85, 1, clamp(pop));
  g.save(); g.translate(W / 2, y); g.scale(s, s);
  rr(g, -tot / 2 - 34, -size * .95, tot + 68, size * 1.45, 26); g.fillStyle = '#0A0A0A'; g.fill();
  let x = -tot / 2; c.ws.forEach((w, i) => { const act = t >= w.a - .03 && t <= (c.ws[i + 1] ? c.ws[i + 1].a : c.b + .2);
    text(g, ws[i], x, 0, { size, w: 900, c: act ? C.yel : '#FFFFFF' }); x += widths[i] + sp; });
  g.restore();
}

export function render(g, t) {
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.shadowBlur = 0;
  if (t < S.find) { g.fillStyle = C.key; g.fillRect(0, 0, W, H); captions(g, t); return; }
  background(g, t);
  // short wipe from the host shot into the console
  pipeline(g, t); clock(g, t);
  phoneFrame(g, t, () => { for (const [k, fn] of [['find', stFind], ['write', stWrite], ['build', stBuild], ['approve', stApprove], ['post', stPost], ['dm', stDm], ['learn', stLearn]]) { const f = inStage(t, k, gg => fn(gg, t)); if (f) f(g); } });
  terminal(g, t); cta(g, t); captions(g, t);
  const wk = 1 - ease(t, S.find, S.find + .25); if (wk > 0) { g.fillStyle = C.key; g.fillRect(0, 0, W, H * wk); }
}
