// A panel that folds to one line: its title and a short summary of what is inside. Whether each panel is open
// is remembered in this browser, so the CRM tab stays as short as the owner leaves it.
import React, { useState } from 'react';

const KEY = 'sixxab.fold.';
function remembered(id: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(KEY + id);
    return v === null ? fallback : v === '1';
  } catch { return fallback; }
}
function remember(id: string, open: boolean) {
  try { localStorage.setItem(KEY + id, open ? '1' : '0'); } catch { /* private window: just not remembered */ }
}

export function Fold({ id, title, eyebrow, hint, open: openByDefault = false, children }: {
  id: string; title: string; eyebrow?: string; hint?: React.ReactNode; open?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => remembered(id, openByDefault));
  return (
    <details className="panel glass-card fold" id={id} open={open} onToggle={(e) => {
      const now = (e.currentTarget as HTMLDetailsElement).open;
      if (now !== open) { setOpen(now); remember(id, now); }
    }}>
      <summary>
        <h2>{title}</h2>
        {hint !== undefined && hint !== '' && <span className="muted small fold-hint">{hint}</span>}
      </summary>
      <div className="fold-body">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {children}
      </div>
    </details>
  );
}

/** Scrolls to an element, first opening every fold around it. */
export function reveal(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  for (let p: HTMLElement | null = el; p; p = p.parentElement) if (p instanceof HTMLDetailsElement && !p.open) p.open = true;
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
}
