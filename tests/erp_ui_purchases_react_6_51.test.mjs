import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const read=(path)=>fs.readFileSync(path,'utf8');

test('6/51 purchases route and payables panel use React renderers',()=>{
  assert.deepEqual(PAGE_REGISTRY.compras,['./pages/PurchasesPage.jsx','PurchasesPage']);
  assert.equal(fs.existsSync('frontend/src/pages/PurchasesPage.js'),false);
  assert.equal(fs.existsSync('frontend/src/components/payables/PayablesPanel.js'),false);
});

test('6/51 purchases owns one React root with canonical primitives',()=>{
  const source=read('frontend/src/pages/PurchasesPage.jsx');
  assert.equal((source.match(/createRoot\(/g)||[]).length,1);
  for(const token of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgDataTable','CgDialog','CgMoney','PayablesPanel'])assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/components\/ui\/index\.js|mountSubmit|querySelector|addEventListener|window\.confirm|window\.prompt|innerHTML/);
});

test('6/51 purchases preserves create fallback delete draft and audited cancellation',()=>{
  const source=read('frontend/src/pages/PurchasesPage.jsx');
  for(const token of ['SupabaseSyncService.pullPurchases(','SupabaseSyncService.createPurchase(','RuntimePolicy.handlePersistenceFailure(',"uid('pur')",'PurchaseOperationsService.deleteDraft(','PurchaseOperationsService.cancel('])assert.ok(source.includes(token),token);
});

test('6/51 payables preserves upload dedupe review reprocess reject and draft-only sync',()=>{
  const source=read('frontend/src/components/payables/PayablesPanel.jsx');
  for(const token of ['PayablesService.list(','PayablesService.upload(','PayablesService.openOriginal(','PayablesService.reprocess(','PayablesService.review(','PayablesService.reject(','SupabaseSyncService.pullPurchases('])assert.ok(source.includes(token),token);
  assert.match(source,/8\*1024\*1024/);
  assert.match(source,/requiredConfirmations/);
  assert.match(source,/purchaseOrder/);
  assert.match(source,/receipt/);
  assert.match(source,/borrador de compra/i);
  assert.doesNotMatch(source,/querySelector|addEventListener|window\.confirm|window\.prompt|innerHTML/);
});

test('6/51 purchase audit fails closed on mixed imperative lifecycle',()=>{
  const audit=read('scripts/erp-ui-purchases-audit-v651.mjs');
  assert.match(audit,/imperative purchases lifecycle/i);
  assert.match(audit,/imperative payables lifecycle/i);
});
