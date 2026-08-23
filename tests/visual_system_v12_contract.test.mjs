import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const runtime=read('frontend/src/styles/erp-runtime.css');
const visual=read('frontend/src/styles/contagest-visual-system-v12.css');
const shell=read('frontend/src/styles/shell-contract.css');
const layout=read('frontend/src/components/layout.js');
const kit=read('frontend/src/components/ui/kit.js');
const mui=read('frontend/src/components/muiRuntime.js');
const designTokens=read('frontend/src/components/designTokens.js');
const legacyDs=read('frontend/src/components/designSystem.js');

function importsOf(source){return[...source.matchAll(/@import\s+(?:url\()?['"]([^'"]+\.css)['"]/g)].map((match)=>match[1]);}

test('runtime has one deterministic five-owner cascade ending in canonical appearance',()=>{
  assert.deepEqual(importsOf(runtime),[
    './shell-contract.css',
    './shell-stability-v1127.css',
    './runtime-primitives-v13.css',
    './module-adapters.css',
    './contagest-visual-system-v12.css'
  ]);
  assert.match(runtime,/active visual\s+contract is v15/i);
  assert.match(runtime,/FINAL canonical appearance authority/i);
});

test('v15 exposes one compact tokenized type and geometry scale',()=>{
  for(const token of [
    '--cg-v-text-2xs','--cg-v-text-xs','--cg-v-text-sm','--cg-v-text-md','--cg-v-text-lg',
    '--cg-v-text-section','--cg-v-text-page','--cg-v-text-kpi',
    '--cg-v-space-1','--cg-v-space-2','--cg-v-space-3','--cg-v-space-4',
    '--cg-v-radius-sm','--cg-v-radius-md','--cg-v-radius-lg',
    '--cg-v-control','--cg-v-control-touch','--cg-v-page-max','--cg-v-kpi-min'
  ])assert.match(visual,new RegExp(token.replaceAll('-','\\-')));
  assert.match(visual,/--cg-v-text-page:\s*clamp\(20px,[^;]*24px\)/);
  assert.match(visual,/--cg-v-text-kpi:\s*clamp\(16px,[^;]*20px\)/);
  assert.match(visual,/--cg-v-text-section:\s*clamp\(15px,[^;]*17px\)/);
  assert.match(visual,/--cg-v-control:\s*38px/);
  assert.match(visual,/--cg-v-control-touch:\s*44px/);
  assert.match(visual,/--cg-v-table-row:\s*40px/);
});

test('light and dark palettes are graphite-neutral and geometrically identical',()=>{
  assert.match(visual,/--cg-v-bg:\s*#f4f5f7/i);
  assert.match(visual,/--cg-v-surface:\s*#ffffff/i);
  assert.match(visual,/--cg-v-brand:\s*#5661e8/i);
  assert.match(visual,/html\.dark,[\s\S]*--cg-v-bg:\s*#111214/i);
  assert.match(visual,/html\.dark,[\s\S]*--cg-v-surface:\s*#181a1d/i);
  assert.match(visual,/html\.dark,[\s\S]*--cg-v-brand:\s*#7c86ff/i);
  assert.doesNotMatch(visual,/(?:linear|radial|conic)-gradient\s*\(/i);
  assert.doesNotMatch(visual,/backdrop-filter\s*:/i);
});

test('shell follows compact enterprise navigation contract',()=>{
  assert.match(shell,/--cg-sidebar:\s*244px/);
  assert.match(shell,/--cg-sidebar-collapsed:\s*68px/);
  assert.match(shell,/--cg-header:\s*60px/);
  assert.match(layout,/Espacio de trabajo/);
  assert.match(layout,/hf-area-meta/);
  assert.match(layout,/hf-sidebar-mini-actions/);
  assert.match(layout,/hf-create-button/);
  assert.match(layout,/Buscar en ContaGest/);
  assert.match(layout,/modulesByArea\(state\.settings\?\.businessMode\|\|'admin',\{includeAll:false\}\)/);
  assert.doesNotMatch(layout,/hf-kpi-strip|hf-quickbar/);
});

test('canonical metrics never ellipsize financial values or restore decorative KPI blobs',()=>{
  assert.match(visual,/\.cgx-metric\s*\{[\s\S]*min-height:\s*112px/);
  assert.match(visual,/\.cgx-metric-icon\s*\{[\s\S]*width:\s*26px/);
  assert.match(visual,/\.cgx-metric-main strong\s*\{[\s\S]*overflow:visible!important/);
  assert.match(visual,/\.cgx-metric-main strong\s*\{[\s\S]*text-overflow:clip!important/);
  assert.match(visual,/\.cgx-metric-main strong\s*\{[\s\S]*white-space:nowrap!important/);
  assert.doesNotMatch(visual,/\.cgx-metric[^}]*border-radius:\s*50%/i);
});

test('shared components use the v15 markup contract and accessible field labels',()=>{
  assert.match(kit,/cgx-metric-top/);
  assert.match(kit,/cgx-metric-main/);
  assert.match(kit,/cgx-page-overline/);
  assert.match(kit,/scope="col"/);
  assert.match(kit,/for=\"\$\{safe\(inputId\)\}\"/);
  assert.doesNotMatch(kit,/ds-btn ds-btn-/);
  assert.doesNotMatch(kit,/cgv-btn cgv-btn-/);
});

test('MUI islands share exactly the same v15 light-dark direction',()=>{
  assert.match(mui,/bg:'#111214'/);
  assert.match(mui,/surface:'#181a1d'/);
  assert.match(mui,/brand:'#7c86ff'/);
  assert.match(mui,/bg:'#f4f5f7'/);
  assert.match(mui,/surface:'#ffffff'/);
  assert.match(mui,/brand:'#5661e8'/);
  assert.doesNotMatch(mui,/createVetTheme|enterprise/);
});

test('legacy JS token facades cannot maintain another hard-coded palette',()=>{
  assert.match(designTokens,/canonical values live in `styles\/contagest-visual-system-v12\.css`/i);
  assert.match(designTokens,/var\(--cg-v-brand\)/);
  assert.doesNotMatch(designTokens,/#(?:[0-9a-fA-F]{6})\b/);
  assert.match(legacyDs,/from '\.\/ui\/kit\.js'/);
  assert.doesNotMatch(legacyDs,/material-symbols-outlined/);
});

test('document owns no horizontal scroll and component owners do',()=>{
  assert.match(visual,/html\s*\{[^}]*overflow-x:clip/);
  assert.match(visual,/body\s*\{[\s\S]*overflow-x:clip/);
  assert.match(visual,/cgx-table-wrap[\s\S]*overflow-x:auto/);
  assert.match(visual,/@media \(max-width:760px\)/);
  assert.match(visual,/@media \(max-width:430px\)/);
});

test('motion is short functional and reduced-motion safe',()=>{
  assert.match(visual,/--cg-v-duration-fast:\s*120ms/);
  assert.match(visual,/--cg-v-duration:\s*170ms/);
  assert.match(visual,/prefers-reduced-motion:reduce/);
  assert.doesNotMatch(visual,/animation-duration:\s*[1-9](?:\.\d+)?s/);
});
