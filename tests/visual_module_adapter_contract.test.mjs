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

test('module adapters load before the final canonical appearance authority',()=>{
  const moduleIndex=runtime.indexOf("@import './module-adapters.css'");
  const visualIndex=runtime.indexOf("@import './contagest-visual-system-v12.css'");
  assert.ok(moduleIndex>0,'module adapters must be imported');
  assert.ok(visualIndex>moduleIndex,'canonical visual system must remain physically last');
  assert.match(runtime,/cg\.module-adapters/);
  assert.match(runtime,/FINAL canonical appearance authority/i);
});

test('module adapter remains tokenized and cannot create another palette or decorative system',()=>{
  assert.doesNotMatch(adapters,/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i);
  assert.doesNotMatch(adapters,/(?:linear|radial|conic)-gradient\s*\(/i);
  assert.doesNotMatch(adapters,/font-size\s*:\s*(?:2[2-9]|[3-9]\d)px/i);
  for(const token of ['--cg-v-border','--cg-v-surface','--cg-v-text','--cg-v-text-kpi','--cg-v-radius-md','--cg-v-control'])assert.match(adapters,new RegExp(token.replaceAll('-','\\-')));
});

test('high-risk module families have explicit structural ownership without independent themes',()=>{
  for(const selector of [
    '.cg-ledger-workbench','.cg-rbac-permission-grid','.cg-vertical-grid','.cg-psych-editor-grid',
    '.cg-dental-tooth-grid','.cg-gym-v1124-grid','.cg-pos-layout','.cg-kanban'
  ])assert.ok(adapters.includes(selector),`missing adapter ${selector}`);
  for(const breakpoint of ['1100px','900px','760px','430px'])assert.ok(adapters.includes(`max-width:${breakpoint}`)||adapters.includes(`max-width: ${breakpoint}`),`missing ${breakpoint} breakpoint`);
});

test('appointment calendar owns its horizontal overflow rather than document',()=>{
  assert.match(adapters,/cg-psych-calendar/);
  assert.match(adapters,/cg-psychology-workspace[\s\S]*overflow-x:auto/);
  assert.match(adapters,/cg-appointment-list/);
});

test('POS keeps explicit accessible touch actions',()=>{
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

test('persisted theme state remains binary',()=>{
  assert.match(store,/OFFICIAL_THEMES\s*=\s*new Set\(\['light','dark'\]\)/);
  assert.match(store,/return OFFICIAL_THEMES\.has\(value\) \? value : 'light'/);
});
