import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../frontend/public/hipico-control/', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');

test('hipico loads one canonical token/theme/component layer', async () => {
  const index = await read('index.html');
  const expected = [
    './assets/css/styles.css',
    './assets/css/tokens.css',
    './assets/css/themes.css',
    './assets/css/components.css',
    './assets/css/operations-pro.css'
  ];
  let cursor = -1;
  for (const href of expected) {
    const next = index.indexOf(href);
    assert.ok(next > cursor, `${href} must be loaded once and in canonical order`);
    cursor = next;
  }
  assert.equal((index.match(/precision-hipica\.css/g) || []).length, 0, 'legacy precision stylesheet must not become a competing runtime layer');
});

test('semantic tokens cover color, density, type, elevation, touch and safe areas', async () => {
  const css = await read('assets/css/tokens.css');
  for (const token of [
    '--hc-bg', '--hc-surface', '--hc-border', '--hc-text', '--hc-brand',
    '--hc-success', '--hc-warning', '--hc-danger', '--hc-info', '--hc-focus',
    '--hc-space-1', '--hc-space-16', '--hc-radius-md', '--hc-shadow-dialog',
    '--hc-font-sans', '--hc-font-mono', '--hc-touch', '--hc-content',
    '--hc-safe-top', '--hc-safe-bottom', '--hc-motion'
  ]) assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(css, /--hc-touch:\s*44px/);
});

test('canonical primitives define focus, tabular data and required async states', async () => {
  const css = await read('assets/css/components.css');
  for (const selector of ['.button', '.icon-button', '.input', '.select', '.dialog', '.drawer', '.tabs', '.badge', '.summary-table', '.list', '.kpi', '.ui-state']) {
    assert.ok(css.includes(selector), `missing primitive ${selector}`);
  }
  assert.match(css, /:focus-visible/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  for (const state of ['error', 'offline', 'stale', 'permission', 'loading']) {
    assert.ok(css.includes(`data-state="${state}"`), `missing state ${state}`);
  }
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media \(max-width:\s*430px\)/);
  assert.match(css, /max-width:\s*768px/);
});

test('style guide declares canonical ownership and required QA widths', async () => {
  const guide = await read('../../../../docs/hipico/STYLE_GUIDE.md');
  assert.match(guide, /única referencia vigente/i);
  assert.match(guide, /--hc-\*/);
  assert.match(guide, /360, 390, 430, 768, 1366 y 1920/);
  assert.match(guide, /PWA.*APK/i);
  assert.match(guide, /44 px/i);
  assert.match(guide, /reduced-motion/i);
});
