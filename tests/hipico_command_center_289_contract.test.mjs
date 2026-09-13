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

void test('Command Center shell uses only the public local group key boundary and never exposes SOURCE identity', () => {
  const shell = read('frontend/public/hipico-control/assets/js/command-center-shell.js');

  assert.match(shell, /data-action=["']select-group["']/);
  assert.match(shell, /data-id/);
  assert.match(shell, /\^\[A-Za-z0-9\._:-\]\{3,120\}\$/);
  assert.doesNotMatch(shell, /workspace\b/);
  assert.doesNotMatch(shell, /groupId\b/);
  assert.doesNotMatch(shell, /jid\b/i);
  assert.doesNotMatch(shell, /@g\.us/i);
});

void test('Command Center renders fail-closed observable states and SOURCE/LAB safety semantics', () => {
  const commandCenter = read('frontend/public/hipico-control/assets/js/command-center.js');

  for (const state of ['idle', 'loading', 'success', 'error', 'offline']) {
    assert.ok(commandCenter.includes(`'${state}'`) || commandCenter.includes(`\"${state}\"`), `missing ${state} state`);
  }
  assert.match(commandCenter, /stale/);
  assert.match(commandCenter, /No disponible/);
  assert.match(commandCenter, /QUEUE_READ_UNAVAILABLE/);
  assert.match(commandCenter, /DOCUMENT_READ_UNAVAILABLE/);
  assert.match(commandCenter, /SOURCE/);
  assert.match(commandCenter, /solo lectura/i);
  assert.match(commandCenter, /LAB/);
});

void test('PWA shell caches the complete Command Center runtime without caching API responses', () => {
  const sw = read('frontend/public/hipico-control/sw.js');
  for (const asset of ['theme-bootstrap.js', 'command-center.js', 'command-center-shell.js']) {
    assert.ok(sw.includes(`./assets/js/${asset}`), `service worker must cache ${asset}`);
  }
  assert.match(sw, /\/(?:api\|auth)/);
  assert.match(sw, /cache: 'no-store'/);
});

void test('design system documents the #289 accessibility, responsive, theme, and channel contracts', () => {
  const guide = read('frontend/public/hipico-control/STYLE-GUIDE.md');

  for (const token of ['360', '390', '430', '768', '1440', '200%', 'system', 'light', 'dark', 'SOURCE', 'LAB']) {
    assert.ok(guide.includes(token), `style guide missing ${token}`);
  }
  assert.match(guide, /teclado/i);
  assert.match(guide, /focus/i);
  assert.match(guide, /reduced[- ]motion/i);
  assert.match(guide, /WCAG AA/i);
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

void test('no parallel global stylesheet is introduced for Command Center', () => {
  const cssDirectory = path.join(pwa, 'assets/css');
  const css = fs.readdirSync(cssDirectory).filter((file) => file.endsWith('.css')).sort();
  assert.deepEqual(css, [
    'app.css',
    'mobile-accessibility.css',
    'operational-access-guard.css',
    'operational-copy-center.css'
  ]);
});
