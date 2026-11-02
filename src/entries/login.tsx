import React from 'react';
import { createRoot } from 'react-dom/client';
import Login from '../app/Login';
import { registerSW } from './pwa';

createRoot(document.getElementById('root')!).render(<Login />);
registerSW();
