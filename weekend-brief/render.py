"""SIXXAB Money Sunday weekend brief: the market-cycle line draws itself while each agent reports.

Data-driven: everything that changes week to week lives in story.json.
  python3 render.py still story.json 3 17 30        -> still_XX.X.png frames to check
  python3 render.py video story.json out.mp4        -> silent 1080x1920 MP4 (mux the VO afterwards)
Env: FONT_HEAD (condensed bold), FONT_BODY (bold), FFMPEG (binary path).
Scene order is fixed (7 voiceover lines): 0 hook (clean cover: photo, no captions) · 1 cycle so far · 2 the drop (Tape, Sigma)
· 3 mood (Pulse, Spread) · 4 macro (Macro, Geo) · 5 two paths (Epoch) · 6 Mentor + CTA.
"""
import json, math, subprocess, sys, os
from PIL import Image, ImageDraw, ImageFont, ImageOps

W, H, FPS = 1080, 1920, 30
GAP = 0.25
HERE = os.path.dirname(os.path.abspath(__file__))
HEAD = os.environ.get('FONT_HEAD', '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf')
BODY = os.environ.get('FONT_BODY', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
NAVY, INK, GOLD, GOLD2, WHITE, MUTED = (11, 31, 58), (7, 20, 38), (201, 162, 39), (231, 199, 102), (255, 255, 255), (159, 176, 200)
GREEN, ORANGE, RED, TEAL = (70, 200, 140), (240, 160, 60), (235, 70, 70), (80, 200, 210)
COL = {'green': GREEN, 'orange': ORANGE, 'red': RED, 'teal': TEAL, 'gold': GOLD2, 'white': WHITE}

STORY = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'story.json')
ST = json.load(open(STORY))
TEMPO = ST.get('tempo', 1.06)
LINES = ST['lines']
S, t = [], 0.0
for L in LINES: S.append(t); t += L['dur'] + GAP
TOTAL_C = t - GAP + 1.2
TOTAL_V = TOTAL_C / TEMPO

def word_t(line, word, default=0.0):
    """Content time of the first word in a line that starts with `word` (case-insensitive)."""
    for w in LINES[line]['words']:
        if w['w'].lower().strip('.,:;?!"').startswith(word.lower()): return S[line] + w['start']
    return S[line] + default

_fc = {}
def F(path, size):
    k = (path, size)
    if k not in _fc: _fc[k] = ImageFont.truetype(path, size)
    return _fc[k]
def ease(x): x = max(0, min(1, x)); return x * x * (3 - 2 * x)
def lerp(a, b, x): return a + (b - a) * x
def mix(c1, c2, x): return tuple(int(lerp(a, b, x)) for a, b in zip(c1, c2))

# ---- the full cycle: up through euphoria, down to despair ----
FULL = [((0.03, 0.10), None), ((0.09, 0.115), 'Accumulation'), ((0.14, 0.15), None), ((0.17, 0.13), 'Shake-out'), ((0.23, 0.19), 'Trend emergence'),
        ((0.33, 0.33), 'Momentum building'), ((0.43, 0.50), 'First sentiment extreme'), ((0.48, 0.38), 'Bear trap'), ((0.54, 0.50), 'Renewed optimism'),
        ((0.60, 0.72), 'FOMO'), ((0.645, 0.93), 'Euphoria'), ((0.675, 0.70), 'Shoot across'), ((0.695, 0.63), 'Bull trap'), ((0.72, 0.77), 'The lower high'),
        ((0.745, 0.60), 'Breakdown'), ((0.775, 0.36), 'Fear & capitulation'), ((0.80, 0.17), None), ((0.825, 0.29), 'Bottom fishing'), ((0.85, 0.13), None),
        ((0.88, 0.19), None), ((0.92, 0.07), 'Despair'), ((0.965, 0.11), None)]
STAGES = [n for _, n in FULL if n]
NOW = ST.get('stage_now', 'Breakdown')
assert NOW in STAGES, f'stage_now must be one of {STAGES}'
NOW_I = [n for _, n in FULL].index(NOW)
MAIN, REST = FULL[:NOW_I + 1], [(FULL[NOW_I][0], None)] + FULL[NOW_I + 1:]
nx, ny = FULL[NOW_I][0]
PATH_A = [((nx, ny), None), ((nx + 0.03, max(0.05, ny - 0.10)), None), ((lerp(nx, 0.965, 0.4), lerp(ny, 0.97, 0.35)), None),
          ((lerp(nx, 0.965, 0.72), lerp(ny, 0.97, 0.7)), None), ((0.965, 0.97), None)]

