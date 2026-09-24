import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACCESS_MANIFEST } from '../backend/src/shared/contracts/accessManifestRuntime.js';
import { ROLE_ACCESS_PROFILES, roleAccessProfile } from '../backend/src/shared/contracts/roleAccessProfilesRuntime.js';

const access=fs.readFileSync('frontend/src/services/accessControlService.js','utf8');
const rbac=fs.readFileSync('backend/src/modules/rbac/rbac.routes.ts','utf8');
const canonicalRoutes=new Set(ACCESS_MANIFEST.modules.map((item)=>item.route));

test('58/75 shared role access profiles cover 18 unique frontend roles with canonical modules',()=>{
  assert.equal(ROLE_ACCESS_PROFILES.length,18);
  assert.equal(new Set(ROLE_ACCESS_PROFILES.map((item)=>item.id)).size,18);
  for(const profile of ROLE_ACCESS_PROFILES){
    for(const route of profile.modules)assert.ok(canonicalRoutes.has(route),`${profile.id}: unknown route ${route}`);
  }
});

test('58/75 route permissions are derived from modules and known drift cases are corrected',()=>{
  const contador=roleAccessProfile('role-contador');
  assert.ok(contador.routePermissions.includes('sales.manage'));
  assert.ok(contador.routePermissions.includes('modules.manage'));
  const demo=roleAccessProfile('role-demo');
  assert.ok(demo.routePermissions.includes('sales.manage'));
  assert.ok(demo.routePermissions.includes('orders.manage'));
  for(const id of ['role-inventario','role-rrhh','role-clinica','role-veterinaria']){
    assert.ok(roleAccessProfile(id).routePermissions.includes('audit.view'),id);
  }
});

test('58/75 frontend role metadata consumes shared access profiles instead of duplicating modules/permissions',()=>{
  assert.match(access,/contagest-ve-backend\/role-access-profiles/);
  assert.match(access,/ROLE_METADATA/);
  assert.match(access,/roleAccessProfile\(role\.id\)/);
  const start=access.indexOf('const ROLE_METADATA = [');
  const end=access.indexOf('];\n\nconst ROLE_DEFINITIONS',start);
  assert.ok(start>=0&&end>start);
  const block=access.slice(start,end);
  assert.doesNotMatch(block,/permissions:\[/);
  assert.doesNotMatch(block,/modules:\[/);
});

test('58/75 backend bootstrap derives tenant role permissions from the same shared profiles',()=>{
  assert.match(rbac,/ROLE_ACCESS_PROFILES/);
  assert.match(rbac,/profile\.backend/);
  assert.match(rbac,/profile\.routePermissions/);
  assert.doesNotMatch(rbac,/const ROLE_BLUEPRINTS = \[/);
});

test('58/75 shared profile capabilities never masquerade as canonical route permissions',()=>{
  const routePermissions=new Set(ACCESS_MANIFEST.modules.map((item)=>item.permission));
  for(const profile of ROLE_ACCESS_PROFILES){
    for(const capability of profile.capabilities)assert.ok(!routePermissions.has(capability),`${profile.id}: duplicated route capability ${capability}`);
  }
});
