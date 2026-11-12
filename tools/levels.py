"""SIXXAB Money daily brief — SPX/QQQ levels (educational outlook, not a recommendation).

Run inside the Composio workbench (it has internet). Prints JSON for SPY, QQQ and ^GSPC:
  weekly  : UP if price > 10-wk EMA > 20-wk EMA, DOWN if price < 10 < 20, else MIXED
  daily   : nearest daily swing high above / swing low below price (5-bar pivots, last 60 sessions)
  4H      : nearest 4-hour pivot high above (supply) / pivot low below (demand), 4H bars built from 60m, session-aligned
  1H      : trigger = a 1-hour CLOSE above the 4H supply (bull case) / below the 4H demand (bear case)
Always present as if/then scenarios. No buy/sell calls, no targets promised.
"""
import json
import requests
import pandas as pd

H = {'User-Agent': 'Mozilla/5.0'}


def bars(sym, iv, rng):
    j = requests.get(f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}',
                     params={'interval': iv, 'range': rng}, headers=H, timeout=20).json()['chart']['result'][0]
    q = j['indicators']['quote'][0]
    idx = pd.to_datetime(j['timestamp'], unit='s', utc=True).tz_convert('America/New_York')
    return pd.DataFrame({'o': q['open'], 'h': q['high'], 'l': q['low'], 'c': q['close']}, index=idx).dropna()


def pivots(df, k=2):
    hi = [df.h.iloc[i] for i in range(k, len(df) - k) if df.h.iloc[i] == df.h.iloc[i - k:i + k + 1].max()]
    lo = [df.l.iloc[i] for i in range(k, len(df) - k) if df.l.iloc[i] == df.l.iloc[i - k:i + k + 1].min()]
    return hi, lo


def analyze(sym):
    w, d, h1 = bars(sym, '1wk', '2y'), bars(sym, '1d', '1y'), bars(sym, '60m', '60d')
    px = float(h1.c.iloc[-1])
    e10, e20 = float(w.c.ewm(span=10).mean().iloc[-1]), float(w.c.ewm(span=20).mean().iloc[-1])
    weekly = 'UP' if px > e10 > e20 else 'DOWN' if px < e10 < e20 else 'MIXED'
    dh, dl = pivots(d.iloc[-60:], 2)
    res = min([v for v in dh if v > px], default=float(d.h.iloc[-60:].max()))
    sup = max([v for v in dl if v < px], default=float(d.l.iloc[-60:].min()))
    h4 = h1.resample('4h', offset='9h30min').agg({'o': 'first', 'h': 'max', 'l': 'min', 'c': 'last'}).dropna().iloc[-40:]
    p4h, p4l = pivots(h4, 2)
    supply = min([v for v in p4h if v > px], default=res)
    demand = max([v for v in p4l if v < px], default=sup)
    r = lambda x: round(float(x), 2)
    return {'sym': sym, 'price': r(px), 'asof': str(h1.index[-1]), 'weekly': weekly, 'w_ema10': r(e10), 'w_ema20': r(e20),
            'daily_break_up': r(res), 'daily_break_down': r(sup), 'h4_supply': r(supply), 'h4_demand': r(demand),
            'h1_bull_trigger': f'1H close above {r(supply)}', 'h1_bear_trigger': f'1H close below {r(demand)}'}


if __name__ == '__main__':
    print(json.dumps([analyze(s) for s in ['SPY', 'QQQ', '^GSPC']], indent=1))
