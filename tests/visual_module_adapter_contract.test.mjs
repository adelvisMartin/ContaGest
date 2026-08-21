import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const runtime=read('frontend/src/styles/erp-runtime.css');
const adapters=read('frontend/src/styles/module-adapters.css');
const pos=read('frontend/src/pages/FastFoodPosPage.js');
const store=read('frontend/src/state/store.js');

test('module adapters load below v12 authority and before the final canonical stylesheet',()=>{
  const moduleIndex=runtime.indexOf("@import './module-adapters.css'");
  const visualIndex=runtime.indexOf("@import './contagest-visual-system-v12.css'");
  assert.ok(moduleIndex>0,'module adapters must be imported');
  assert.ok(visualIndex>moduleIndex,'canonical visual system must remain physically last');
  assert.match(runtime,/cg\.module-adapters/);
  assert.match(runtime,/shell > v12 visual contract > module adapters > context\/legacy/);
});

test('module adapter is tokenized and does not create another palette or decorative system',()=>{
  assert.doesNotMatch(adapters,/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i);
  assert.doesNotMatch(adapters,/(?:linear|radial|conic)-gradient\s*\(/i);
  assert.doesNotMatch(adapters,/font-size\s*:\s*(?:2[2-9]|[3-9]\d)px/i);
  for(const token of ['--cg-v-border','--cg-v-surface','--cg-v-text','--cg-v-text-kpi','--cg-v-radius-md','--cg-v-control'])assert.match(adapters,new RegExp(token.replaceAll('-','\\-')));
});

test('high-risk legacy module families have explicit structural adapters',()=>{
  for(const selector of [
    '.cg-ledger-workbench','.cg-rbac-permission-grid','.cg-vertical-grid','.cg-psych-planner-grid',
    '.cg-dental-tooth-grid','.cg-gym-v1124-grid','.cg-pos-layout','.cg-kanban'
  ])assert.ok(adapters.includes(selector),`missing adapter ${selector}`);
  assert.match(adapters,/@media \(max-width: 1100px\)/);
  assert.match(adapters,/@media \(max-width: 900px\)/);
  assert.match(adapters,/@media \(max-width: 760px\)/);
  assert.match(adapters,/@media \(max-width: 430px\)/);
});

test('POS iteration removes the legacy form grid and provides explicit accessible touch buttons',()=>{
  assert.match(pos,/Field, Select, EmptyState/);
  assert.doesNotMatch(pos,/pl-form-grid/);
  assert.doesNotMatch(pos,/pl-field/);
  assert.doesNotMatch(pos,/pl-input/);
  assert.match(pos,/type="button" class="cg-pos-product"/);
  assert.match(pos,/aria-label="Agregar/);
  assert.match(pos,/data-cart-dec/);
  assert.match(pos,/aria-label="Quitar una unidad/);
  assert.match(pos,/escapeHtml/);
});

test('persisted theme state remains binary despite historical CSS still being audited',()=>{
  assert.match(store,/OFFICIAL_THEMES\s*=\s*new Set\(\['light','dark'\]\)/);
  assert.match(store,/return OFFICIAL_THEMES\.has\(value\) \? value : 'light'/);
});
