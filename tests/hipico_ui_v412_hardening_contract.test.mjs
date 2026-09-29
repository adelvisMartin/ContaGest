import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => readFileSync(join(process.cwd(), path), 'utf8');
const operations = read('frontend/public/hipico-control/assets/js/operational-copy-center.js');
const index = read('frontend/public/hipico-control/index.html');
const sw = read('frontend/public/hipico-control/sw.js');
const appCss = read('frontend/public/hipico-control/assets/css/app.css');
const overlaysCss = read('frontend/public/hipico-control/assets/css/ui-system-v4-overlays.css');
const visualSpec = read('qa/hipico-ui-v41-shell.spec.mjs');
const workflow = read('.github/workflows/hipico-operations.yml');

test('operational copy center renders canonical SVG icons at the source', () => {
  assert.match(operations, /import \{ icon \} from '\.\/ui\.js'/);
  assert.match(operations, /icon\('chat'\)/);
  assert.match(operations, /icon\('close'\)/);
  assert.match(operations, /icon\(copied \? 'check' : 'copy'\)/);
  assert.match(operations, /icon\('back'\)/);
  assert.doesNotMatch(operations, />\s*[×⌄✦]\s*</u);
  assert.doesNotMatch(operations, /Copiado\s*✓/u);
});

test('post-render icon mutation shim is removed from runtime and offline shell', () => {
  assert.doesNotMatch(index, /icon-normalization-v41\.js/);
  assert.doesNotMatch(sw, /icon-normalization-v41\.js/);
  assert.match(sw, /shell-r33-ui-v4-1-2-hardening/);
  assert.match(sw, /ui-system-v4-overlays\.css/);
  assert.doesNotMatch(workflow, /node --check frontend\/public\/hipico-control\/assets\/js\/icon-normalization-v41\.js/);
});

test('compatibility CSS is explicitly lower-precedence than v4 authority', () => {
  assert.match(appCss, /@layer\s+compat,\s*v4,\s*convergence/);
  assert.match(appCss, /@import\s+url\("\.\/ui-system-v3-compat\.css"\)\s+layer\(compat\)/);
  assert.match(appCss, /@import\s+url\("\.\/ui-system-v4\.css"\)\s+layer\(v4\)/);
  assert.match(appCss, /@import\s+url\("\.\/ui-system-v4-overlays\.css"\)\s+layer\(v4\)/);
});

test('modal and toast surfaces use v4 semantic tokens rather than a parallel React toaster', () => {
  assert.match(overlaysCss, /\.modal-backdrop/);
  assert.match(overlaysCss, /\.modal\s*[,\{]/);
  assert.match(overlaysCss, /\.toast\s*\{/);
  assert.match(overlaysCss, /backdrop-filter:\s*blur/);
  assert.match(overlaysCss, /var\(--hc-surface\)/);
  assert.match(overlaysCss, /var\(--hc-shadow-md\)/);
});

test('Playwright representative visual gate uses pixel comparison, not byte-length evidence only', () => {
  assert.match(visualSpec, /toHaveScreenshot\(/);
  assert.doesNotMatch(visualSpec, /must produce non-empty exact-SHA visual evidence/);
});
