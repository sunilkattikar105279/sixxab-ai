import React from 'react';
import { renderToString } from 'react-dom/server';
import Landing from '../src/landing/Landing';

export function render(): string {
  return renderToString(<Landing veilStrength={0.35} showVideo bookingUrl="" />);
}
