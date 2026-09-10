import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const indexPath = 'frontend/public/hipico-control/index.html';
const cssPath = 'frontend/public/hipico-control/assets/css/ui-system-v2.css';
const guidePath = 'frontend/public/hipico-control/STYLE-GUIDE-V2.md';

test('#266 loads canonical UI System v2 after every legacy stylesheet', async () => {
  const index = await fs.readFile(indexPath, 'utf8');
  const legacy = index.indexOf('./assets/css/operations-pro.css');
  const canonical = index.indexOf('./assets/css/ui-system-v2.css');
  assert.ok(legacy >= 0, 'operations-pro.css must remain present during incremental migration');
  assert.ok(canonical > legacy, 'ui-system-v2.css must be the final visual authority');
});

test('#266 uses restrained typography and component geometry', async () => {
  const css = await fs.readFile(cssPath, 'utf8');
  assert.match(css, /--hc-weight-regular:\s*400/);
  assert.match(css, /--hc-weight-medium:\s*500/);
  assert.match(css, /--hc-weight-semibold:\s*600/);
  assert.match(css, /--hc-weight-bold:\s*700/);
  assert.match(css, /--hc-font-size-display:\s*clamp\(1\.625rem,[^;]+2rem\)/);
  assert.match(css, /--hc-radius-sm:\s*8px/);
  assert.match(css, /--hc-radius-lg:\s*12px/);
  assert.match(css, /\.badge\s*\{[^}]*font-size:\s*var\(--hc-font-size-xs\)/s);
  assert.match(css, /\.modal,[\s\S]*?border-radius:\s*var\(--hc-radius-lg\)/);
});

test('#266 neutralizes decorative saturation while preserving semantic states', async () => {
  const css = await fs.readFile(cssPath, 'utf8');
  assert.match(css, /body\s*\{[\s\S]*?background:\s*var\(--hc-bg\)/);
  assert.match(css, /\.toast\s*\{[\s\S]*?background:\s*var\(--hc-surface\)/);
  assert.match(css, /\.badge--success/);
  assert.match(css, /\.badge--warning/);
  assert.match(css, /\.badge--danger/);
  assert.match(css, /\.badge--info/);
  assert.doesNotMatch(css, /linear-gradient\(/i);
  assert.doesNotMatch(css, /radial-gradient\(/i);
  assert.doesNotMatch(css, /font-weight:\s*(?:800|900)\b/);
});

test('#266 keeps accessibility/mobile contracts and documents the canonical rules', async () => {
  const [css, guide] = await Promise.all([
    fs.readFile(cssPath, 'utf8'),
    fs.readFile(guidePath, 'utf8')
  ]);
  assert.match(css, /@media \(max-width:\s*780px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /min-height:\s*var\(--hc-touch\)/);
  assert.match(guide, /Badges/);
  assert.match(guide, /Modales/);
  assert.match(guide, /Toasts/);
  assert.match(guide, /Mobile first/);
  assert.match(guide, /Focus visible/);
});
