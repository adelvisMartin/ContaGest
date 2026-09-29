import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { characterizeDataset, FAILURE_CODES, injectFailure, reconcileEffects, validateGoldenDataset } from '../scripts/accounting-reconciliation-v643.mjs';

const dataset=JSON.parse(fs.readFileSync('qa/fixtures/accounting-characterization-v643.json','utf8'));
const read=(file)=>fs.readFileSync(file,'utf8');

test('v643 golden dataset is synthetic, versioned and spans the transversal financial flow',()=>{
  assert.doesNotThrow(()=>validateGoldenDataset(dataset));
  const result=characterizeDataset(dataset);
  assert.equal(result.reconciliation.status,'PASS');
  assert.equal(result.reconciliation.debitMinor,result.reconciliation.creditMinor);
  for(const scenario of ['sale-tax','purchase-payable','collection-banking','supplier-payment-banking','sale-return-reversal','duplicate-retry-concurrency','period-close','document-ledger-source-identity','module-total-ledger-reconciliation','tenant-a-b-isolation'])assert.ok(result.scenarios.includes(scenario),scenario);
  for(const invariant of ['DEBIT_EQUALS_CREDIT','ONE_LOGICAL_SOURCE_ONE_EFFECT','DECIMAL_STABLE','BALANCE_RECONSTRUCTABLE','POSTED_HISTORY_IMMUTABLE','NO_ORPHAN_LEDGER_SOURCE','TENANT_ISOLATED'])assert.ok(result.invariants.includes(invariant),invariant);
});

test('duplicate, unbalanced, orphan and posted-mutation fixtures fail closed with explicit findings',()=>{
  const expected={
    'duplicate-effect':FAILURE_CODES.DUPLICATE_EFFECT,
    'unbalanced-entry':FAILURE_CODES.UNBALANCED_ENTRY,
    'orphan-source':FAILURE_CODES.ORPHAN_SOURCE,
    'posted-mutation':FAILURE_CODES.POSTED_MUTATION,
  };
  for(const [fixture,code] of Object.entries(expected)){
    const result=reconcileEffects(injectFailure(dataset,fixture).goldenEffects);
    assert.equal(result.status,'FAIL',fixture);
    assert.ok(result.findings.some((finding)=>finding.code===code),`${fixture}:${code}`);
  }
});

test('real PostgreSQL adapter covers document→ledger→bank/inventory→reversal→close→tenant flow',()=>{
  const source=read(dataset.realPostgresAdapter);
  assert.match(source,/createRealBackendHarness/);
  assert.match(source,/Promise\.all\(/,'concurrent duplicate retry must be characterized');
  assert.match(source,/sale-ledger-source/);
  assert.match(source,/purchase-ledger-source/);
  assert.match(source,/collection-ledger-link/);
  assert.match(source,/payment-ledger-link/);
  assert.match(source,/sale-return-reversal-link/);
  assert.match(source,/ledger-period-balanced/);
  assert.match(source,/closed-period-no-sale-ledger/);
  assert.match(source,/closed-period-no-purchase-ledger/);
  assert.match(source,/tenant A->tenant B isolation/);
  assert.match(source,/tenant B->tenant A isolation/);
  assert.match(source,/retry-no-duplicate-sale-ledger/);
  assert.match(source,/retry-no-duplicate-purchase-ledger/);
  assert.match(source,/financial-reconciliation-\$\{sha\}\.json/);
});

test('v559 source fixture remains explicit money characterization, not production-rate data',()=>{
  const fixture=JSON.parse(read(dataset.sourceFixture));
  assert.equal(fixture.issue,559);
  assert.equal(fixture.currency,'VES');
  assert.equal(fixture.sale.total,'232.00');
  assert.equal(fixture.purchase.total,'139.20');
  assert.equal(fixture.bank.expectedEndingBalance,'92.80');
  assert.equal(fixture.inventory.expectedEndingStock,'11.000');
});

test('Local Verification financial/full and authoritative contracts consume v643 without duplicating the real PG flow',()=>{
  const runner=read('scripts/local-verification-runner-v630.mjs');
  const authoritative=read('scripts/run-authoritative-contracts.mjs');
  assert.match(runner,/financial-accounting-characterization-v643/);
  assert.match(runner,/test:backend:financial:reconciliation:real/);
  assert.match(authoritative,/accounting_characterization_reconciliation_issue_643\.test\.mjs/);
});
