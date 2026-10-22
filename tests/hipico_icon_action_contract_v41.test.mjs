import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// v4.1.3 authority: generated platform tokens + v4 components + last-layer
// convergence. Never freeze obsolete v4.1.2 stylesheet locations or caches.
const read = (path) => readFileSync(join(process.cwd(), 'frontend/public/hipico-control', path), 'utf8');
const tokens = read('assets/css/platform-tokens-v1.css');
const css = read('assets/css/ui-system-v4.css');
const convergence = read('assets/css/ui-system-v4-convergence.css');
const entryCss = read('assets/css/app.css');
const shell = read('assets/js/shell-ui-v4.js');
const operationalCenter = read('assets/js/operational-copy-center.js');
const index = read('index.html');
const sw = read('sw.js');

test('approved desktop and touch scales come from the platform token authority', () => {
  assert.match(tokens, /--hc-v4-control-sm:\s*32px/);
  assert.match(tokens, /--hc-v4-control:\s*36px/);
  assert.match(tokens, /--hc-v4-control-primary:\s*38px/);
  assert.match(tokens, /--hc-v4-touch:\s*44px/);
  assert.match(css, /\.button\s*\{[^}]*min-height:\s*var\(--hc-v4-control\)/s);
  assert.match(css, /\.button--small\s*\{[^}]*min-height:\s*var\(--hc-v4-control-sm\)/s);
  assert.match(css, /\.button--primary\s*\{[^}]*min-height:\s*var\(--hc-v4-control-primary\)/s);
  assert.match(index, /rel="stylesheet" href="\.\/assets\/css\/platform-tokens-v1\.css"/);
});

test('canonical SVG icons are centered, including copy/WhatsApp floating controls', () => {
  assert.match(css, /\.v4-icon-button\s*\{[^}]*display:\s*inline-grid[^}]*place-items:\s*center/s);
  assert.match(css, /\.v4-icon-button svg\s*\{[^}]*margin:\s*auto/s);
  assert.match(css, /\.icon-button\s*\{[^}]*display:\s*inline-grid[^}]*place-items:\s*center/s);
  assert.match(convergence, /:where\(\.icon-button,[^}]*\.ops-launcher[^}]*\)\s*\{[^}]*place-items:\s*center/s);
  assert.match(convergence, /:where\(\.button,[^}]*\.ops-launcher[^}]*\)\s*svg\s*\{[^}]*width:\s*16px/s);
  assert.match(entryCss, /@import url\("\.\/ui-system-v4-convergence\.css"\)/);
});

test('coarse pointers retain >=44px targets and no animation on reduced motion', () => {
  assert.match(css, /@media \(pointer: coarse\)[\s\S]*?min-height:\s*var\(--hc-v4-touch\)/);
  assert.match(convergence, /@media \(pointer: coarse\)[\s\S]*?\.hc-help-trigger,[\s\S]*?\.ops-launcher,[\s\S]*?min-height:\s*var\(--hc-v4-touch\)/);
  assert.match(convergence, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition:\s*none !important/);
});

test('utility icons retain semantic accessible names and tooltips', () => {
  assert.match(shell, /aria-label="Cambiar tema"/);
  assert.match(shell, /aria-label="Abrir menú"/);
  assert.match(shell, /'Expandir barra lateral'/);
  assert.match(shell, /'Colapsar barra lateral'/);
  assert.match(shell, /control\.setAttribute\('aria-label', accessibleLabel\)/);
  assert.match(shell, /control\.setAttribute\('title', accessibleLabel\)/);
  assert.match(shell, /button\.setAttribute\('aria-label', label\)/);
  assert.match(shell, /button\.setAttribute\('title', label\)/);
});

test('global utilities invoke canonical Help Center without obsolete menu actions', () => {
  assert.match(shell, /data-v4-action="open-help"/);
  assert.match(shell, /document\.querySelector\('\[data-help-trigger\]'\)\?\.click\(\)/);
  assert.match(shell, /v4-utility-menu__label" role="presentation"/);
  assert.doesNotMatch(shell, /data-action="show-tips" role="menuitem"/);
});

test('theme stays device-local and synchronizes the enhanced select', () => {
  assert.match(shell, /select\.dataset\.presentationPreference = 'theme'/);
  assert.match(shell, /select\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
  assert.match(shell, /Preferencia de este dispositivo/);
  assert.match(shell, /select\.value = 'system'/);
});

test('important business actions keep text labels while utilities use icons', () => {
  assert.match(shell, /ACTION_ICONS/);
  assert.match(shell, /'copy-balances': 'copy'/);
  assert.match(shell, /'export-history': 'report'/);
  const iconMap = shell.slice(shell.indexOf('const ACTION_ICONS ='), shell.indexOf('const ICON_LABELS ='));
  assert.ok(iconMap.includes("'copy-balances': 'copy'"));
  assert.doesNotMatch(iconMap, /'focus-fast':\s*'[^']+'/);
  assert.doesNotMatch(iconMap, /'settle-race':\s*'[^']+'/);
  // The same action MUST retain its screen-reader label; it is not an icon.
  assert.match(shell, /'focus-fast': 'Captura rápida'/);
  assert.match(operationalCenter, /<span>Archivo del día \(\.txt\)<\/span>/);
});

test('floating Help and WhatsApp controls are separated on desktop and mobile', () => {
  assert.match(convergence, /body:has\(\.ops-root\[data-ops-authorized="true"\]\) \.hc-help-trigger\s*\{[^}]*bottom:\s*calc\(16px \+ var\(--hc-v4-control\) \+ 8px\)/s);
  assert.match(convergence, /\.ops-launcher\s*\{[^}]*bottom:\s*16px/s);
  assert.match(convergence, /@media \(max-width: 780px\)[\s\S]*?body:has\(\.ops-root\[data-ops-authorized="true"\]\) \.hc-help-trigger\s*\{[^}]*var\(--hc-v4-touch\) \+ 8px/s);
  assert.match(operationalCenter, /data-ops-open aria-label="Abrir textos operativos de WhatsApp"/);
});

test('operational copy controls use actual SVG icons and explicit consent controls', () => {
  assert.match(operationalCenter, /import \{ escapeHtml, icon \} from '\.\/ui\.js'/);
  for (const name of ['chat', 'close', 'report', 'back']) {
    assert.ok(operationalCenter.includes("icon('" + name + "')"), name);
  }
  assert.match(operationalCenter, /icon\(copied \? 'check' : 'copy'\)/);
  assert.match(operationalCenter, /data-ops-manual-consent/);
  assert.match(operationalCenter, /data-ops-manual-confirm/);
  assert.match(operationalCenter, /data-ops-manual-copy disabled/);
  assert.doesNotMatch(operationalCenter, /aria-hidden="true">⌄|>×<|>✦<|Copiado ✓/);
  assert.doesNotMatch(index, /icon-normalization-v41\.js/);
});

test('offline PWA rotates current v4.1.3 shell and never caches sensitive responses', () => {
  assert.match(sw, /shell-r38-consolidator-v4-1-3/);
  assert.match(sw, /key\.startsWith\('hipico-control-'\) && key !== SHELL_CACHE/);
  assert.match(sw, /isSensitive\(url\) \|\| isRuntimeMetadata\(url\)/);
  assert.match(sw, /fetch\(request, \{ cache: 'no-store' \}\)/);
  assert.match(sw, /command-center-shell\.js/);
  assert.doesNotMatch(sw, /icon-normalization-v41\.js/);
});
