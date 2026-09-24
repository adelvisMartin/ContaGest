import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('batch 6 extracts declarative access role presets without changing service authority',()=>{
  const service=read('frontend/src/services/accessControlService.js');
  const presets=read('frontend/src/services/accessControlPresets.js');

  assert.match(service,/from '\.\/accessControlPresets\.js'/);
  assert.match(service,/createRolePresetInput\(allModules\)/);
  assert.doesNotMatch(service,/const ROLE_DEFINITION_INPUT = \[/);
  assert.match(presets,/export const createRolePresetInput=/);
  assert.equal((presets.match(/id:'role-/g)||[]).length,18);

  for(const method of [
    'defaultState','ensure','activeUser','roleForUser','modulesForRole','permissionsForRole',
    'modulesForUser','canAccessRoute','routeStatus','remaining'
  ]) assert.match(service,new RegExp(`\\b${method}\\(`),method);

  assert.doesNotMatch(presets,/React|useState|useEffect|fetch\(|BackendApi|AuthSession/);
});

test('batch 6 gives licensing one declarative request-contract authority',()=>{
  const routes=read('backend/src/modules/licenses/licenses.routes.ts');
  const contracts=read('backend/src/modules/licenses/licenses.contracts.ts');

  assert.match(routes,/from '\.\/licenses\.contracts\.js'/);
  assert.doesNotMatch(routes,/\bz\./);
  assert.doesNotMatch(routes,/const licenseSchema\s*=|const validateSchema\s*=/);

  for(const contract of [
    'BUSINESS_SECTORS','COMMERCIAL_USES','CANONICAL_LICENSE_MODULES',
    'LICENSE_ROUTE_ALLOWLIST','licenseModuleSchema','licenseRouteSchema',
    'licenseSchema','validateSchema'
  ]) assert.match(contracts,new RegExp(`export const ${contract}\\b`),contract);

  assert.match(contracts,/ACCESS_MANIFEST\.modules/);
  assert.doesNotMatch(contracts,/\bprisma\b|Router\(|requirePermission|\$queryRaw|\$executeRaw/);
});

test('batch 6 preserves licensing route and security ownership',()=>{
  const routes=read('backend/src/modules/licenses/licenses.routes.ts');
  for(const route of [
    "router.get('/')",
    "router.post('/')",
    "router.post('/validate')",
    "router.post('/heartbeat')",
    "router.patch('/:id/revoke')",
    "router.patch('/:id/devices/:activationId/revoke')"
  ]) assert.ok(routes.includes(route),route);

  for(const boundary of [
    'router.use(requireTenant)',
    'requirePermission',
    'validateUserLicense',
    'hashLicenseKey',
    'ensureAccountMembership',
    'permissionForRoute',
    'prisma.$transaction'
  ]) assert.ok(routes.includes(boundary),boundary);
});

test('batch 6 keeps access manifest as the canonical source for license modules',()=>{
  const contracts=read('backend/src/modules/licenses/licenses.contracts.ts');
  assert.match(contracts,/new Set\(ACCESS_MANIFEST\.modules\.map\(\(item\) => item\.route\)\)/);
  assert.match(contracts,/new Set\(\['login', \.\.\.CANONICAL_LICENSE_MODULES\]\)/);
  assert.match(contracts,/CANONICAL_LICENSE_MODULES\.has\(value\)/);
});

test('implementation audit traces 52 through 57 as access/licensing reviewed',()=>{
  const manifest=JSON.parse(read('config/implementation-roadmap-1-58.json'));
  const reviewed=manifest.implementations
    .filter((row)=>(row.reviewBatches||[]).includes('CLEAN_CODE_BATCH_6_ACCESS_LICENSING'))
    .map((row)=>row.id);
  assert.deepEqual(reviewed,[52,53,54,55,56,57]);
});
