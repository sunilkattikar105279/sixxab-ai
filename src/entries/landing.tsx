import React, { useEffect, useState } from 'react';
import { hydrateRoot } from 'react-dom/client';
import Landing from '../landing/Landing';
import { getConfig } from '../lib/auth';
import { registerSW } from './pwa';

export function LandingApp({ initialBookingUrl = '' }: { initialBookingUrl?: string }) {
  const [bookingUrl, setBookingUrl] = useState(initialBookingUrl);
  useEffect(() => {
    getConfig().then((c) => c.bookingUrl && setBookingUrl(c.bookingUrl));
  }, []);
  return <Landing bookingUrl={bookingUrl} />;
}

if (typeof document !== 'undefined') {
  hydrateRoot(document.getElementById('root')!, <LandingApp />);
  registerSW();
}
