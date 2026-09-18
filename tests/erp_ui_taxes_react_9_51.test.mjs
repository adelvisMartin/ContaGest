import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const read=(path)=>fs.readFileSync(path,'utf8');

test('9/51 taxes route points to React Cg/MUI renderer',()=>{
  assert.deepEqual(PAGE_REGISTRY.tributos,['./pages/TaxesPage.jsx','TaxesPage']);
  assert.equal(fs.existsSync('frontend/src/pages/TaxesPage.js'),false);
});

test('9/51 taxes owns one React root and canonical primitives',()=>{
  const source=read('frontend/src/pages/TaxesPage.jsx');
  assert.equal((source.match(/createRoot\(/g)||[]).length,1);
  for(const token of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgDataTable','CgState'])assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/components\/ui\/index\.js|querySelector|addEventListener|innerHTML|mountSubmit/);
});

test('9/51 preserves local tax settings and server fiscal document authority',()=>{
  const source=read('frontend/src/pages/TaxesPage.jsx');
  for(const token of ['draft.quote.taxes','FiscalService.periods(','FiscalService.documents(','FiscalService.createDocument(','fiscal.manage_documents','status===403'])assert.ok(source.includes(token),token);
  assert.match(source,/JSON\.parse/);
  assert.match(source,/Array\.isArray/);
});

test('9/51 taxes audit fails closed on imperative lifecycle',()=>{
  const audit=read('scripts/erp-ui-taxes-audit-v951.mjs');
  assert.match(audit,/imperative taxes lifecycle/i);
  assert.match(audit,/exactly one React root/i);
});
