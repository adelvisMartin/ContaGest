import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../frontend/public/hipico-control/', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');
const canonicalStylesheets = [
  './assets/css/app.css',
  './assets/css/mobile-accessibility.css',
  './assets/css/operational-copy-center.css',
  './assets/css/operational-access-guard.css'
];
const removedLayers = [
  'styles.css', 'ui-system.css', 'tokens.css', 'themes.css', 'components.css',
  'operations-pro.css', 'precision-hipica.css', 'offline-icons.css', 'recovery.css', 'ui-system-v2.css'
];

test('hipico loads the explicit canonical visual authority set', async () => {
  const index = await read('index.html');
  const stylesheets = [...index.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(stylesheets, canonicalStylesheets);
  for (const href of canonicalStylesheets) await access(new URL(href.replace('./', ''), root));
  for (const name of removedLayers) {
    assert.equal(index.includes(name), false, `${name} must not be loaded`);
    await assert.rejects(access(new URL(`assets/css/${name}`, root)));
  }
});

test('app.css owns semantic colors, shape, touch and theme contracts', async () => {
  const css = await read('assets/css/app.css');
  for (const token of [
    '--hc-bg', '--hc-surface', '--hc-border', '--hc-text', '--hc-brand',
    '--hc-success', '--hc-warning', '--hc-danger', '--hc-info', '--hc-focus',
    '--hc-radius-md', '--hc-shadow-md', '--hc-safe-bottom', '--hc-nav-height',
    '--hc-header-height', '--hc-touch'
  ]) assert.ok(css.includes(token), `missing canonical token ${token}`);
  assert.match(css, /--hc-touch:\s*44px/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /@media \(prefers-color-scheme:\s*dark\)/);
});

test('canonical primitives define focus, semantic states and responsive behavior', async () => {
  const css = await read('assets/css/app.css');
  for (const selector of ['.button', '.icon-button', '.input', '.select', '.modal', '.tabs', '.badge', '.summary-table', '.list', '.kpi', '.ui-state', '.toast']) {
    assert.ok(css.includes(selector), `missing primitive ${selector}`);
  }
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.notice--success/);
  assert.match(css, /\.notice--warning/);
  assert.match(css, /\.kpi--danger/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media \(max-width:\s*470px\)/);
  assert.match(css, /@media \(max-width:\s*780px\)/);
});

test('mobile accessibility layer preserves touch and reduced-motion invariants without redefining theme tokens', async () => {
  const css = await read('assets/css/mobile-accessibility.css');
  assert.match(css, /@media \(max-width:\s*900px\),\s*\(pointer:\s*coarse\)/);
  assert.match(css, /min-height:\s*var\(--hc-touch,\s*44px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /--hc-brand\s*:/);
});

test('canonical style guide owns PWA/APK, touch and responsive QA rules', async () => {
  const guide = await read('STYLE-GUIDE.md');
  assert.match(guide, /única (?:línea|autoridad|referencia)/i);
  assert.match(guide, /assets\/css\/app\.css/);
  assert.match(guide, /mobile-accessibility\.css/);
  assert.match(guide, /PWA/i);
  assert.match(guide, /Android|APK/i);
  assert.match(guide, /44\s*px/i);
  assert.match(guide, /reduced[- ]motion/i);
  for (const width of ['360', '390', '430', '768', '1024', '1440']) assert.match(guide, new RegExp(width));
});
