import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compareRuntimeVersion } from '../frontend/public/hipico-control/assets/js/version-guard.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('runtime version comparison is deterministic and fail-closed for mismatches', () => {
  assert.deepEqual(compareRuntimeVersion({ version: '1.13.0-rc3' }, '1.13.0-rc3'), { ok: true, expected: '1.13.0-rc3', observed: '1.13.0-rc3' });
  assert.equal(compareRuntimeVersion({ version: '1.13.0-rc2' }, '1.13.0-rc3').ok, false);
  assert.equal(compareRuntimeVersion({}, '1.13.0-rc3').observed, 'unknown');
});

test('PWA loads and precaches version guard while runtime metadata remains network-only', async () => {
  const [html, sw, guard] = await Promise.all([
    read('frontend/public/hipico-control/index.html'),
    read('frontend/public/hipico-control/sw.js'),
    read('frontend/public/hipico-control/assets/js/version-guard.js')
  ]);
  assert.match(html, /assets\/js\/version-guard\.js/);
  assert.match(sw, /assets\/js\/version-guard\.js/);
  assert.match(sw, /build-info\.json/);
  assert.match(sw, /isRuntimeMetadata\(url\).*cache:\s*'no-store'/s);
  assert.match(guard, /cache:\s*'no-store'/);
  assert.match(guard, /role['"],\s*['"]alert/);
  assert.match(guard, /Actualización requerida/);
  assert.match(guard, /operaciones críticas/);
});
