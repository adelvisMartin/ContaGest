import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => readFileSync(join(process.cwd(), path), 'utf8');
const css = read('frontend/public/hipico-control/assets/css/ui-system-v4.css');
const entryCss = read('frontend/public/hipico-control/assets/css/app.css');
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
  assert.match(entryCss, /\.hc-help-trigger\s*\{[^}]*display:\s*inline-grid[^}]*place-items:\s*center/s);
});

test('coarse pointers restore at least 44px interactive targets', () => {
  assert.match(css, /--hc-v4-touch:\s*44px/);
  assert.match(css, /@media \(pointer: coarse\)[\s\S]*min-height:\s*var\(--hc-v4-touch\)/);
  assert.match(entryCss, /@media \(pointer: coarse\)[\s\S]*\.hc-help-trigger[\s\S]*var\(--hc-v4-touch\)/);
});

test('v4 utility icon buttons always declare accessible labels and titles', () => {
  assert.match(shell, /aria-label="Cambiar tema"/);
  assert.match(shell, /aria-label="Abrir menú"/);
  assert.match(shell, /'Expandir barra lateral'/);
  assert.match(shell, /'Colapsar barra lateral'/);
  assert.match(shell, /control\.setAttribute\('aria-label', accessibleLabel\)/);
  assert.match(shell, /control\.setAttribute\('title', accessibleLabel\)/);
  assert.match(shell, /button\.setAttribute\('aria-label', label\)/);
  assert.match(shell, /button\.setAttribute\('title', label\)/);
});

test('global utility menu uses canonical help center and valid menu presentation semantics', () => {
  assert.match(shell, /data-v4-action="open-help"/);
  assert.match(shell, /document\.querySelector\('\[data-help-trigger\]'\)\?\.click\(\)/);
  assert.match(shell, /v4-utility-menu__label" role="presentation"/);
  assert.doesNotMatch(shell, /data-action="show-tips" role="menuitem"/);
});

test('settings theme stays a device preference and synchronizes enhanced native select state', () => {
  assert.match(shell, /select\.dataset\.presentationPreference = 'theme'/);
  assert.match(shell, /select\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
  assert.match(shell, /Preferencia de este dispositivo/);
  assert.match(shell, /select\.value = 'system'/);
});

test('business-primary actions remain text-labelled while utility actions gain icons', () => {
  assert.match(shell, /ACTION_ICONS/);
  assert.match(shell, /'copy-balances': 'copy'/);
  assert.match(shell, /'export-history': 'report'/);
  assert.doesNotMatch(shell, /'focus-fast':\s*'[^']+'/);
  assert.doesNotMatch(shell, /'settle-race':\s*'[^']+'/);
});
