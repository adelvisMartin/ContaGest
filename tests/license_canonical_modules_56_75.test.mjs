import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACCESS_MANIFEST } from '../backend/src/shared/contracts/accessManifestRuntime.js';
import { MODULE_CATALOG } from '../frontend/src/data/moduleCatalog.js';
import { licensesBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const licenses=licensesBackendSource();
const page=fs.readFileSync('frontend/src/pages/LicensesPage.js','utf8');
const routes=new Set(ACCESS_MANIFEST.modules.map((item)=>item.route));

test('56/75 license issuance rejects module identifiers outside the canonical manifest',()=>{
  assert.match(licenses,/CANONICAL_LICENSE_MODULES/);
  assert.match(licenses,/licenseModuleSchema/);
  assert.match(licenses,/Módulo no reconocido por el manifiesto de acceso/);
  assert.match(licenses,/new Set\(modules\)/);
});

test('56/75 validate and heartbeat reject unknown route telemetry',()=>{
  assert.match(licenses,/LICENSE_ROUTE_ALLOWLIST/);
  assert.match(licenses,/Ruta no reconocida por el manifiesto de acceso/);
  assert.match(licenses,/route:\s*licenseRouteSchema\.optional\(\)/);
});

test('56/75 legacy license output filters unknown stored modules without mutating persistence',()=>{
  assert.match(licenses,/filter\(\(module\)=>CANONICAL_LICENSE_MODULES\.has\(module\)\)/);
  assert.match(licenses,/modules:\s*config\.enabled/);
});

test('56/75 license UI derives available modules and sector defaults from moduleCatalog',()=>{
  assert.match(page,/MODULE_CATALOG/);
  assert.match(page,/MODULE_CATALOG\.map\(\(item\)=>item\.route\)/);
  assert.match(page,/canonicalLicenseModules/);
  assert.match(page,/routes\.filter\(\(route\)=>canonicalLicenseModules\.has\(route\)\)/);
  assert.doesNotMatch(page,/DemoAccessService\.modules/);
  const canonical=new Set(ACCESS_MANIFEST.modules.map((item)=>item.route));
  for(const item of MODULE_CATALOG)assert.ok(canonical.has(item.route),item.route);
});

test('56/75 canonical license module catalog matches the unique authenticated manifest without a stale fixed count',()=>{
  const manifestRoutes=ACCESS_MANIFEST.modules.map((item)=>item.route);
  const uiRoutes=MODULE_CATALOG.map((item)=>item.route);
  assert.equal(routes.size,manifestRoutes.length,'authenticated manifest must not contain duplicate routes');
  assert.equal(uiRoutes.length,manifestRoutes.length,'license UI must expose the exact canonical route count');
  assert.deepEqual([...uiRoutes].sort(),[...manifestRoutes].sort(),
    'license UI may neither omit a canonical route nor introduce an unlicensed route');

  // Security invariant: runtime licensing still derives its allowlist from the
  // validated manifest. New modules must not become implicitly authorized by
  // editing this test, and unknown route telemetry remains rejected.
  const contracts=fs.readFileSync('backend/src/modules/licenses/licenses.contracts.ts','utf8');
  assert.match(contracts,/CANONICAL_LICENSE_MODULES\s*=\s*new Set\(ACCESS_MANIFEST\.modules\.map\(\(item\)\s*=>\s*item\.route\)\)/);
  assert.match(contracts,/licenseModuleSchema[\s\S]*CANONICAL_LICENSE_MODULES\.has\(value\)/);
  assert.match(contracts,/licenseRouteSchema[\s\S]*LICENSE_ROUTE_ALLOWLIST\.has\(value\)/);
});
