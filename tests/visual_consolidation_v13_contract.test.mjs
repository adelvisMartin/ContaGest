import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MODULE_VISUAL_ROUTES } from '../qa/support/module-visual-catalog.mjs';

const root=process.cwd();
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');
const stylesDir=path.join(root,'frontend','src','styles');
const expectedStyles=[
  'contagest-visual-system-v12.css',
  'erp-runtime.css',
  'module-adapters.css',
  'runtime-primitives-v13.css',
  'shell-contract.css',
  'shell-stability-v1127.css'
].sort();

function pageRoutes(){
  const source=read('frontend','src','app.js');
  const start=source.indexOf('const pageRegistry={');
  const end=source.indexOf('\n};',start);
  assert.ok(start>=0&&end>start,'pageRegistry debe existir');
  const block=source.slice(start,end+3),routes=[];
  const pattern=/(?:^|,)\s*(?:'([^']+)'|"([^"]+)"|([\w-]+))\s*:\s*\['\.\/pages\/([^']+)'\s*,\s*'([^']+)'\]/gm;
  for(const match of block.matchAll(pattern))routes.push(match[1]||match[2]||match[3]);
  return routes.sort();
}

function importsOf(source){return[...source.matchAll(/@import\s+(?:url\()?['"]([^'"]+\.css)['"]/g)].map((match)=>match[1]);}

test('styles directory contains only the six v13 pillars',()=>{
  const entries=fs.readdirSync(stylesDir,{withFileTypes:true});
  const files=entries.filter((entry)=>entry.isFile()&&entry.name.endsWith('.css')).map((entry)=>entry.name).sort();
  const dirs=entries.filter((entry)=>entry.isDirectory()).map((entry)=>entry.name);
  assert.deepEqual(files,expectedStyles);
  assert.equal(dirs.includes('legacy'),false,'styles/legacy no puede reaparecer');
});

test('erp-runtime imports only the approved pillars in deterministic order',()=>{
  const imports=importsOf(read('frontend','src','styles','erp-runtime.css'));
  assert.deepEqual(imports,[
    './shell-contract.css',
    './shell-stability-v1127.css',
    './runtime-primitives-v13.css',
    './module-adapters.css',
    './contagest-visual-system-v12.css'
  ]);
});

test('all application routes are covered by the visual QA catalog',()=>{
  assert.deepEqual(pageRoutes(),[...MODULE_VISUAL_ROUTES].sort());
  assert.equal(MODULE_VISUAL_ROUTES.length,58);
});

test('global theme runtime is strictly light or dark',()=>{
  const catalog=read('frontend','src','data','themeCatalog.js');
  const app=read('frontend','src','app.js');
  const store=read('frontend','src','state','store.js');
  const retired=['sector','enterprise','executive','finance','sky','soft-blue','spectrum','ocean','forest','celestial'];
  for(const theme of retired){
    assert.equal(new RegExp(`key:'${theme}'`).test(catalog),false,`themeCatalog todavía declara ${theme}`);
    assert.equal(new RegExp(`['"]${theme}['"]`).test(app),false,`app runtime todavía contiene ${theme}`);
  }
  assert.match(app,/function applyTheme\(theme\)\{const normalized=theme==='dark'\?'dark':'light'/);
  assert.match(store,/OFFICIAL_THEMES\s*=\s*new Set\(\['light','dark'\]\)/);
});

test('Healthcare is human-only and Veterinary has one dedicated route',()=>{
  const app=read('frontend','src','app.js');
  const health=read('frontend','src','pages','HealthcarePage.js');
  assert.match(app,/veterinaria:\['\.\/pages\/VeterinaryClinicPageV1123\.jsx','VeterinaryClinicPage'\]/);
  assert.doesNotMatch(health,/animal\s*\?/);
  assert.doesNotMatch(health,/kind:\s*'animal'/);
  assert.doesNotMatch(health,/careImmunizationForm/);
  assert.match(health,/MetricGrid/);
  assert.match(health,/DataTable/);
  assert.match(health,/Section/);
});

test('Ledger uses canonical primitives and isolates print-only CSS',()=>{
  const ledger=read('frontend','src','pages','LedgerPage.js');
  assert.match(ledger,/MetricGrid/);
  assert.match(ledger,/Section/);
  assert.match(ledger,/Table/);
  assert.match(ledger,/<style data-cg-print-only>/);
  const runtime=ledger.replace(/<style\b[^>]*data-cg-print-only[^>]*>[\s\S]*?<\/style>/gi,'');
  assert.doesNotMatch(runtime,/<style\b/);
});

test('Admin/RBAC and Gym domain geometry live only in tokenized module adapters',()=>{
  const adapters=read('frontend','src','styles','module-adapters.css');
  assert.match(adapters,/cg-rbac-permission-grid/);
  assert.match(adapters,/cg-admin-monitor-grid/);
  assert.match(adapters,/cg-gym-v1124-grid/);
  assert.match(adapters,/cg-gym-v1124-form/);
  assert.doesNotMatch(adapters,/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i);
  assert.doesNotMatch(adapters,/(?:linear|radial|conic)-gradient\s*\(/i);
});

test('no page imports a stylesheet directly',()=>{
  const pagesDir=path.join(root,'frontend','src','pages');
  for(const entry of fs.readdirSync(pagesDir,{withFileTypes:true})){
    if(!entry.isFile()||!/[.](?:js|jsx)$/.test(entry.name))continue;
    const source=fs.readFileSync(path.join(pagesDir,entry.name),'utf8');
    assert.doesNotMatch(source,/import\s+[^;]*['"][^'"]+[.]css['"]/,`${entry.name} importa CSS directamente`);
  }
});

test('v13 source auditor understands print-only isolation and structural gates',()=>{
  const audit=read('scripts','visual-system-audit.mjs');
  assert.match(audit,/data-cg-print-only/);
  assert.match(audit,/CANONICAL_STYLE_FILES/);
  assert.match(audit,/ALLOWED_RUNTIME_IMPORTS/);
  assert.match(audit,/auditCriticalMigrations/);
  assert.match(audit,/parityAudit/);
});
