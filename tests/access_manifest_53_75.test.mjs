import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const json=(file)=>JSON.parse(read(file));
const manifest=json('backend/src/shared/contracts/access-manifest.json');

function pageRegistryRoutes(){
  const source=read('frontend/src/data/pageRegistry.js');
  const start=source.indexOf('export const PAGE_REGISTRY = {');
  const end=source.indexOf('\n};',start);
  assert.ok(start>=0&&end>start,'pageRegistry must exist');
  const block=source.slice(start,end+3);
  const routes=[];
  const pattern=/(?:^|,)\s*(?:'([^']+)'|"([^"]+)"|([\w-]+))\s*:\s*\['\.\/pages\/([^']+)'\s*,\s*'([^']+)'\]/gm;
  for(const match of block.matchAll(pattern))routes.push(match[1]||match[2]||match[3]);
  return routes;
}

test('53/75 canonical access manifest covers every authenticated runtime route exactly once',()=>{
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.modules.length,57);
  const routes=manifest.modules.map((item)=>item.route);
  assert.equal(new Set(routes).size,routes.length,'manifest contains duplicate routes');
  const runtime=pageRegistryRoutes().filter((route)=>route!=='login').sort();
  assert.deepEqual([...routes].sort(),runtime);
});

test('53/75 every route declares permission license module modes and UI metadata',()=>{
  const allowedTiers=new Set(['core','advanced','demo']);
  for(const item of manifest.modules){
    assert.ok(item.route&&item.name&&item.area&&item.permission&&item.accessGroup&&item.licenseModule,JSON.stringify(item));
    assert.ok(Array.isArray(item.modes)&&item.modes.length>0,item.route);
    assert.ok(allowedTiers.has(item.tier),`${item.route}: invalid tier`);
    assert.equal(item.licenseModule,item.route,`${item.route}: license identity drift`);
  }
});

test('53/75 manifest permissions are tenant-manageable backend permissions',()=>{
  const rbac=read('backend/src/modules/rbac/rbac.routes.ts');
  const block=rbac.slice(rbac.indexOf('const MODULE_PERMISSIONS = ['),rbac.indexOf('] as const;',rbac.indexOf('const MODULE_PERMISSIONS = [')));
  const allowed=new Set([...block.matchAll(/\['([^']+)',\s*'[^']+'\]/g)].map((match)=>match[1]));
  for(const permission of new Set(manifest.modules.map((item)=>item.permission))){
    assert.ok(allowed.has(permission),`permission missing from tenant allowlist: ${permission}`);
  }
});

test('53/75 frontend and backend consume the same manifest instead of route-permission clones',()=>{
  const moduleCatalog=read('frontend/src/data/moduleCatalog.js');
  const access=read('frontend/src/services/accessControlService.js');
  const context=read('backend/src/shared/middleware/context.ts');
  const rbac=read('backend/src/modules/rbac/rbac.routes.ts');
  const licenses=read('backend/src/modules/licenses/licenses.routes.ts');
  const pkg=json('backend/package.json');

  assert.equal(pkg.exports['./access-manifest'],'./src/shared/contracts/accessManifestRuntime.js');
  assert.match(moduleCatalog,/contagest-ve-backend\/access-manifest['"]/);
  assert.match(access,/contagest-ve-backend\/access-manifest['"]/);
  assert.doesNotMatch(moduleCatalog,/access-manifest\.json/);
  assert.doesNotMatch(access,/access-manifest\.json/);
  assert.match(context,/contracts\/accessManifest\.js/);
  assert.match(rbac,/contracts\/accessManifest\.js/);
  assert.match(licenses,/contracts\/accessManifest\.js/);

  assert.doesNotMatch(moduleCatalog,/export const MODULE_CATALOG = \[/);
  assert.doesNotMatch(access,/export const MODULE_CATALOG_ACCESS = \[/);
  assert.doesNotMatch(context,/const PERMISSION_MODULES: Record<string, string\[]> = \{/);
  assert.doesNotMatch(rbac,/const ROUTE_PERMISSION_MAP: Record<string,string> = \{/);
  assert.doesNotMatch(licenses,/const permissionByModule:/);
});

test('53/75 landing routes are valid and belong to their business mode',()=>{
  const byRoute=new Map(manifest.modules.map((item)=>[item.route,item]));
  for(const [mode,route] of Object.entries(manifest.landingByMode)){
    const item=byRoute.get(route);
    assert.ok(item,`${mode}: landing route ${route} missing`);
    assert.ok(item.modes.includes(mode)||mode==='admin',`${mode}: landing ${route} is not mode-scoped`);
  }
  assert.equal(manifest.landingByMode.veterinaria,'veterinaria');
  assert.equal(manifest.landingByMode.odontologia,'odontologia');
  assert.equal(manifest.landingByMode.gimnasio,'gimnasio');
  assert.equal(manifest.landingByMode.nutricion,'nutricion');
});

test('53/75 unknown frontend routes fail closed and tasks uses the canonical dashboard permission',()=>{
  const access=read('frontend/src/services/accessControlService.js');
  const rbacService=read('frontend/src/services/rbacService.js');
  const tasks=read('backend/src/modules/tasks/tasks.routes.ts');
  assert.match(access,/routePermission\(route\).*\|\|null/);
  assert.match(rbacService,/routePermission\(route\)\)\.filter\(Boolean\)/);
  assert.match(tasks,/requirePermission\('dashboard\.view'\)/);
  assert.doesNotMatch(tasks,/dashboard\.read/);
});
