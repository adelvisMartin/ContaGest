import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => readFileSync(join(process.cwd(), path), 'utf8');
const appCss = read('frontend/public/hipico-control/assets/css/app.css');
// The app entrypoint owns import order; material styling lives in its imports.
const visualCss = [
  'ui-system-v3-compat.css', 'ui-system-v4.css', 'ui-system-v4-convergence.css'
].map(name => read('frontend/public/hipico-control/assets/css/' + name)).join('\n');
const ui = read('frontend/public/hipico-control/assets/js/ui.js');
const playwright = read('qa/hipico-ui-v41-shell.spec.mjs');
const docs = read('docs/hipico/UI_SYSTEM_V4_1_2_HARDENING.md');

test('legacy v3 compatibility CSS is quarantined in a lower-priority cascade layer', () => {
  assert.match(appCss, /@layer\s+legacy/);
  assert.match(appCss, /@import\s+url\("\.\/ui-system-v3-compat\.css"\)\s+layer\(legacy\)/);
  assert.match(appCss, /@import\s+url\("\.\/ui-system-v4\.css"\)\s*;/);
  assert.doesNotMatch(appCss, /ui-system-v4\.css"\)\s+layer\(legacy\)/);
});

test('modal and toast surfaces use one canonical polished presentation authority', () => {
  assert.match(ui, /item\.className\s*=\s*`toast toast--\$\{normalizedType\}`/);
  assert.match(ui, /item\.setAttribute\('role',\s*normalizedType === 'error' \? 'alert' : 'status'\)/);
  assert.match(ui, /data-modal-dialog/);
  assert.match(visualCss, /\.modal-backdrop[\s\S]*backdrop-filter:\s*blur/);
  assert.match(visualCss, /\.modal,[\s\S]*\.ops-dialog__shell[\s\S]*box-shadow:/);
  assert.match(visualCss, /\.toast[\s\S]*box-shadow:/);
  assert.match(visualCss, /\.toast--success/);
  assert.match(visualCss, /\.toast--error/);
  assert.match(visualCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test('visual regression suite contains real Playwright screenshot comparison assertions', () => {
  assert.match(playwright, /toHaveScreenshot\(/);
  assert.doesNotMatch(playwright, /byteLength[^\n]*toBeGreaterThan\(10_000\)/);
});

test('hardening release note documents architecture, migration, QA and rollback', () => {
  assert.match(docs, /Clean Code/i);
  assert.match(docs, /cascade layer/i);
  assert.match(docs, /modal/i);
  assert.match(docs, /Playwright/i);
  assert.match(docs, /WhatsApp/i);
  assert.match(docs, /rollback/i);
});
