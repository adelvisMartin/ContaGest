import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditErpParityMatrix } from '../scripts/audit-erp-parity-gap-v708.mjs';

const valid = JSON.parse(readFileSync(new URL('../config/erp-parity-gap-ownership-v708.json', import.meta.url), 'utf8'));

test('#708 canonical ERP matrix has exactly one owner per gap', () => {
  assert.deepEqual(auditErpParityMatrix(valid), []);
});

test('#708 missing owner cannot hide behind a duplicated owner', () => {
  const tampered = structuredClone(valid);
  tampered.rows[1].issue = tampered.rows[0].issue;
  const errors = auditErpParityMatrix(tampered);
  assert.ok(errors.includes('PARITY_OWNER_DUPLICATE'));
  assert.ok(errors.includes('PARITY_OWNER_MISSING'));
});

test('#708 non-array rows fail predictably instead of throwing', () => {
  for (const rows of [{}, 'invalid', null]) {
    assert.ok(auditErpParityMatrix({ ...valid, rows }).includes('PARITY_GAP_COVERAGE_INVALID'));
  }
});

test('#708 duplicate row keys are still denied', () => {
  const tampered = structuredClone(valid);
  tampered.rows[1].key = tampered.rows[0].key;
  assert.ok(auditErpParityMatrix(tampered).includes('PARITY_KEY_INVALID'));
});

test('#708 10k deterministic adversarial gap-owner mutations fail closed',()=>{
  const baseline=structuredClone(valid);
  baseline.rows=baseline.rows.map(row=>({...row,classification:'NOT_VERIFIED',evidencePath:null}));
  assert.deepEqual(auditErpParityMatrix(baseline),[]);
  for(let i=0;i<10000;i++){
    const sample=structuredClone(baseline);
    const index=i%sample.rows.length;
    if(i%3===0){
      sample.rows[index].issue=sample.rows[(index+1)%sample.rows.length].issue;
      const result=auditErpParityMatrix(sample);
      assert.ok(result.includes('PARITY_OWNER_DUPLICATE'));
      assert.ok(result.includes('PARITY_OWNER_MISSING'));
    }else if(i%3===1){
      sample.rows[index].key=sample.rows[(index+1)%sample.rows.length].key;
      assert.ok(auditErpParityMatrix(sample).includes('PARITY_KEY_INVALID'));
    }else{
      sample.rows[index].classification='VERIFIED';
      assert.ok(auditErpParityMatrix(sample).includes('PARITY_UNVERIFIED_GAP'));
    }
  }
});
