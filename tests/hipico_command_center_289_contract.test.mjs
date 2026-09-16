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

void test('theme bootstrap runs before canonical app.css and workspace remains runtime authority', () => {
  const index = read('frontend/public/hipico-control/index.html');
  const bootstrap = read('frontend/public/hipico-control/assets/js/theme-bootstrap.js');
  const app = read('frontend/public/hipico-control/assets/js/app.js');
  const bootstrapPosition = index.indexOf('./assets/js/theme-bootstrap.js');
  const firstStylePosition = index.indexOf('./assets/css/app.css');
  assert.ok(bootstrapPosition >= 0 && firstStylePosition >= 0 && bootstrapPosition < firstStylePosition);
  assert.match(bootstrap, /new Set\(\['system', 'light', 'dark'\]\)/);
  assert.match(bootstrap, /hipico-control-theme/);
  assert.match(app, /workspace\?\.config\?\.theme \|\| ['"]system['"]/);
  assert.match(app, /document\.documentElement\.dataset\.theme = theme/);
});

void test('Command Center public boundary uses only local groupKey and never accepts or exposes SOURCE identity', () => {
  const shell = read('frontend/public/hipico-control/assets/js/command-center-shell.js');
  const renderer = read('frontend/public/hipico-control/assets/js/command-center.js');
  const bff = read('frontend/api/hipico/command-center.js');
  const route = read('backend/src/modules/hipico/command-center.routes.ts');

  assert.match(shell, /data-action=["']select-group["']/);
  assert.match(shell, /data-id/);
  assert.match(shell, /\^\[A-Za-z0-9\._:-\]\{3,120\}\$/);
  assert.doesNotMatch(shell, /workspace\b/);
  for (const source of [shell, renderer, bff]) {
    assert.doesNotMatch(source, /groupId\b/);
    assert.doesNotMatch(source, /jid\b/i);
    assert.doesNotMatch(source, /@g\.us/i);
  }
  assert.doesNotMatch(route, /req\.query\.groupId/);
  assert.doesNotMatch(route, /groupIdSchema/);
  assert.match(bff, /x-hipico-group-key/);
});

void test('Command Center renders fail-closed observable states and SOURCE/LAB safety semantics', () => {
  const commandCenter = read('frontend/public/hipico-control/assets/js/command-center.js');
  const backend = read('backend/src/modules/hipico/command-center.service.ts');
  const backendBehavior = read('backend/src/modules/hipico/command-center.service.test.ts');
  for (const state of ['idle', 'loading', 'success', 'error', 'offline']) {
    assert.ok(commandCenter.includes(`'${state}'`) || commandCenter.includes(`\"${state}\"`), `missing ${state} state`);
  }
  assert.match(commandCenter, /stale/);
  assert.match(commandCenter, /No disponible/);

  // The v8 core decomposition deliberately generates read-failure codes from a
  // single fail-closed table. Validate that mechanism instead of requiring dead
  // QUEUE_READ_UNAVAILABLE / DOCUMENT_READ_UNAVAILABLE literals in production.
  assert.match(backend, /const failedReads:/);
  assert.match(backend, /\['DOCUMENT',\s*documentsRead\s+as\s+any,/);
  assert.match(backend, /\['QUEUE',\s*queueRead\s+as\s+any,/);
  assert.match(backend, /code:\s*`\$\{code\}_READ_UNAVAILABLE`/);
  assert.match(backendBehavior, /queueStates:[\s\S]*throw new Error\(['"]queue unavailable['"]\)/);
  assert.match(backendBehavior, /documentStates:[\s\S]*throw new Error\(['"]documents unavailable['"]\)/);
  assert.match(backendBehavior, /alert\.code === ['"]QUEUE_READ_UNAVAILABLE['"]/);
  assert.match(backendBehavior, /alert\.code === ['"]DOCUMENT_READ_UNAVAILABLE['"]/);

  assert.match(backend, /pending: queuePending/);
  assert.match(backend, /failed: queueFailed/);
  assert.match(commandCenter, /SOURCE/);
  assert.match(commandCenter, /solo lectura/i);
  assert.match(commandCenter, /LAB/);
});

void test('PWA shell caches complete Command Center runtime without caching API responses', () => {
  const sw = read('frontend/public/hipico-control/sw.js');
  for (const asset of ['theme-bootstrap.js', 'command-center.js', 'command-center-shell.js']) {
    assert.ok(sw.includes(`./assets/js/${asset}`), `service worker must cache ${asset}`);
  }
  assert.match(sw, /function isSensitive/);
  assert.ok(sw.includes('(?:api|auth)'));
  assert.match(sw, /function isRuntimeMetadata/);
  assert.match(sw, /cache: 'no-store'/);
});

void test('design system documents #289 accessibility, responsive, theme and channel contracts', () => {
  const guide = read('frontend/public/hipico-control/STYLE-GUIDE.md');
  for (const token of ['360', '390/393', '430', '768', '1440', '200%', 'system', 'light', 'dark', 'SOURCE', 'LAB']) {
    assert.ok(guide.includes(token), `style guide missing ${token}`);
  }
  assert.match(guide, /teclado/i);
  assert.match(guide, /focus/i);
  assert.match(guide, /reduced[- ]motion/i);
  assert.match(guide, /WCAG AA/i);
  assert.match(guide, /loading/i);
  assert.match(guide, /unavailable/i);
});

void test('Android parity gate requires Command Center runtime and hashes complete PWA', () => {
  const sync = read('android/hipico-control-v1130/scripts/sync-web.mjs');
  for (const asset of ['assets/js/theme-bootstrap.js', 'assets/js/command-center.js', 'assets/js/command-center-shell.js']) {
    assert.ok(sync.includes(`'${asset}'`), `Android parity gate missing ${asset}`);
  }
  assert.match(sync, /sourceHash !== targetHash/);
  assert.match(sync, /filesUnder\(root\)/);
});

void test('Command Center preserves UI System v2 single-CSS authority', () => {
  const cssDirectory = path.join(pwa, 'assets/css');
  const css = fs.readdirSync(cssDirectory).filter((file) => file.endsWith('.css')).sort();
  assert.deepEqual(css, ['app.css']);
  const index = read('frontend/public/hipico-control/index.html');
  assert.equal((index.match(/rel="stylesheet"/g) || []).length, 1);
  assert.match(index, /\.\/assets\/css\/app\.css/);
});