import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const qa = fs.readFileSync(new URL('../backend/src/shared/licensing/qaBootstrap.ts', import.meta.url), 'utf8');
const routes = fs.readFileSync(new URL('../backend/src/modules/licenses/licenses.routes.ts', import.meta.url), 'utf8');
const guard = fs.readFileSync(new URL('../backend/src/shared/licensing/licenseGuard.ts', import.meta.url), 'utf8');

test('QA bootstrap stores only a digest and never grants platform.manage', () => {
  assert.match(qa, /QA_BOOTSTRAP_SHA256\s*=\s*'[a-f0-9]{64}'/);
  assert.doesNotMatch(qa, /CGVE-QA-[A-Z0-9]{20,}/);
  assert.match(qa, /'QA integral'/);
  assert.doesNotMatch(qa, /QA_PERMISSION_KEYS[\s\S]*'platform\.manage'/);
});

test('QA key is single-use bound and creates an auditable enterprise evaluation license', () => {
  assert.match(qa, /findFirst\(\{ where: \{ keyHash \} \}\)/);
  assert.match(qa, /existingByKey\.tenantId !== input\.tenantId/);
  assert.match(qa, /existingByKey\.userId !== input\.userId/);
  assert.match(qa, /qaMode:\s*true/);
  assert.match(qa, /license\.qa\.activate/);
  assert.match(qa, /maxDevices\"=6/);
});

test('license validation bootstraps before normal device activation', () => {
  assert.match(routes, /await bootstrapQaLicense\(/);
  assert.match(routes, /await validateUserLicense\(/);
  assert.ok(routes.indexOf('await bootstrapQaLicense(') < routes.indexOf('await validateUserLicense('));
});

test('supplied keys select the matching active license and expose qaMode', () => {
  assert.match(guard, /suppliedKeyHash/);
  assert.match(guard, /keyHash:\s*suppliedKeyHash/);
  assert.match(guard, /qaMode:\s*modulesData\.qaMode === true/);
});
