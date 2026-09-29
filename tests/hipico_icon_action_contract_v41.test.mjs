import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => readFileSync(join(process.cwd(), path), 'utf8');
const css = read('frontend/public/hipico-control/assets/css/ui-system-v4.css');
const entryCss = read('frontend/public/hipico-control/assets/css/app.css');
const shell = read('frontend/public/hipico-control/assets/js/shell-ui-v4.js');
const iconNormalization = read('frontend/public/hipico-control/assets/js/icon-normalization-v41.js');
const index = read('frontend/public/hipico-control/index.html');
const sw = read('frontend/public/hipico-control/sw.js');

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
  assert.match(entryCss, /:where\(\.icon-button,[\s\S]*\.ops-launcher[\s\S]*place-items:\s*center/);
  assert.match(entryCss, /:where\(\.button,[\s\S]*\.ops-launcher[\s\S]*svg\s*\{[\s\S]*width:\s*16px/);
});

test('coarse pointers restore at least 44px interactive targets', () => {
  assert.match(css, /--hc-v4-touch:\s*44px/);
  assert.match(css, /@media \(pointer: coarse\)[\s\S]*min-height:\s*var\(--hc-v4-touch\)/);
  assert.match(entryCss, /@media \(pointer: coarse\)[\s\S]*\.hc-help-trigger[\s\S]*var\(--hc-v4-touch\)/);
  assert.match(entryCss, /@media \(pointer: coarse\)[\s\S]*\.ops-launcher[\s\S]*var\(--hc-v4-touch\)/);
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

test('help and WhatsApp floating utilities cannot occupy the same coordinates', () => {
  assert.match(entryCss, /body:has\(\.ops-root\[data-ops-authorized="true"\]\) \.hc-help-trigger\s*\{[^}]*bottom:\s*calc\(16px \+ var\(--hc-v4-control\) \+ 8px\)/s);
  assert.match(entryCss, /\.ops-launcher\s*\{[^}]*bottom:\s*16px/s);
  assert.match(entryCss, /@media \(max-width: 780px\)[\s\S]*body:has\(\.ops-root\[data-ops-authorized="true"\]\) \.hc-help-trigger[\s\S]*var\(--hc-v4-touch\) \+ 8px/);
});

test('operational copy center uses the canonical svg registry instead of ad-hoc glyph icons', () => {
  assert.match(iconNormalization, /import \{ icon \} from '\.\/ui\.js'/);
  assert.match(iconNormalization, /icon\('chat'\)/);
  assert.match(iconNormalization, /icon\('close'\)/);
  assert.match(iconNormalization, /copied \? 'check' : 'copy'/);
  assert.match(iconNormalization, /icon\('back'\)/);
  assert.match(index, /icon-normalization-v41\.js/);
});

test('PWA rotates cache and ships the icon normalization module with the shell', () => {
  assert.match(sw, /shell-r32-icon-overlap-normalized/);
  assert.match(sw, /icon-normalization-v41\.js/);
});
