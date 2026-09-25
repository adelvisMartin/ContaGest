import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { accessControlSource } from '../qa/support/vertical-authority-sources.mjs';

const manifest=JSON.parse(fs.readFileSync('backend/src/shared/contracts/access-manifest.json','utf8'));
const access=accessControlSource();

const byRoute=new Map(manifest.modules.map((item)=>[item.route,item.permission]));

function roleDefinitionsFromSource(){
  const start=access.indexOf('export const createRolePresetInput=(allModules)=>[');
  const end=access.indexOf(' ];;',start);
  assert.ok(start>=0&&end>start,'normalized role definition input must exist');
  const block=access.slice(start,end+2);
  return [...block.matchAll(/id:'([^']+)'[\s\S]*?permissions:\[([^\]]*)\],[\s\S]*?modules:(\[[^\]]*\]|allModules)/g)].map((match)=>({
    id:match[1],
    permissions:[...match[2].matchAll(/'([^']+)'/g)].map((item)=>item[1]),
    modules:match[3]==='allModules'?[...byRoute.keys()]:[...match[3].matchAll(/'([^']+)'/g)].map((item)=>item[1])
  }));
}

test('54/75 default roles derive every route permission from the canonical access manifest',()=>{
  assert.match(access,/permissionsForModules/);
  assert.match(access,/ROLE_DEFINITION_INPUT/);
  assert.match(access,/const ROLE_DEFINITIONS = ROLE_DEFINITION_INPUT\.map/);
  assert.match(access,/createRolePresetInput\(allModules\)/);
  for(const role of roleDefinitionsFromSource()){
    for(const route of role.modules){
      assert.ok(byRoute.has(route),`${role.id}: unknown route ${route}`);
    }
  }
});

test('54/75 normalization preserves only non-route capabilities and derives all route permissions',()=>{
  assert.match(access,/const routePermissions = new Set\(permissionByRoute\.values\(\)\)/);
  assert.match(access,/filter\(\(permission\)=>!routePermissions\.has\(permission\)\)/);
  assert.match(access,/permissionsForModules\(modules\)/);
  assert.match(access,/permissionByRoute/);
});

test('54/75 role/module mutators reject routes outside the canonical manifest',()=>{
  assert.match(access,/if\(!permissionByRoute\.has\(route\)\)return rbac;/);
  assert.match(access,/filter\(\(route\)=>permissionByRoute\.has\(route\)\)/);
});
