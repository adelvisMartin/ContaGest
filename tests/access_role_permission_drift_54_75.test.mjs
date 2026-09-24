import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROLE_ACCESS_PROFILES } from '../backend/src/shared/contracts/roleAccessProfilesRuntime.js';

const manifest=JSON.parse(fs.readFileSync('backend/src/shared/contracts/access-manifest.json','utf8'));
const access=fs.readFileSync('frontend/src/services/accessControlService.js','utf8');
const byRoute=new Map(manifest.modules.map((item)=>[item.route,item.permission]));

test('54/75 default roles derive every route permission from the canonical access manifest',()=>{
  assert.match(access,/permissionsForModules/);
  assert.match(access,/roleAccessProfile\(role\.id\)/);
  assert.match(access,/const ROLE_DEFINITIONS = ROLE_METADATA\.map/);
  for(const role of ROLE_ACCESS_PROFILES){
    for(const route of role.modules)assert.ok(byRoute.has(route),`${role.id}: unknown route ${route}`);
    for(const permission of role.routePermissions)assert.ok([...byRoute.values()].includes(permission),`${role.id}: unknown permission ${permission}`);
  }
});

test('54/75 normalization preserves only non-route capabilities and derives all route permissions',()=>{
  assert.match(access,/const routePermissions = new Set\(permissionByRoute\.values\(\)\)/);
  assert.match(access,/shared\?\.capabilities\|\|role\.permissions/);
  assert.match(access,/permissionsForModules\(modules\)/);
  assert.match(access,/permissionByRoute/);
});

test('54/75 role/module mutators reject routes outside the canonical manifest',()=>{
  assert.match(access,/if\(!permissionByRoute\.has\(route\)\)return rbac;/);
  assert.match(access,/filter\(\(route\)=>permissionByRoute\.has\(route\)\)/);
});
