// Shared look for the signed-in app and login: same tokens as the landing page.
import React from 'react';

export const Mark = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 23 17" width={size} height={(size * 17) / 23} aria-hidden="true" style={{ fill: '#ffffff', display: 'block' }}>
    <path d="M8.15 0.9 L4.55 0.9 L0.5 9.3 L4.1 9.3 Z" />
    <path d="M17.0 0 L13.4 0 L6.15 16.4 L9.75 16.4 Z" />
    <path d="M22.9 0 L19.3 0 L15.0 7.6 L18.6 7.6 Z" />
    <path d="M22.6 6.9 L19.0 6.9 L14.05 16.4 L17.65 16.4 Z" />
  </svg>
);

export const Brand = () => (
  <a href="/" className="brand" aria-label="SIXXAB AI home">
    <Mark />
    <span className="brand-word">SIXXAB</span>
    <span className="brand-ai">AI</span>
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
