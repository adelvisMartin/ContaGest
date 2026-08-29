import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HIPICO_VIEWS, HIPICO_VIEWPORTS, HIPICO_STATE_CASES, matrixRows } from '../qa/support/hipico-visual-catalog-v105.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('#105 enumerates every productive view independently at every required viewport', () => {
  assert.deepEqual(HIPICO_VIEWPORTS.map((entry) => entry.width), [360, 390, 430, 768, 1366, 1920, 844]);
  assert.equal(HIPICO_VIEWS.length, 9);
  const rows = matrixRows();
  assert.equal(rows.length, HIPICO_VIEWS.length * HIPICO_VIEWPORTS.length);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  for (const view of HIPICO_VIEWS) {
    assert.equal(rows.filter((row) => row.view === view.id).length, HIPICO_VIEWPORTS.length, `${view.id} no puede heredar PASS de otra vista`);
  }
});

test('#105 explicitly accounts for normal/empty/loading/error/offline/permission/recovery', () => {
  assert.deepEqual(HIPICO_STATE_CASES.map((entry) => entry.id), ['normal', 'empty', 'offline', 'loading', 'error', 'permission', 'recovery']);
});

test('#105 browser gate contains overflow, overlap, touch and dead-control checks', () => {
  const detector = read('qa/support/hipico-layout-detector-v105.mjs');
  for (const required of ['document-overflow-x', 'element-outside-viewport', 'icon-label-overlap', 'touch-target-too-small', 'button-without-workflow', 'duplicate-id']) {
    assert.match(detector, new RegExp(required));
  }
  const spec = read('qa/hipico-visual-functional-v105.spec.mjs');
  assert.match(spec, /page\.screenshot/);
  assert.match(spec, /HIPICO_QA_SHA|GITHUB_SHA/);
  assert.match(spec, /context\.setOffline\(true\)/);
});

test('#105 deliberate broken fixture is guaranteed to violate the detector', () => {
  const fixture = read('qa/fixtures/hipico-v105-broken-overflow.html');
  assert.match(fixture, /width:\s*180vw/);
  assert.match(fixture, /width:\s*24px/);
  assert.match(fixture, /position:\s*absolute/);
  assert.doesNotMatch(fixture, /data-action|data-view|type="submit"/);
});

test('#105 PWA and Android wrapper share the same canonical runtime source', () => {
  const sync = read('android/hipico-control-v1130/scripts/sync-web.mjs');
  assert.match(sync, /frontend\/public\/hipico-control/);
  assert.match(sync, /fs\.cpSync\(source, target, \{ recursive: true \}\)/);
  assert.match(sync, /verifyParity\(sourceFiles, targetFiles\)/);
  assert.match(sync, /sha256/);
  const androidPackage = JSON.parse(read('android/hipico-control-v1130/package.json'));
  assert.match(androidPackage.scripts['cap:sync'], /sync:web/);
  assert.match(androidPackage.scripts['android:debug'], /cap:sync/);
});

test('#105 visible data-action controls are backed by delegated action branches', () => {
  const app = read('frontend/public/hipico-control/assets/js/app.js');
  const renderedActions = [...app.matchAll(/data-action="([a-z0-9-]+)"/gi)].map((match) => match[1]);
  const uniqueActions = [...new Set(renderedActions)];
  assert.ok(uniqueActions.length > 25, 'el inventario debe cubrir controles reales, no una muestra trivial');
  const missing = uniqueActions.filter((action) => {
    const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`action\\s*===\\s*["']${escaped}["']|["']${escaped}["'][^\\n]{0,180}includes\\(action\\)`).test(app) === false;
  });
  assert.deepEqual(missing, [], `Controles visibles sin workflow delegado: ${missing.join(', ')}`);
});
