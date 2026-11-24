// Tells an open tab that a newer SIXXAB is live (an open page keeps running the version it loaded).
// It compares this page's app script with the one /app serves now, on focus and every few minutes.
import React, { useEffect, useState } from 'react';

const SCRIPT = /\/assets\/app-[A-Za-z0-9_-]+\.js/;
const current = () => {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/app-"]');
  return s ? (s.getAttribute('src') ?? '').match(SCRIPT)?.[0] ?? '' : '';
};

export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const mine = current();
    if (!mine) return;
    let stop = false;
    let last = 0;
    const check = async () => {
      if (stop || Date.now() - last < 60_000) return;
      last = Date.now();
      try {
        navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => undefined);
        const res = await fetch(`/app?v=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
        if (!res.ok) return;
        const live = (await res.text()).match(SCRIPT)?.[0] ?? '';
        if (live && live !== mine && !stop) setReady(true);
      } catch { /* offline: try again later */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(check, 5 * 60_000);
    const first = window.setTimeout(check, 3000);
    return () => { stop = true; window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', onVisible); clearInterval(timer); clearTimeout(first); };
  }, []);
  if (!ready) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version of SIXXAB is ready.</span>
      <button type="button" className="btn-mini" onClick={() => location.reload()}>Reload</button>
    </div>
  );
}
