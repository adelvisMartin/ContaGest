import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const indexHtml = read('frontend/public/hipico-control/index.html');
const appCss = read('frontend/public/hipico-control/assets/css/app.css');
const platformTokens = read('frontend/public/hipico-control/assets/css/platform-tokens-v1.css');
const compatCss = read('frontend/public/hipico-control/assets/css/ui-system-v3-compat.css');
const shellCss = read('frontend/public/hipico-control/assets/css/ui-system-v4.css');
const shellJs = read('frontend/public/hipico-control/assets/js/shell-ui-v4.js');
const prefs = read('frontend/public/hipico-control/assets/js/presentation-preferences.js');
const sw = read('frontend/public/hipico-control/sw.js');

test('app.css is the single production component-style entrypoint', () => {
  assert.match(indexHtml, /assets\/css\/app\.css/);
  assert.match(indexHtml, /assets\/css\/platform-tokens-v1\.css/);
  assert.doesNotMatch(indexHtml, /ui-system-v4\.css/);
  assert.doesNotMatch(indexHtml, /ui-system-v3-compat\.css/);
  assert.match(appCss, /@import url\("\.\/ui-system-v3-compat\.css"\)/);
  assert.match(appCss, /@import url\("\.\/ui-system-v4\.css"\)/);
  assert.ok(appCss.indexOf('ui-system-v3-compat.css') < appCss.indexOf('ui-system-v4.css'), 'v3 compatibility must load before v4 authority');
  assert.match(platformTokens, /Generated from frontend\/src\/design-system\/semanticTokens\.v1\.js/);
});

test('v4.1 presentation modules are wired into the production shell', () => {
  assert.match(indexHtml, /presentation-preferences\.js/);
  assert.match(indexHtml, /shell-ui-v4\.js/);
});

test('legacy wordmark is not rendered by the boot shell or cached as shell authority', () => {
  assert.doesNotMatch(indexHtml, /logo-control-hipico\.png/);
  assert.doesNotMatch(sw, /logo-control-hipico\.png/);
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
  assert.match(prefs, /new Set\(\['system', 'light', 'dark'\]\)/);
  assert.match(prefs, /getThemePreference/);
  assert.match(prefs, /setThemePreference/);
  assert.match(prefs, /migrateLegacyTheme/);
  assert.match(shellJs, /cycle-theme/);
  assert.match(shellJs, /data\.presentationPreference = 'theme'/);
  assert.match(shellJs, /Preferencia de este dispositivo/);
  assert.match(shellJs, /select\.value = 'system'/);
});

test('global utilities expose settings, help and accessible icon controls', () => {
  assert.match(shellJs, /global-utility-nav/);
  assert.match(shellJs, /aria-label="Cambiar tema"/);
  assert.match(shellJs, /aria-label="Abrir menú"/);
  assert.match(shellJs, /Configuración/);
  assert.match(shellJs, /Ayuda/);
});

test('service worker rotates beyond r30 and caches the complete v4.1 css dependency graph', () => {
  assert.doesNotMatch(sw, /shell-r29-auto-update-reload/);
  assert.doesNotMatch(sw, /shell-r30-ui-system-v4-1`/);
  assert.match(sw, /shell-r31-ui-system-v4-1-tokens/);
  assert.match(sw, /platform-tokens-v1\.css/);
  assert.match(sw, /ui-system-v3-compat\.css/);
  assert.match(sw, /ui-system-v4\.css/);
  assert.match(sw, /presentation-preferences\.js/);
  assert.match(sw, /shell-ui-v4\.js/);
});

test('legacy v3 is compatibility only and v4.1 is the declared visual authority', () => {
  assert.match(compatCss, /canonical UI System v3/);
  assert.match(shellCss, /canonical UI System v4\.1/);
  assert.match(shellCss, /V4 AUTHORITY/);
});
