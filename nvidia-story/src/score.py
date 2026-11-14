"""Music bed + UI sound design for the SIXXAB AI automation reel → out/music.wav (sits under Brian's VO at composite time)."""
import json, os
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile
HERE = os.path.dirname(os.path.abspath(__file__)); SR = 48000
E = json.load(open(os.path.join(HERE, 'events.json'))); DUR = E['dur']; EV = E['ev']
N = int((DUR + .5) * SR); BPM = 104; BEAT = 60 / BPM; BAR = 4 * BEAT
rng = np.random.default_rng(7); mus = np.zeros((N, 2)); sfx = np.zeros((N, 2))
mtof = lambda m: 440 * 2 ** ((m - 69) / 12)
def filt(x, kind, f): return sosfilt(butter(2, f, kind, fs=SR, output='sos'), x)
def env(n, a, d): t = np.arange(n) / SR; return np.minimum(1, t / a) * np.exp(-t / d)
def add(buf, t, x, pan=0, g=1):
    i = int(t * SR); x = x[:max(0, N - i)]
    if i < 0 or not len(x): return
    buf[i:i + len(x), 0] += x * g * np.cos((pan + 1) * np.pi / 4) * 1.41; buf[i:i + len(x), 1] += x * g * np.sin((pan + 1) * np.pi / 4) * 1.41
def pad(notes, dur, br, amp):
    n = int(dur * SR); t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * mtof(m) * (1 + c / 1200) * t + rng.random() * 6) + .3 * np.sin(4 * np.pi * mtof(m) * t) for m in notes for c in (-6, 0, 7))
    return filt(x / (3 * len(notes)), 'low', br) * np.clip(np.minimum(t / .25, (dur - t) / .35), 0, 1) * amp
def pluck(m, d=.35, a=.12):
    n = int(d * SR); t = np.arange(n) / SR; f = mtof(m)
    return (np.sin(2 * np.pi * f * t + 1.4 * np.exp(-t * 18) * np.sin(2 * np.pi * 2 * f * t))) * env(n, .002, d / 4) * a
CH = [[45, 52, 57, 60, 64], [41, 48, 53, 57, 64], [43, 50, 55, 59, 62], [40, 47, 52, 55, 59]]   # Am F G Em
HOOK = 3.1
# hook: sparse, low pad + heartbeat sub
add(mus, 0, pad([45, 52, 57], HOOK + .4, 900, .10))
t = HOOK; i = 0
while t < DUR - .2:
    d = min(BAR, DUR - t); add(mus, t, pad(CH[i % 4], d + .4, 1600, .07));
    arp = [0, 2, 3, 4, 3, 2, 1, 2]
    for k in range(8):
        if t + k * BEAT / 2 < DUR - 1.5: add(mus, t + k * BEAT / 2, pluck(CH[i % 4][arp[k]] + 12), (k % 2 - .5) * .5)
    t += BAR; i += 1
def kick():
    t = np.arange(int(.32 * SR)) / SR; return np.sin(2 * np.pi * np.cumsum(48 + 110 * np.exp(-t * 32)) / SR) * np.exp(-t * 9) * .55
def hat(): x = rng.standard_normal(int(.045 * SR)); return filt(x, 'high', 8000) * env(len(x), .001, .012) * .11
def snap(): x = rng.standard_normal(int(.18 * SR)); return filt(filt(x, 'high', 1200), 'low', 6000) * env(len(x), .002, .04) * .22
K, Hh, Sn = kick(), hat(), snap()
t = HOOK; k = 0
while t < DUR - 2.2:
    if k % 4 in (0,) or (k % 8 == 6): add(mus, t, K)
    if k % 4 == 2: add(mus, t, Sn, .1)
    add(mus, t + BEAT / 2, Hh, .3); add(mus, t, Hh * .5, -.3)
    t += BEAT; k += 1
for sec in np.arange(0, HOOK - .3, .85):
    add(mus, sec, K * .5)
# ---- UI sfx ----
for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'whoosh':
        n = int(.45 * SR); x = rng.standard_normal(n); tt = np.arange(n) / SR
        y = sosfilt(butter(2, [600, 4000], 'band', fs=SR, output='sos'), x) * np.sin(np.pi * tt / .45) ** 2 * .10; add(sfx, t - .2, y)
    elif ty == 'tick': add(sfx, t, pluck(96, .06, .05), .4)
    elif ty == 'tap': x = rng.standard_normal(int(.03 * SR)); add(sfx, t, filt(x, 'low', 3000) * env(len(x), .001, .006) * .4)
    elif ty == 'ok': add(sfx, t, pluck(84, .3, .09)); add(sfx, t + .08, pluck(91, .4, .09))
    elif ty == 'ding':
        n = int(1.0 * SR); tt = np.arange(n) / SR; add(sfx, t, (np.sin(2 * np.pi * 1318 * tt) + .4 * np.sin(2 * np.pi * 1976 * tt)) * env(n, .002, .25) * .09)
    elif ty == 'pop': n = int(.08 * SR); tt = np.arange(n) / SR; add(sfx, t, np.sin(2 * np.pi * (500 + 900 * tt / .08) * tt) * env(n, .001, .02) * .2)
    elif ty == 'stamp': n = int(.3 * SR); tt = np.arange(n) / SR; add(sfx, t, np.sin(2 * np.pi * (70 + 60 * np.exp(-tt * 25)) * tt) * np.exp(-tt * 14) * .45)
    elif ty == 'hit':
        n = int(2.2 * SR); tt = np.arange(n) / SR; add(sfx, t, np.sin(2 * np.pi * (44 + 50 * np.exp(-tt * 10)) * tt) * np.exp(-tt * 2) * .5)
        for j, m in enumerate([69, 72, 76, 81]): add(sfx, t + j * .06, pluck(m, 1.2, .07))
end = int(DUR * SR); mus = mus[:end]; sfx = sfx[:end]
mus[-int(1.6 * SR):] *= np.linspace(1, 0, int(1.6 * SR))[:, None]
mus = np.tanh(mus * 1.5) / 1.5; mus /= np.abs(mus).max() / .8
sfx /= max(1e-9, np.abs(sfx).max()) / .8
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
wavfile.write(os.path.join(HERE, 'out/music.wav'), SR, mus.astype(np.float32))
wavfile.write(os.path.join(HERE, 'out/sfx.wav'), SR, sfx.astype(np.float32)); print('ok', len(mus) / SR)
