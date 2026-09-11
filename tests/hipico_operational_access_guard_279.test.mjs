import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canUseOperationalCenter } from '../frontend/public/hipico-control/assets/js/operational-access-policy.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const guardSource = await read('../frontend/public/hipico-control/assets/js/operational-access-guard.js');
const indexSource = await read('../frontend/public/hipico-control/index.html');
const cssSource = await read('../frontend/public/hipico-control/assets/css/operational-access-guard.css');
const serviceWorkerSource = await read('../frontend/public/hipico-control/sw.js');

test('operational center fails closed without an authenticated application shell', () => {
  assert.equal(canUseOperationalCenter({ mode: null, hasShell: false }), false);
  assert.equal(canUseOperationalCenter({ mode: 'cloud', hasShell: false, cloudRole: 'admin' }), false);
  assert.equal(canUseOperationalCenter({ mode: 'local', hasShell: false }), false);
  assert.equal(canUseOperationalCenter({ mode: 'cloud', hasShell: true, cloudRole: '' }), false);
  assert.equal(canUseOperationalCenter({ mode: 'cloud', hasShell: true, cloudRole: 'unknown' }), false);
  assert.equal(canUseOperationalCenter({ mode: 'cloud', hasShell: true, cloudRole: 'admin', blocked: true }), false);
});

test('authorized local and supported cloud roles can use the manual copy center', () => {
  assert.equal(canUseOperationalCenter({ mode: 'local', hasShell: true }), true);
  for (const role of ['admin', 'operator', 'viewer', 'auditor']) {
    assert.equal(canUseOperationalCenter({ mode: 'cloud', hasShell: true, cloudRole: role }), true);
  }
});

test('guard clears stale cloud authorization on a new login and closes sensitive dialogs on auth loss', () => {
  assert.match(guardSource, /removeAttribute\('data-access-role'\)/);
  assert.match(guardSource, /querySelector\('\.access-blocker'\)/);
  assert.match(guardSource, /querySelector\('#app \.shell'\)/);
  assert.match(guardSource, /querySelector\('dialog\[open\]'\)\?\.close/);
  assert.match(guardSource, /data\.opsAuthorized|dataset\.opsAuthorized/);
});

test('operational center is hidden by default and only shown after the guard authorizes it', () => {
  assert.match(cssSource, /\.ops-root\{display:none!important\}/);
  assert.match(cssSource, /data-ops-authorized="true"/);
});

test('production shell loads only the guarded entrypoint and caches the guard for offline operation', () => {
  assert.match(indexSource, /operational-access-guard\.css/);
  assert.match(indexSource, /operational-access-guard\.js/);
  assert.doesNotMatch(indexSource, /src="\.\/assets\/js\/operational-copy-center\.js"/);
  for (const asset of ['operational-access-policy.js', 'operational-access-guard.js', 'operational-access-guard.css']) {
    assert.ok(serviceWorkerSource.includes(asset), `service worker must cache ${asset}`);
  }
});