CX0, CX1, CY0, CY1 = 70, 1010, 360, 1120
def P(pt): return (CX0 + pt[0] * (CX1 - CX0), CY1 - pt[1] * (CY1 - CY0))

def dense(points, wiggle=0.0, seed=1):
    pts = [p for p, _ in points]; out, marks = [], {}
    ext = [pts[0]] + pts + [pts[-1]]
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
        if points[i][1]: marks[points[i][1]] = len(out)
        n = 26
        for k in range(n):
            u = k / n
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u * u + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u ** 3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u * u + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u ** 3)
            j = len(out)
            y += wiggle * (math.sin(j * 1.7 + seed) * 0.6 + math.sin(j * 4.3 + seed * 2) * 0.4) * (0 if k == 0 else 1)
            out.append(P((x, y)))
    if points[-1][1]: marks[points[-1][1]] = len(out)
    out.append(P(pts[-1]))
    return out, marks

MD, MM = dense(MAIN, 0.006)
AD, _ = dense(PATH_A, 0.005, 3)
BD, BM = dense(REST, 0.006, 5) if len(REST) > 1 else ([], {})
GHOST, _ = dense(FULL[:15], 0.006)
EUPH = MM.get('Euphoria', len(MD) - 1)

# main line: up to euphoria during line 1, the rest during line 2
upto = [k for k in ('Trend emergence', 'Momentum building', 'Bear trap', 'FOMO', 'Euphoria') if k in MM]
ANCH = [(S[1], 0)]
for j, k in enumerate(upto): ANCH.append((S[1] + LINES[1]['dur'] * (0.28 + 0.34 * (j + 1) / len(upto)), MM[k]))
ANCH.append((S[2] + 0.4, ANCH[-1][1]))
ANCH.append((S[2] + max(1.5, LINES[2]['dur'] * 0.65), len(MD) - 1))
def main_progress(tc):
    if tc <= ANCH[0][0]: return 0
    for (t0, i0), (t1, i1) in zip(ANCH, ANCH[1:]):
        if tc <= t1: return lerp(i0, i1, ease((tc - t0) / max(1e-6, t1 - t0)))
    return len(MD) - 1
NOW_T = ANCH[-1][0]
def seg_progress(tc, t0, t1, n): return lerp(0, n - 1, ease((tc - t0) / (t1 - t0))) if tc > t0 and n > 1 else 0

LABEL_OFF = {'Accumulation': (-20, -34), 'Shake-out': (20, 36), 'Trend emergence': (-90, -34), 'Momentum building': (-150, -20), 'First sentiment extreme': (-170, -40),
             'Bear trap': (0, 40), 'Renewed optimism': (0, 45), 'FOMO': (-80, 0), 'Euphoria': (0, -36), 'Shoot across': (-125, 40), 'Bull trap': (-70, 40),
             'The lower high': (130, -30), 'Breakdown': (40, 44), 'Fear & capitulation': (-135, 0), 'Bottom fishing': (115, -10), 'Despair': (0, 36)}
def stage_col(name):
    if name in ('Accumulation', 'Shake-out'): return GREEN
    if name == 'Trend emergence': return TEAL
    if name in ('Momentum building', 'Renewed optimism'): return ORANGE
    if name in ('First sentiment extreme', 'Bear trap'): return WHITE
    return RED

