import React from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from '../app/Dashboard';
import { registerSW } from './pwa';

createRoot(document.getElementById('root')!).render(<Dashboard />);
registerSW();
