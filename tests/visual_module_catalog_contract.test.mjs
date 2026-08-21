import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MODULE_VISUAL_CATALOG, MODULE_VISUAL_ROUTES, CRITICAL_VISUAL_ROUTES, VISUAL_VIEWPORTS } from '../qa/support/module-visual-catalog.mjs';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

function appRoutes(){
  const source=read('frontend/src/app.js');
  const start=source.indexOf('const pageRegistry={');
  const end=source.indexOf('\n};',start);
  assert.ok(start>=0&&end>start,'pageRegistry must exist');
  const block=source.slice(start,end+3);
  const routes=[];
  const pattern=/(?:^|,)\s*(?:'([^']+)'|"([^"]+)"|([\w-]+))\s*:\s*\['\.\/pages\/([^']+)'\s*,\s*'([^']+)'\]/gm;
  for(const match of block.matchAll(pattern))routes.push(match[1]||match[2]||match[3]);
  return routes;
}

test('visual module catalog covers every runtime pageRegistry route exactly once',()=>{
  const runtime=[...appRoutes()].sort();
  const catalog=[...MODULE_VISUAL_ROUTES].sort();
  assert.ok(runtime.length>=50,`expected a large ERP registry, got ${runtime.length}`);
  assert.deepEqual(catalog,runtime);
  assert.equal(new Set(MODULE_VISUAL_ROUTES).size,MODULE_VISUAL_ROUTES.length,'catalog has duplicate routes');
});

test('every catalog row has family, label and explicit risk priority',()=>{
  const priorities=new Set(['critical','high','medium','low']);
  for(const item of MODULE_VISUAL_CATALOG){
    assert.ok(item.route&&item.family&&item.label,JSON.stringify(item));
    assert.ok(priorities.has(item.priority),`${item.route}: invalid priority ${item.priority}`);
  }
  assert.ok(CRITICAL_VISUAL_ROUTES.includes('dashboard'));
  assert.ok(CRITICAL_VISUAL_ROUTES.includes('ventas'));
  assert.ok(CRITICAL_VISUAL_ROUTES.includes('contabilidad'));
  assert.ok(CRITICAL_VISUAL_ROUTES.includes('admin'));
  assert.ok(CRITICAL_VISUAL_ROUTES.includes('pos-sede'));
  assert.ok(CRITICAL_VISUAL_ROUTES.includes('veterinaria'));
  assert.ok(CRITICAL_VISUAL_ROUTES.includes('psicologia'));
  assert.ok(CRITICAL_VISUAL_ROUTES.includes('odontologia'));
});

test('visual viewport matrix includes narrow phones, tablet, laptop and desktop',()=>{
  assert.deepEqual(VISUAL_VIEWPORTS.map((item)=>item.width),[360,390,430,768,1024,1440]);
  for(const item of VISUAL_VIEWPORTS){
    assert.ok(item.height>=768,`${item.name}: height too small for deterministic audit`);
    assert.ok(item.name&&Number.isInteger(item.width));
  }
});

test('deep Playwright audit is wired to the canonical visual catalog',()=>{
  const source=read('qa/module-visual-deep-v12.spec.mjs');
  assert.match(source,/MODULE_VISUAL_CATALOG/);
  assert.match(source,/CRITICAL_VISUAL_ROUTES/);
  assert.match(source,/document-overflow/);
  assert.match(source,/action-overlap/);
  assert.match(source,/field-overlap/);
  assert.match(source,/metric-pseudo/);
  assert.match(source,/light\/dark changes color, never shared geometry/);
});

test('Windows visual QA gate runs source audit, contract, base and deep browser passes',()=>{
  const source=read('QA-VISUAL-CONTAGEST.ps1');
  for(const command of ['audit:visual','test:visual','test:browser:visual','test:browser:visual:deep'])assert.match(source,new RegExp(command.replaceAll(':','\\:')));
});
