// Shared look for the signed-in app and login: same tokens as the landing page.
import React from 'react';

// SIXXAB family SX mark (same lockup as sunilkattikar.com, SIXXAB Library, School and Money).
const SX_PATH = 'M16,0 L49.4,0 L49,1.6 L36.4,19.6 L48.8,40.3 Q49.2,41.8 47.7,41.8 L32.8,41.8 Q30.6,41.7 31.4,40.4 L33.4,37.7 Q34,37.1 35,37.1 L38.3,37.1 L28.2,19.8 L21.8,11.2 Q21.1,9.2 23,9.1 L27,9.2 L32,15.9 L38.9,8.2 L40.3,5.8 Q40.5,5 39.4,5 L16.4,5 Q13.6,5.4 13.9,8.4 L14.3,10.3 L22.4,20.1 C28.5,26 29.5,31 27.6,35.8 C26.1,39.4 23.5,41.6 20.2,41.7 L1.4,41.8 Q0,41.7 0.4,40.2 L1.6,37.6 L6.4,30.9 L10.3,30.9 Q11.2,31.3 10.8,32.2 L9.2,35.4 Q9,36.8 10.3,36.8 L19.8,36.6 C22.8,35.5 23.6,32 21.9,29 L9.3,14.4 C7.6,12 7.4,6.5 9.5,3.5 C11,1.5 13,0.3 16,0 Z';

export const Mark = ({ size = 40 }: { size?: number }) => (
  <svg viewBox="0 0 50 42" width={size} height={(size * 42) / 50} aria-hidden="true" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="sx-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#F3D27A" />
        <stop offset="1" stopColor="#C8962F" />
      </linearGradient>
    </defs>
    <path d={SX_PATH} fill="url(#sx-gold)" />
  </svg>
);

export const Brand = () => (
  <a href="/" className="brand" aria-label="SIXXAB AI home">
    <Mark />
    <span className="brand-wm">
      <span className="brand-word">SIXXAB</span>
      <span className="brand-ai"><i />AI<i /></span>
    </span>
  </a>
);

export function Spinner({ label }: { label: string }) {
  return (
    <span className="spinner" role="status" aria-live="polite">
      <span className="spinner-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
