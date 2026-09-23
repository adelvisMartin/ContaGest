import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BUSINESS_MODES, modulesForMode } from '../frontend/src/data/moduleCatalog.js';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const json=(path)=>JSON.parse(read(path));
const licenses=read('backend/src/modules/licenses/licenses.routes.ts');
const context=read('backend/src/shared/middleware/context.ts');
const licensePage=read('frontend/src/pages/LicensesPage.js');
const access=read('frontend/src/services/accessControlService.js');
const manifest=json('backend/src/shared/contracts/access-manifest.json');
const byRoute=new Map(manifest.modules.map((item)=>[item.route,item]));

test('52/75 licensing accepts every clinical and fitness business sector exposed by the product',()=>{
  for(const sector of ['salud','veterinaria','psicologia','odontologia','gimnasio','nutricion']){
    assert.match(licenses,new RegExp(`['"]${sector}['"]`),sector);
    assert.match(licensePage,new RegExp(`value:['"]${sector}['"]`),sector);
  }
});

test('52/75 clinical and fitness entitlements resolve through the canonical manifest',()=>{
  for(const route of ['salud','veterinaria','psicologia','odontologia']){
    assert.equal(byRoute.get(route)?.permission,'health.manage',route);
  }
  for(const route of ['gimnasio','rutinas','nutricion']){
    assert.equal(byRoute.get(route)?.permission,'gym.manage',route);
  }
  assert.match(licenses,/permissionForRoute/);
  assert.match(context,/PERMISSION_MODULES/);
});

test('52/75 vertical license keys remain visibly distinguishable without changing secret entropy',()=>{
  for(const [sector,prefix] of [['veterinaria','VET'],['psicologia','PSI'],['odontologia','ODO'],['gimnasio','GYM'],['nutricion','NUT']]){
    assert.match(licenses,new RegExp(`${sector}:'${prefix}'`),sector);
  }
  assert.match(licenses,/crypto\.randomBytes\(24\)/);
});

test('52/75 standalone nutrition mode exposes nutrition capabilities without granting gym operation by mode',()=>{
  assert.ok(BUSINESS_MODES.nutricion);
  const routes=modulesForMode('nutricion').map((item)=>item.route);
  for(const route of ['dashboard','clientes','nutricion','mensajes','analytics','reportes','soporte'])assert.ok(routes.includes(route),route);
  assert.ok(!routes.includes('gimnasio'),'standalone nutrition must not implicitly expose gym operations');
  assert.ok(!routes.includes('rutinas'),'standalone nutrition must not implicitly expose training routines');
});

test('52/75 license UI provides safe defaults for psychology dentistry and standalone nutrition',()=>{
  assert.match(licensePage,/psicologia:\['dashboard','psicologia','clientes','reportes','analytics','mensajes','soporte'\]/);
  assert.match(licensePage,/odontologia:\['dashboard','odontologia','clientes','reportes','analytics','mensajes','soporte'\]/);
  assert.match(licensePage,/nutricion:\['dashboard','nutricion','clientes','reportes','analytics','mensajes','soporte'\]/);
  assert.match(licensePage,/'salud','veterinaria','psicologia','odontologia','gimnasio','rutinas','nutricion','mensajes'/);
});

test('52/75 local access model mirrors the standalone nutrition entitlement without widening it to gym',()=>{
  assert.match(access,/id:'role-nutricion'/);
  assert.match(access,/modules:\['dashboard','nutricion','clientes','analytics','reportes','mensajes','soporte'\]/);
  assert.match(access,/id:'user-nutricion'/);
});
