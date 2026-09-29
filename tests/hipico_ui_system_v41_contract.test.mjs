import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const indexHtml = read('frontend/public/hipico-control/index.html');
const appCss = read('frontend/public/hipico-control/assets/css/app.css');
const shellCssPath = 'frontend/public/hipico-control/assets/css/ui-system-v4.css';
const shellJsPath = 'frontend/public/hipico-control/assets/js/shell-ui-v4.js';
const prefsPath = 'frontend/public/hipico-control/assets/js/presentation-preferences.js';
const sw = read('frontend/public/hipico-control/sw.js');

function maybeRead(path) {
  try { return read(path); } catch { return ''; }
}

const shellCss = maybeRead(shellCssPath);
const shellJs = maybeRead(shellJsPath);
const prefs = maybeRead(prefsPath);

test('v4.1 presentation modules are wired into the production shell', () => {
  assert.match(indexHtml, /ui-system-v4\.css/);
  assert.match(indexHtml, /presentation-preferences\.js/);
  assert.match(indexHtml, /shell-ui-v4\.js/);
});

test('legacy wordmark is not rendered by the boot shell and is actively replaced at runtime', () => {
  assert.doesNotMatch(indexHtml, /logo-control-hipico\.png/);
  assert.match(indexHtml, /hc-brand-lockup/);
  assert.match(shellJs, /replaceLegacyBranding/);
  assert.match(shellJs, /logo-control-hipico\.png/);
});

test('v4.1 tokens define compact typography, density and equestrian palette', () => {
  assert.match(shellCss, /--hc-v4-bg:\s*#F4F5F2/i);
  assert.match(shellCss, /--hc-v4-brand:\s*#235C45/i);
  assert.match(shellCss, /--hc-v4-dark-bg:\s*#0B0E0C/i);
  assert.match(shellCss, /--hc-v4-control:\s*36px/);
  assert.match(shellCss, /--hc-v4-control-sm:\s*32px/);
  assert.match(shellCss, /font-variant-numeric:\s*tabular-nums/);
  assert.doesNotMatch(shellCss, /button\s*,\s*input\s*,\s*select\s*,\s*textarea\s*\{[^}]*font-size:\s*1rem/s);
});

test('all desktop views use the available main width and sidebar has collapsed state', () => {
  assert.match(shellCss, /\.content\s*\{[^}]*width:\s*100%/s);
  assert.match(shellCss, /max-width:\s*none/);
  assert.match(shellCss, /--hc-v4-sidebar:\s*224px/);
  assert.match(shellCss, /--hc-v4-sidebar-collapsed:\s*66px/);
  assert.match(shellCss, /\.shell\.is-sidebar-collapsed/);
  assert.match(shellJs, /toggle-sidebar/);
});

test('theme preference has a single device-local authority', () => {
  assert.match(prefs, /hipico-control-theme/);
  assert.match(prefs, /system/);
  assert.match(prefs, /light/);
  assert.match(prefs, /dark/);
  assert.match(prefs, /getThemePreference/);
  assert.match(prefs, /setThemePreference/);
  assert.match(prefs, /migrateLegacyTheme/);
  assert.match(shellJs, /cycle-theme/);
});

test('global utilities expose settings, help and accessible icon controls', () => {
  assert.match(shellJs, /global-utility-nav/);
  assert.match(shellJs, /aria-label="Cambiar tema"/);
  assert.match(shellJs, /aria-label="Abrir menú"/);
  assert.match(shellJs, /Configuración/);
  assert.match(shellJs, /Ayuda/);
});

test('service worker rotates beyond r29 and caches v4 shell assets', () => {
  assert.doesNotMatch(sw, /shell-r29-auto-update-reload/);
  assert.match(sw, /ui-system-v4\.css/);
  assert.match(sw, /presentation-preferences\.js/);
  assert.match(sw, /shell-ui-v4\.js/);
});

test('legacy v3 css remains a base only and v4 is the declared visual authority', () => {
  assert.match(appCss, /canonical UI System v3/);
  assert.match(shellCss, /canonical UI System v4\.1/);
  assert.match(shellCss, /V4 AUTHORITY/);
});
