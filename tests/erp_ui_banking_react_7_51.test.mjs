import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const read=(path)=>fs.readFileSync(path,'utf8');

test('7/51 banking route points to React Cg/MUI renderer',()=>{
  assert.deepEqual(PAGE_REGISTRY.bancos,['./pages/BankingPage.jsx','BankingPage']);
  assert.equal(fs.existsSync('frontend/src/pages/BankingPage.js'),false);
});

test('7/51 banking has one React root and no imperative render lifecycle',()=>{
  const source=read('frontend/src/pages/BankingPage.jsx');
  assert.equal((source.match(/createRoot\(/g)||[]).length,1);
  for(const token of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgDataTable','CgMoney','CgState'])assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/components\/ui\/index\.js|escapeHtml|mountSubmit|qsa\(|querySelector|addEventListener|innerHTML|window\.confirm|window\.prompt/);
});

test('7/51 preserves banking movement reversal correction and reconciliation contracts',()=>{
  const source=read('frontend/src/pages/BankingPage.jsx');
  for(const token of [
    'BankingService.summary(','BankingService.createAccount(','BankingService.createMovement(','BankingService.reconcile(','BankingService.reverse(','BankingService.correct(',
    'BankReconciliationService.lines(','BankReconciliationService.imports(','BankReconciliationService.models(','BankReconciliationService.closingBalance(',
    'BankReconciliationService.candidates(','BankReconciliationService.history(','BankReconciliationService.reconcile(','BankReconciliationService.writeOff(',
    'BankReconciliationService.reverse(','BankReconciliationService.createModel(','BankReconciliationService.importStatement('
  ]) assert.ok(source.includes(token),token);
});

test('7/51 keeps exact reconciliation money, maker-checker and CSV protection',()=>{
  const source=read('frontend/src/pages/BankingPage.jsx');
  assert.match(source,/moneyCents/);
  assert.match(source,/minExactMoney/);
  assert.match(source,/approvalRequestId/);
  assert.match(source,/APPROVAL_REQUIRED/);
  assert.match(source,/csvCell/);
  assert.match(source,/^[\s\S]*?sourceHash/);
});

test('7/51 banking source audit fails closed on legacy regression',()=>{
  const audit=read('scripts/erp-ui-banking-audit-v751.mjs');
  assert.match(audit,/imperative banking lifecycle/i);
  assert.match(audit,/exactly one React root/i);
});
