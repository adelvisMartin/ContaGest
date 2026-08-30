import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ERP_MOBILE_MIGRATION_V181 } from '../qa/support/erp-mobile-migration-v181.mjs';

test('all 58 canonical routes are covered by one responsive owner',()=>{
  assert.equal(ERP_MOBILE_MIGRATION_V181.length,58);
  assert.equal(new Set(ERP_MOBILE_MIGRATION_V181.map((item)=>item.route)).size,58);
  assert.equal(new Set(ERP_MOBILE_MIGRATION_V181.map((item)=>item.mobileOwner)).size,1);
});

test('device-capture first wave contains gym nutrition routines and inventory',()=>{
  const hot=new Set(ERP_MOBILE_MIGRATION_V181.filter((item)=>item.wave==='device-capture-hotfix').map((item)=>item.route));
  for(const route of ['gimnasio','rutinas','nutricion','inventario'])assert.equal(hot.has(route),true,route);
});

test('every route requires 360 390 and 430',()=>{
  for(const item of ERP_MOBILE_MIGRATION_V181)assert.deepEqual(item.requiredViewports,[360,390,430],item.route);
});

test('runtime CSS owns overflow nav icon spacing forms and first-wave layouts',()=>{
  const css=fs.readFileSync('frontend/src/styles/erp-runtime.css','utf8');
  for(const token of ['cg.visual.responsive','cgx-module-standard','cg-vertical-tabs','cg-gym-v1124-tabs','cg-record-fields','cg-gym-v1124-grid','cg-inventory-workspace','font-size:16px','min-height:44px'])assert.match(css,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
