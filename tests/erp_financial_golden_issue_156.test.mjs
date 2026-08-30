import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateGoldenDataset, loadGoldenDataset, roundMinorUnits, sumLedger, dedupeEntries } from '../qa/erp-financial-golden-v156.mjs';

test('golden dataset is synthetic and all invariants pass',()=>{
  const data=loadGoldenDataset();
  const result=evaluateGoldenDataset(data);
  assert.equal(data.synthetic,true);
  assert.equal(data.fiscalRates.source,'SYNTHETIC_TEST_ONLY');
  assert.equal(result.pass,true,JSON.stringify(result.checks.filter((item)=>!item.pass)));
});

test('cent rounding is deterministic half-up without binary float arithmetic',()=>{
  assert.equal(roundMinorUnits('10.004'),1000);
  assert.equal(roundMinorUnits('10.005'),1001);
  assert.equal(roundMinorUnits('0.999'),100);
  assert.equal(roundMinorUnits('-1.005'),-101);
});

test('ledger balances and idempotency de-dupes replays',()=>{
  const data=loadGoldenDataset();
  const once=dedupeEntries(data.ledgerEntries);
  const replayed=dedupeEntries([...data.ledgerEntries,...data.ledgerEntries]);
  assert.equal(replayed.length,once.length);
  assert.deepEqual(sumLedger(replayed),sumLedger(once));
  assert.equal(sumLedger(once).balanced,true);
});

test('tampering with a monetary expectation is detected',()=>{
  const data=loadGoldenDataset();
  data.bank.expectedClosingCents+=1;
  const result=evaluateGoldenDataset(data);
  assert.equal(result.pass,false);
  assert.equal(result.checks.find((item)=>item.id==='bank.closing')?.pass,false);
});
