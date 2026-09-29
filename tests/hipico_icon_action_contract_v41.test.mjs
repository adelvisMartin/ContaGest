import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => readFileSync(join(process.cwd(), path), 'utf8');
const css = read('frontend/public/hipico-control/assets/css/ui-system-v4.css');
const shell = read('frontend/public/hipico-control/assets/js/shell-ui-v4.js');

test('desktop controls use the approved compact 32 36 38 scale', () => {
  assert.match(css, /--hc-v4-control-sm:\s*32px/);
  assert.match(css, /--hc-v4-control:\s*36px/);
  assert.match(css, /--hc-v4-control-primary:\s*38px/);
  assert.match(css, /\.button\s*\{[^}]*min-height:\s*var\(--hc-v4-control\)/s);
  assert.match(css, /\.button--small\s*\{[^}]*min-height:\s*var\(--hc-v4-control-sm\)/s);
  assert.match(css, /\.button--primary\s*\{[^}]*min-height:\s*var\(--hc-v4-control-primary\)/s);
});

test('icon-only controls center the canonical svg in both axes', () => {
  assert.match(css, /\.v4-icon-button\s*\{[^}]*display:\s*inline-grid[^}]*place-items:\s*center/s);
  assert.match(css, /\.v4-icon-button svg\s*\{[^}]*margin:\s*auto/s);
  assert.match(css, /\.icon-button\s*\{[^}]*display:\s*inline-grid[^}]*place-items:\s*center/s);
});

test('coarse pointers restore at least 44px interactive targets', () => {
  assert.match(css, /--hc-v4-touch:\s*44px/);
  assert.match(css, /@media \(pointer: coarse\)[\s\S]*min-height:\s*var\(--hc-v4-touch\)/);
});

test('v4 utility icon buttons always declare accessible labels', () => {
  for (const label of ['Cambiar tema', 'Abrir menú', 'Colapsar barra lateral', 'Expandir barra lateral']) {
    assert.match(shell, new RegExp(`aria-label=\\"[^\\"]*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\"]*\\"|aria-label=\\"\\$\\{collapsed \\? '[^']*' : '[^']*'\\}\\"`));
  }
  assert.match(shell, /setAttribute\('aria-label', label\)/);
  assert.match(shell, /setAttribute\('title', label\)/);
});

test('business-primary actions remain text-labelled while utility actions gain icons', () => {
  assert.match(shell, /ACTION_ICONS/);
  assert.match(shell, /'copy-balances': 'copy'/);
  assert.match(shell, /'export-history': 'report'/);
  assert.doesNotMatch(shell, /'focus-fast':\s*'[^']+'/);
  assert.doesNotMatch(shell, /'settle-race':\s*'[^']+'/);
});
