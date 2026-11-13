import { render, events, DUR } from './reel.js';
const cv = document.getElementById('c'), g = cv.getContext('2d');
await Promise.all(['500 40px Inter', '600 40px Inter', '700 40px Inter', '900 40px Inter', '400 20px Plex', '500 20px Plex'].map(f => document.fonts.load(f)));
window.DUR = DUR; window.EV = events();
window.render = t => render(g, t);
window.READY = true;
