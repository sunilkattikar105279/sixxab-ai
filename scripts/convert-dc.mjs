// Converts the approved Design canvas artboard (.dc.html) into a React component.
// Usage: NODE_PATH=/opt/npm-tools/node_modules node scripts/convert-dc.mjs <in.dc.html> <outDir>
// Output: <outDir>/Landing.tsx (markup), logic.js (the artboard's logic class), styles.css (helmet CSS)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [, , input, outDir] = process.argv;
const src = fs.readFileSync(input, 'utf8');

const xdc = src.slice(src.indexOf('<x-dc>') + 6, src.indexOf('</x-dc>'));
const helmet = xdc.slice(xdc.indexOf('<helmet>') + 8, xdc.indexOf('</helmet>'));
const markup = xdc.slice(xdc.indexOf('</helmet>') + 9);
const css = (helmet.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
const scriptStart = src.indexOf('>', src.indexOf('data-dc-script')) + 1;
const logic = src.slice(scriptStart, src.lastIndexOf('</script>'));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><body><div id="root">${markup}</div></body></html>`);

const jsx = await page.evaluate(() => {
  const ATTR = {
    class: 'className', for: 'htmlFor', onclick: 'onClick', autoplay: 'autoPlay', playsinline: 'playsInline',
    strokewidth: 'strokeWidth', textanchor: 'textAnchor', fontsize: 'fontSize', fontweight: 'fontWeight',
    markerend: 'markerEnd', strokelinecap: 'strokeLinecap', strokelinejoin: 'strokeLinejoin',
    strokedasharray: 'strokeDasharray', fillopacity: 'fillOpacity', markerwidth: 'markerWidth',
    markerheight: 'markerHeight', refx: 'refX', refy: 'refY', viewbox: 'viewBox', tabindex: 'tabIndex',
    'stroke-width': 'strokeWidth', 'text-anchor': 'textAnchor', 'font-size': 'fontSize',
    'font-weight': 'fontWeight', 'stroke-linecap': 'strokeLinecap', 'stroke-linejoin': 'strokeLinejoin',
    'fill-opacity': 'fillOpacity', 'marker-end': 'markerEnd', 'stroke-dasharray': 'strokeDasharray',
  };
  const BOOL = new Set(['autoplay', 'muted', 'loop', 'playsinline']);
  const VOID = new Set(['path', 'rect', 'line', 'polygon', 'circle', 'input', 'img', 'br', 'hr', 'video', 'ellipse', 'polyline']);
  const scope = [];
  const ref = (expr) => {
    const e = expr.trim();
    if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(e)) return e;
    const head = e.split('.')[0];
    return scope.includes(head) || head === '$index' ? e : `v.${e}`;
  };
  const interp = (s) => {
    const whole = s.match(/^\s*\{\{([^}]+)\}\}\s*$/);
    if (whole) return { expr: ref(whole[1]) };
    if (s.includes('{{')) {
      const t = s.replace(/`/g, '\\`').replace(/\{\{([^}]+)\}\}/g, (_, x) => '${' + ref(x) + '}');
      return { expr: '`' + t + '`' };
    }
    return { str: s };
  };
  const camel = (p) => p.trim().replace(/^-webkit-/, 'Webkit-').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const styleObj = (s) => {
    const parts = [];
    let depth = 0, cur = '';
    for (const ch of s) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ';' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    const props = parts.map((d) => {
      const i = d.indexOf(':');
      if (i < 0) return null;
      const k = camel(d.slice(0, i));
      const val = d.slice(i + 1).trim();
      const r = interp(val);
      return `${JSON.stringify(k)}: ${r.expr ?? JSON.stringify(r.str)}`;
    }).filter(Boolean);
    return `{{${props.join(', ')}}}`;
  };
  const text = (t) => {
    if (!t.trim()) return t.includes('\n') ? '\n' : t;
    let out = '';
    let last = 0;
    const re = /\{\{([^}]+)\}\}/g;
    let m;
    const esc = (x) => x.replace(/[{}<>]/g, (c) => `{'${c}'}`);
    while ((m = re.exec(t))) {
      out += esc(t.slice(last, m.index)) + '{' + ref(m[1]) + '}';
      last = m.index + m[0].length;
    }
    return out + esc(t.slice(last));
  };
  const kids = (el) => Array.from(el.childNodes).map(conv).join('');
  function conv(n) {
    if (n.nodeType === 3) return text(n.textContent);
    if (n.nodeType !== 1) return '';
    const tag = n.localName;
    if (tag === 'sc-for') {
      const list = n.getAttribute('list').replace(/[{}]/g, '').trim();
      const as = n.getAttribute('as');
      const listExpr = ref(list);
      scope.push(as);
      const inner = kids(n);
      scope.pop();
      return `{(${listExpr} || []).map((${as}, $index) => (<React.Fragment key={$index}>${inner}</React.Fragment>))}`;
    }
    if (tag === 'sc-if') {
      const cond = ref(n.getAttribute('value').replace(/[{}]/g, ''));
      return `{${cond} ? (<>${kids(n)}</>) : null}`;
    }
    const attrs = [];
    for (const a of Array.from(n.attributes)) {
      const name = a.name;
      if (name.startsWith('hint-')) continue;
      const key = ATTR[name] || name;
      if (BOOL.has(name)) { attrs.push(key); continue; }
      if (name === 'style') { attrs.push(`style=${styleObj(a.value)}`); continue; }
      const r = interp(a.value);
      if (r.expr) attrs.push(`${key}={${r.expr}}`);
      else attrs.push(`${key}=${r.str.includes('"') ? `{${JSON.stringify(r.str)}}` : `"${r.str}"`}`);
    }
    const open = `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
    const inner = kids(n);
    if (!inner.trim() && VOID.has(tag)) return `${open} />`;
    return `${open}>${inner}</${tag}>`;
  }
  return kids(document.getElementById('root'));
});
await browser.close();

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'styles.css'), css.trim() + '\n');
fs.writeFileSync(
  path.join(outDir, 'logic.js'),
  `// Generated from the approved design artboard. Edit the design, then re-run scripts/convert-dc.mjs.\nimport { DCLogic } from './dc.js';\n\nexport ${logic.trim()}\n`,
);
fs.writeFileSync(
  path.join(outDir, 'Landing.tsx'),
  `// @ts-nocheck\n// Generated from the approved design artboard by scripts/convert-dc.mjs. Do not hand-edit layout here.\nimport React from 'react';\nimport { useDC } from './dc.js';\nimport { Component } from './logic.js';\n\nexport default function Landing(props) {\n  const v = useDC(Component, props);\n  return (<>${jsx}</>);\n}\n`,
);
console.log('converted', { css: css.length, logic: logic.length, jsx: jsx.length });
