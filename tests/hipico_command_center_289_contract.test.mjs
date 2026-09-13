import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const pwa = path.join(repo, 'frontend/public/hipico-control');

function read(relative) {
  return fs.readFileSync(path.join(repo, relative), 'utf8');
}

void test('theme bootstrap runs before canonical styles and workspace remains runtime authority', () => {
  const index = read('frontend/public/hipico-control/index.html');
  const bootstrap = read('frontend/public/hipico-control/assets/js/theme-bootstrap.js');
  const app = read('frontend/public/hipico-control/assets/js/app.js');

  const bootstrapPosition = index.indexOf('./assets/js/theme-bootstrap.js');
  const firstStylePosition = index.indexOf('./assets/css/app.css');
  assert.ok(bootstrapPosition >= 0, 'index must load theme-bootstrap.js');
  assert.ok(firstStylePosition >= 0, 'index must load app.css');
  assert.ok(bootstrapPosition < firstStylePosition, 'theme bootstrap must execute before CSS to avoid a theme flash');
  assert.match(bootstrap, /new Set\(\['system', 'light', 'dark'\]\)/);
  assert.match(bootstrap, /hipico-control-theme/);
  assert.match(app, /workspace\?\.config\?\.theme \|\| ['"]system['"]/);
  assert.match(app, /document\.documentElement\.dataset\.theme = theme/);
});

void test('Command Center public boundary uses only local groupKey and never exposes SOURCE identity', () => {
  const shell = read('frontend/public/hipico-control/assets/js/command-center-shell.js');
  const renderer = read('frontend/public/hipico-control/assets/js/command-center.js');
  const bff = read('frontend/api/hipico/command-center.js');
  const route = read('backend/src/modules/hipico/command-center.routes.ts');

  assert.match(shell, /data-action=["']select-group["']/);
  assert.match(shell, /data-id/);
  assert.match(shell, /\^\[A-Za-z0-9\._:-\]\{3,120\}\$/);
  for (const source of [shell, renderer, bff]) {
    assert.doesNotMatch(source, /groupId\b/);
    assert.doesNotMatch(source, /jid\b/i);
    assert.doesNotMatch(source, /@g\.us/i);
  }
  assert.doesNotMatch(route, /req\.query\.groupId/);
  assert.doesNotMatch(route, /groupIdSchema/);
  assert.match(bff, /x-hipico-group-key/);
});

void test('Command Center renders complete fail-closed observable state model and SOURCE/LAB safety semantics', () => {
  const commandCenter = read('frontend/public/hipico-control/assets/js/command-center.js');
  const backend = read('backend/src/modules/hipico/command-center.service.ts');

  for (const state of ['idle', 'loading', 'success', 'empty', 'error', 'offline', 'stale', 'disabled']) {
    assert.ok(commandCenter.includes(`'${state}'`) || commandCenter.includes(`\"${state}\"`), `missing ${state} state`);
  }
  for (const state of ['unavailable', 'not_configured', 'degraded']) assert.match(commandCenter, new RegExp(state));
  assert.match(commandCenter, /aria-busy/);
  assert.match(commandCenter, /role="status"/);
  assert.match(commandCenter, /aria-live="polite"/);
  assert.match(commandCenter, /No disponible/);
  assert.match(commandCenter, /Sin datos operativos/);
  assert.match(commandCenter, /Actualización pausada/);
  assert.match(backend, /QUEUE_READ_UNAVAILABLE/);
  assert.match(backend, /DOCUMENT_READ_UNAVAILABLE/);
  assert.match(backend, /pending: queuePending/);
  assert.match(backend, /failed: queueFailed/);
  assert.match(commandCenter, /SOURCE/);
  assert.match(commandCenter, /solo lectura/i);
  assert.match(commandCenter, /LAB/);
});

void test('PWA shell caches static Command Center runtime but forces live APIs network-only/no-store', () => {
  const sw = read('frontend/public/hipico-control/sw.js');
  for (const asset of ['theme-bootstrap.js', 'command-center.js', 'command-center-shell.js']) {
    assert.ok(sw.includes(`./assets/js/${asset}`), `service worker must cache ${asset}`);
  }
  assert.match(sw, /function isSensitive/);
  assert.match(sw, /function isLiveHipicoApi/);
  assert.match(sw, /\/api\/hipico\/command-center/);
  assert.match(sw, /\/api\/v1\/hipico\//);
  assert.match(sw, /cache: 'no-store'/);
  assert.match(sw, /isSensitive\(url\) \|\| isLiveHipicoApi\(url\)/);
});

void test('canonical design system document covers #289 components, accessibility, responsive, theme and motion contracts', () => {
  const design = read('docs/hipico/design-system.md');
  const guide = read('frontend/public/hipico-control/STYLE-GUIDE.md');

  for (const token of [
    'color', 'tipografía', 'spacing', 'radius', 'shadows', 'iconos', 'botones', 'formularios',
    'tablas', 'dialogs', 'status', 'cards', 'navegación', 'responsive', 'system', 'light', 'dark',
    '360', '390', '430', '768', '1024', '1440', '200%', '44px', 'WCAG 2.2 AA', 'reduced motion', 'SOURCE', 'LAB'
  ]) assert.match(design.toLowerCase(), new RegExp(token.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(guide, /docs\/hipico\/design-system\.md/);
  assert.match(guide, /loading/i);
  assert.match(guide, /unavailable/i);
});

void test('Android parity gate requires every Command Center runtime asset and hashes the complete PWA', () => {
  const sync = read('android/hipico-control-v1130/scripts/sync-web.mjs');
  for (const asset of [
    'assets/js/theme-bootstrap.js',
    'assets/js/command-center.js',
    'assets/js/command-center-shell.js'
  ]) {
    assert.ok(sync.includes(`'${asset}'`), `Android parity gate missing ${asset}`);
  }
  assert.match(sync, /sourceHash !== targetHash/);
  assert.match(sync, /filesUnder\(root\)/);
});

void test('browser and exact-SHA gates are wired without creating a parallel stylesheet', () => {
  const pkg = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/hipico-command-center-v289.yml');
  const browser = read('qa/hipico-command-center-v289.spec.mjs');
  assert.equal(pkg.scripts['test:browser:hipico:command-center'], 'playwright test qa/hipico-command-center-v289.spec.mjs');
  assert.match(workflow, /HIPICO_CANDIDATE_SHA/);
  assert.match(workflow, /hipico-exact-sha-gate\.mjs/);
  assert.match(workflow, /test:browser:hipico:command-center/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  for (const width of ['360', '390', '430', '768', '1440']) assert.ok(browser.includes(width), `browser matrix missing ${width}`);
  assert.match(browser, /200 percent zoom/i);
  assert.match(browser, /prefers-reduced-motion/);

  const cssDirectory = path.join(pwa, 'assets/css');
  const css = fs.readdirSync(cssDirectory).filter((file) => file.endsWith('.css')).sort();
  assert.deepEqual(css, [
    'app.css',
    'mobile-accessibility.css',
    'operational-access-guard.css',
    'operational-copy-center.css'
  ]);
});
