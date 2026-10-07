import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MODULE_VISUAL_CATALOG, MODULE_VISUAL_ROUTES, CRITICAL_VISUAL_ROUTES, VISUAL_VIEWPORTS } from '../qa/support/module-visual-catalog.mjs';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

function appRoutes(){
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

test('visual module catalog covers every runtime pageRegistry route exactly once',()=>{
  const runtime=[...appRoutes()].sort();
  const catalog=[...MODULE_VISUAL_ROUTES].sort();
  assert.equal(runtime.length,59,'canonical ERP registry must expose 59 routes after sedes');
  assert.equal(catalog.length,59,'visual QA catalog must cover all 59 routes');
  assert.deepEqual(catalog,runtime);
  assert.equal(new Set(MODULE_VISUAL_ROUTES).size,MODULE_VISUAL_ROUTES.length,'catalog has duplicate routes');
  const sedes=MODULE_VISUAL_CATALOG.find((item)=>item.route==='sedes');
  assert.deepEqual(sedes,{route:'sedes',family:'admin',label:'Sedes',priority:'high'});
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

test('canonical Field and Select emit disabled/required semantics instead of dropping page intent',()=>{
  const kit=read('frontend/src/components/ui/kit.js');
  assert.match(kit,/export function Field\([^)]*disabled=false/);
  assert.match(kit,/export function Field\([^)]*ariaDescribedBy/);
  assert.match(kit,/\$\{disabled\?'disabled':''\}/);
  assert.match(kit,/export function Select\([^)]*required=false/);
  assert.match(kit,/export function Select\([^)]*disabled=false/);
  assert.match(kit,/\$\{required\?'required':''\}/);
});

test('sedes uses human address options and keeps AddressGeocode identifiers internal',()=>{
  const page=read('frontend/src/pages/BusinessLocationsPage.js');
  const service=read('frontend/src/services/businessLocationsService.js');
  const routes=read('backend/src/modules/business-locations/business-locations.routes.ts');
  assert.doesNotMatch(page,/AddressGeocode ID|UUID opcional/i);
  assert.match(page,/Direcci[oó]n/);
  assert.match(page,/businessLocationAddressOptions/);
  assert.match(service,/addressOptions/);
  assert.match(service,/\/business-locations\/address-options/);
  assert.match(routes,/router\.get\('\/address-options'/);
  assert.match(routes,/formattedAddress/);
  assert.match(routes,/tenantId:ctx\.tenantId/);
  assert.ok(routes.indexOf("router.get('/address-options'")<routes.indexOf("router.get('/:id'"),'address-options route must be declared before /:id');
});

test('canonical UI exposes loading/error/success/disabled states with accessible semantics',()=>{
  const kit=read('frontend/src/components/ui/kit.js');
  for(const name of ['LoadingState','ErrorState','SuccessState','DisabledState'])assert.match(kit,new RegExp(`export function ${name}\\(`));
  assert.match(kit,/data-cgx-state=\\"loading\\"/);
  assert.match(kit,/role=\\"status\\"/);
  assert.match(kit,/aria-live=\\"polite\\"/);
  assert.match(kit,/data-cgx-state=\\"error\\"/);
  assert.match(kit,/role=\\"alert\\"/);
  assert.match(kit,/data-cgx-state=\\"success\\"/);
  assert.match(kit,/data-cgx-state=\\"disabled\\"/);
});

test('accessibility gate applies the formal 200% zoom proxy to critical and high routes',()=>{
  const a11y=read('qa/accessibility-wcag22-v99.spec.mjs');
  const harness=read('qa/support/accessibility-harness-v99.mjs');
  assert.match(a11y,/\['critical','high'\]\.includes\(item\.priority\).*auditZoomProxy/);
  assert.match(harness,/proxy de zoom 200%/i);
  assert.match(harness,/Math\.floor\(original\.width \/ 2\)/);
});

test('operational motion remains restrained and reduced-motion stays a hard guard',()=>{
  const css=read('frontend/src/styles/contagest-visual-system-v12.css');
  const shell=read('frontend/src/styles/shell-contract.css');
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/scroll-snap-type\s*:\s*y\s+mandatory/i);
  assert.doesNotMatch(shell,/scroll-snap-type\s*:\s*y\s+mandatory/i);
});

test('browser route runner follows the 59-route catalog instead of hard-coding 58',()=>{
  const runner=read('scripts/erp-browser-58x5-v251.mjs');
  assert.match(runner,/MODULE_VISUAL_CATALOG\.length!==59/);
  assert.match(runner,/expected 59 routes/);
  assert.doesNotMatch(runner,/MODULE_VISUAL_CATALOG\.length!==58/);
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
