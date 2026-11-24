import React from 'react';
import { createRoot } from 'react-dom/client';
import MarketingApp from '../app/MarketingApp';
import { registerSW } from './pwa';

createRoot(document.getElementById('root')!).render(<MarketingApp />);
registerSW();