def background():
    bg = Image.new('RGB', (W, H), INK); d = ImageDraw.Draw(bg)
    for y in range(H): d.line([(0, y), (W, y)], fill=mix(NAVY, INK, y / H))
    for k in range(1, 6):
        y = CY0 + k * (CY1 - CY0) / 6; d.line([(CX0, y), (CX1, y)], fill=(30, 50, 82), width=1)
    d.line([(CX0, CY1), (CX1, CY1)], fill=(60, 82, 118), width=2)
    d.text((W // 2, 70), ST.get('kicker', 'SIXXAB MONEY  ·  WEEKEND BRIEF'), font=F(BODY, 30), fill=GOLD, anchor='mm')
    d.text((W // 2, 150), ST.get('title1', 'WHERE ARE WE'), font=F(HEAD, 96), fill=WHITE, anchor='mm')
    d.text((W // 2, 250), ST.get('title2', 'IN THE MARKET CYCLE?'), font=F(HEAD, 74), fill=GOLD2, anchor='mm')
    d.text((W // 2, 1880), ST.get('footer', 'Educational, not financial advice'), font=F(BODY, 22), fill=MUTED, anchor='mm')
    return bg
BG = background()

def photo_disc():
    p = ST.get('photo')
    if not p: return None
    if not os.path.isabs(p): p = os.path.join(os.path.dirname(os.path.abspath(STORY)), p)
    if not os.path.exists(p): return None
    D = 380
    im = ImageOps.fit(Image.open(p).convert('RGB'), (D, D), centering=(0.5, 0.35))
    m = Image.new('L', (D * 4, D * 4), 0); ImageDraw.Draw(m).ellipse([0, 0, D * 4 - 1, D * 4 - 1], fill=255); m = m.resize((D, D), Image.LANCZOS)
    ring = Image.new('RGBA', (D + 24, D + 24), (0, 0, 0, 0)); rd = ImageDraw.Draw(ring)
    rd.ellipse([0, 0, D + 23, D + 23], fill=GOLD2 + (255,))
    ring.paste(im, (12, 12), m)
    return ring
PHOTO = photo_disc()

def poly(d, pts, col, w):
    if len(pts) >= 2: d.line(pts, fill=col, width=w, joint='curve')
def partial(pts, prog):
    i = int(prog); fr = prog - i; seg = pts[:i + 1]
    if i + 1 < len(pts): seg = seg + [(lerp(pts[i][0], pts[i + 1][0], fr), lerp(pts[i][1], pts[i + 1][1], fr))]
    return seg
def dashed(d, pts, col, w, dash=16, gap=11):
    acc, on = 0.0, True
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a, b); s = 0.0
        while s < L:
            step = min(L - s, (dash if on else gap) - acc)
            p0 = (lerp(a[0], b[0], s / L), lerp(a[1], b[1], s / L)); p1 = (lerp(a[0], b[0], (s + step) / L), lerp(a[1], b[1], (s + step) / L))
            if on: d.line([p0, p1], fill=col, width=w)
            s += step; acc += step
            if acc >= (dash if on else gap) - 1e-6: acc, on = 0.0, not on
def label(d, xy, text, col, alpha, size=28, dy=-34):
    if alpha <= 0: return
    f = F(BODY, size); x, y = xy; tw = d.textlength(text, font=f)
    x = min(max(x, tw / 2 + 14), W - tw / 2 - 14)
    d.text((x, y + dy), text, font=f, fill=mix(INK, col, alpha), anchor='mm', stroke_width=4, stroke_fill=INK)

# ---- cards ----
CARD_Y0, CARD_Y1 = 1180, 1560
SCHED = [(S[0], {'kind': 'hook'})]
for c in ST['cards']:
    SCHED.append((word_t(c['line'], c['at']) if c.get('at') else S[c['line']], c))
SCHED.append((word_t(6, ST.get('end_at', 'Follow'), LINES[6]['dur'] * 0.62), {'kind': 'end'}))
SCHED.sort(key=lambda x: x[0])

def card_box(d, a, acc): d.rounded_rectangle([60, CARD_Y0, W - 60, CARD_Y1], radius=34, fill=mix(INK, (16, 38, 70), a), outline=mix(INK, acc, a), width=4)
def chip(d, x, y, name, role, acc, a):
    f1 = F(HEAD, 44); w1 = d.textlength(name, font=f1)
    d.rounded_rectangle([x, y - 34, x + w1 + 40, y + 34], radius=34, fill=mix(INK, acc, a))
    d.text((x + 20 + w1 / 2, y), name, font=f1, fill=INK, anchor='mm')
    d.text((x + w1 + 60, y), role.upper(), font=F(BODY, 26), fill=mix(INK, MUTED, a), anchor='lm')
def fit(d, text, font_path, size, maxw):
    while size > 18 and d.textlength(text, font=F(font_path, size)) > maxw: size -= 2
    return F(font_path, size)

def draw_card(d, tc):
    cur = [c for c in SCHED if c[0] <= tc]
    if not cur: return
    t0, c = cur[-1]; a = ease((tc - t0) / 0.35); k = c['kind']; acc = COL.get(c.get('color', 'gold'), GOLD2)
    if k == 'hook':
        a = 1.0
        down = ST.get('hook_dir', 'down') == 'down'
        card_box(d, a, RED if down else GREEN)
        ws = LINES[0]['words']
        for i, name in enumerate(ST['hook'][:6]):
            aa = 1.0; col, row = i % 2, i // 2   # all visible from frame 1: this scene is the cover
            x = 100 + col * 460; y = CARD_Y0 + 80 + row * 105
            d.text((x, y), name, font=fit(d, name, HEAD, 54, 330), fill=mix(INK, WHITE, aa), anchor='lm')
            d.text((x + 400, y), '▼' if down else '▲', font=F(BODY, 48), fill=mix(INK, RED if down else GREEN, aa), anchor='mm')
    elif k == 'card':
        card_box(d, a, acc); chip(d, 100, CARD_Y0 + 70, c['agent'], c['role'], acc, a)
        d.text((100, CARD_Y0 + 165), c['big'], font=fit(d, c['big'], HEAD, 64, W - 220), fill=mix(INK, WHITE, a), anchor='lm')
        for i, r in enumerate(c.get('rows', [])[:3]):
            d.text((100, CARD_Y0 + 245 + i * 52), '•  ' + r, font=fit(d, '•  ' + r, BODY, 34, W - 220), fill=mix(INK, acc if i == 0 else MUTED, a), anchor='lm')
    elif k == 'gauge':
        val, mood = c['value'], c.get('mood', '')
        mc = RED if val < 45 else ORANGE if val < 55 else GREEN
        card_box(d, a, mc); chip(d, 100, CARD_Y0 + 70, c.get('agent', 'PULSE'), c.get('role', 'SIXXAB Sentiment'), ORANGE, a)
        cx, cy, r = W // 2, CARD_Y0 + 300, 150
        for j in range(60):
            v0, v1 = j / 60, (j + 1) / 60
            d.arc([cx - r, cy - r, cx + r, cy + r], 180 + v0 * 180, 180 + v1 * 180 + 0.5, fill=mix(INK, mix(RED, GREEN, v0), a), width=28)
        sh = min(val, 100 * ease((tc - t0) / 1.0)); ang = math.radians(180 + sh / 100 * 180)
        d.line([(cx, cy), (cx + (r - 40) * math.cos(ang), cy + (r - 40) * math.sin(ang))], fill=mix(INK, WHITE, a), width=8)
        d.ellipse([cx - 14, cy - 14, cx + 14, cy + 14], fill=mix(INK, WHITE, a))
        d.text((cx + 250, cy - 70), f'{int(round(sh))}', font=F(HEAD, 110), fill=mix(INK, mc, a), anchor='mm')
        d.text((cx + 250, cy + 10), mood.upper(), font=fit(d, mood.upper(), HEAD, 54, 220), fill=mix(INK, mc, a), anchor='mm')
        d.text((cx - 250, cy - 30), f"last week {c['prev']}" if c.get('prev') is not None else '0–100', font=F(BODY, 28), fill=mix(INK, MUTED, a), anchor='mm')
    elif k == 'paths':
        card_box(d, a, GOLD); chip(d, 100, CARD_Y0 + 70, c.get('agent', 'EPOCH'), c.get('role', 'Money history'), GOLD, a)
        ra = ease((tc - word_t(5, c.get('a_at', 'without'), 2.5)) / 0.4); rb = ease((tc - word_t(5, c.get('b_at', 'With'), 6.2)) / 0.4)
        d.text((100, CARD_Y0 + 155), c['a_title'], font=F(HEAD, 48), fill=mix(INK, GREEN, ra), anchor='lm')
        d.text((100, CARD_Y0 + 205), c['a_text'], font=fit(d, c['a_text'], BODY, 32, W - 220), fill=mix(INK, WHITE, ra), anchor='lm')
        d.text((100, CARD_Y0 + 265), c['b_title'], font=F(HEAD, 48), fill=mix(INK, RED, rb), anchor='lm')
        d.text((100, CARD_Y0 + 315), c['b_text'], font=fit(d, c['b_text'], BODY, 32, W - 220), fill=mix(INK, WHITE, rb), anchor='lm')
        d.text((W - 100, CARD_Y1 - 24), c.get('source', ''), font=F(BODY, 22), fill=mix(INK, MUTED, a), anchor='rm')
    elif k == 'mentor':
        card_box(d, a, GREEN); chip(d, 100, CARD_Y0 + 70, c.get('agent', 'MENTOR'), c.get('role', 'Your coach'), GREEN, a)
        d.text((100, CARD_Y0 + 160), c['big'], font=fit(d, c['big'], HEAD, 54, W - 220), fill=mix(INK, WHITE, a), anchor='lm')
        for i, it in enumerate(c['items'][:3]):
            aa = ease((tc - word_t(6, it['at'], 2.6 + i * 1.3)) / 0.25)
            d.text((100, CARD_Y0 + 235 + i * 56), '✓  ' + it['text'], font=fit(d, '✓  ' + it['text'], BODY, 38, W - 220), fill=mix(INK, GREEN if i == 0 else WHITE, aa), anchor='lm')
    elif k == 'end':
        card_box(d, a, GOLD)
        d.text((W // 2, CARD_Y0 + 120), 'FOLLOW', font=F(HEAD, 60), fill=mix(INK, WHITE, a), anchor='mm')
        d.text((W // 2, CARD_Y0 + 205), ST.get('handle', '@sixxab_money'), font=F(HEAD, 78), fill=mix(INK, GOLD2, a), anchor='mm')
        d.text((W // 2, CARD_Y0 + 285), ST.get('end_sub', 'Weekend brief every Sunday · money.sixxab.com'), font=F(BODY, 30), fill=mix(INK, MUTED, a), anchor='mm')

# ---- captions: start with the second scene (the first scene is the clean cover) ----
WORDS, _g = [], 0
for i, L in enumerate(LINES):
    if i < ST.get('captions_from_line', 1): continue
    chunk = []
    for w in L['words']:
        chunk.append(w)
        if len(chunk) >= 4 or w['w'][-1] in '.,:?!':
            _g += 1
            for c in chunk: WORDS.append((S[i] + c['start'], S[i] + c['end'], c['w'], _g))
            chunk = []
    _g += 1
    for c in chunk: WORDS.append((S[i] + c['start'], S[i] + c['end'], c['w'], _g))

def draw_caption(d, tc):
    cur = None
    for k, (a, b, w, g) in enumerate(WORDS):
        if a <= tc < (WORDS[k + 1][0] if k + 1 < len(WORDS) else b + 0.4): cur = k; break
    if cur is None: return
    g = WORDS[cur][3]; grp = [(k, x) for k, x in enumerate(WORDS) if x[3] == g]
    words = [x[2].upper() for _, x in grp]
    f = F(HEAD, 74); total = sum(d.textlength(w + ' ', font=f) for w in words)
    f = F(HEAD, int(74 * min(1.0, (W - 80) / total))); total = sum(d.textlength(w + ' ', font=f) for w in words)
    x = (W - total) / 2
    for (k, _), w in zip(grp, words):
        d.text((x, 1715), w, font=f, fill=GOLD2 if k == cur else WHITE, anchor='lm', stroke_width=6, stroke_fill=(0, 0, 0))
        x += d.textlength(w + ' ', font=f)

def frame(tv):
    tc = tv * TEMPO
    im = BG.copy(); d = ImageDraw.Draw(im)
    if tc < S[1] + 0.6:
        g = ease(1 - (tc - S[1]) / 0.6) if tc > S[1] else 1
        poly(d, GHOST, mix(INK, (40, 64, 100), g), 6)
    if PHOTO is not None and tc < S[1] + 0.5:
        pa = 1.0 if tc < S[1] else 1 - ease((tc - S[1]) / 0.5)
        ph = PHOTO.copy(); ph.putalpha(ph.getchannel('A').point(lambda v: int(v * pa)))
        px, py = W - 60 - ph.width, CY0 + 30
        im.paste(ph, (px, py), ph); d = ImageDraw.Draw(im)
        if pa > 0.05:
            cx = px + ph.width // 2
            d.text((cx, py + ph.width + 40), ST.get('host_name', 'Sunil Kattikar'), font=F(HEAD, 46), fill=mix(INK, WHITE, pa), anchor='mm', stroke_width=4, stroke_fill=INK)
            d.text((cx, py + ph.width + 88), ST.get('host_role', 'Founder, SIXXAB Money'), font=F(BODY, 28), fill=mix(INK, GOLD2, pa), anchor='mm', stroke_width=4, stroke_fill=INK)
            if ST.get('date'): d.text((CX0 + 10, CY0 + 20), ST['date'].upper(), font=F(BODY, 28), fill=mix(INK, GOLD2, pa), anchor='lm')
            if ST.get('progress'):
                pg = ST['progress']
                d.text((CX0 + 10, CY0 + 90), 'LAST WEEK', font=F(BODY, 24), fill=mix(INK, MUTED, pa), anchor='lm')
                d.text((CX0 + 10, CY0 + 132), pg['last'], font=fit(d, pg['last'], HEAD, 44, 520), fill=mix(INK, WHITE, pa), anchor='lm')
                d.text((CX0 + 10, CY0 + 200), 'THIS WEEK', font=F(BODY, 24), fill=mix(INK, MUTED, pa), anchor='lm')
                d.text((CX0 + 10, CY0 + 242), pg['now'], font=fit(d, pg['now'], HEAD, 44, 520), fill=mix(INK, GOLD2, pa), anchor='lm')
    pr = main_progress(tc)
    if pr > 0:
        pts = partial(MD, pr)
        up, down = pts[:min(len(pts), EUPH + 1)], pts[EUPH:] if len(pts) > EUPH else []
        poly(d, up, (60, 210, 150), 9)
        if len(down) > 1: poly(d, down, (240, 80, 80), 9)
        hx, hy = pts[-1]; d.ellipse([hx - 11, hy - 11, hx + 11, hy + 11], fill=WHITE)
    pcard = next((c for c in ST['cards'] if c['kind'] == 'paths'), {})
    ta, tb = word_t(5, pcard.get('a_at', 'without'), 2.5), word_t(5, pcard.get('b_at', 'With'), 6.2)
    pa_ = seg_progress(tc, ta, tb - 0.3, len(AD)); pb_ = seg_progress(tc, tb, S[5] + LINES[5]['dur'], len(BD))
    if pa_ > 0:
        dashed(d, partial(AD, pa_), GREEN, 8)
        if pa_ >= len(AD) - 1.01: x, y = AD[-1]; d.text((x + 20, y + 45), pcard.get('a_label', 'NO RECESSION'), font=F(HEAD, 34), fill=GREEN, anchor='rm', stroke_width=4, stroke_fill=INK)
    if pb_ > 0:
        dashed(d, partial(BD, pb_), RED, 8)
        for name, i in BM.items():
            if pb_ >= i: x, y = BD[i]; dx, dy = LABEL_OFF.get(name, (0, -34)); label(d, (x + dx, y), name, (240, 120, 120), 1, 26, dy)
        if pb_ >= len(BD) - 1.01: x, y = BD[-1]; d.text((x + 30, y - 45), pcard.get('b_label', 'RECESSION'), font=F(HEAD, 34), fill=RED, anchor='rm', stroke_width=4, stroke_fill=INK)
    for name, i in MM.items():
        if pr >= i:
            a = 1.0 if i == len(MD) - 1 else min(1.0, (pr - i) / 8 + 0.2)
            x, y = MD[i]; col = stage_col(name); dx, dy = LABEL_OFF.get(name, (0, -34))
            d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=col, outline=INK, width=3)
            label(d, (x + dx, y), name, col, a, 28, dy)
    if tc >= NOW_T:
        x, y = MD[-1]; ph = (tc * 2) % 1; r = 14 + 26 * ph
        d.ellipse([x - r, y - r, x + r, y + r], outline=mix(INK, GOLD2, 1 - ph), width=4)
        d.ellipse([x - 13, y - 13, x + 13, y + 13], fill=GOLD2)
        f = F(HEAD, 32); tw = d.textlength('YOU ARE HERE', font=f)
        bx, by = W - 60 - tw - 40, CY1 - 0.44 * (CY1 - CY0)
        if abs(y - by) < 70: by = CY0 + 80
        d.line([(x, y), (bx + 20, by + (-20 if by > y else 20))], fill=GOLD2, width=3)
        d.rounded_rectangle([bx, by - 30, bx + tw + 40, by + 30], radius=30, fill=GOLD2)
        d.text((bx + 20 + tw / 2, by), 'YOU ARE HERE', font=f, fill=INK, anchor='mm')
    draw_card(d, tc)
    draw_caption(d, tc)
    return im

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'still':
        for tv in map(float, sys.argv[3:]): frame(tv).save(f'still_{tv:05.1f}.png')
    else:
        out = sys.argv[3]; n = int(TOTAL_V * FPS)
        p = subprocess.Popen([os.environ.get('FFMPEG', 'ffmpeg'), '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                              '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
        for k in range(n): p.stdin.write(frame(k / FPS).tobytes())
        p.stdin.close(); p.wait(); print('frames', n, 'seconds', round(TOTAL_V, 2))
