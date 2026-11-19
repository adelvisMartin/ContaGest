import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCamtDirection } from '../backend/src/modules/bank-reconciliation/camt-direction.mjs';

test('#743 CAMT CRDT/DBIT direction must be explicit',()=>{
  assert.equal(normalizeCamtDirection('crdt'),'CRDT');
  assert.equal(normalizeCamtDirection(' DBIT '),'DBIT');
});
test('#743 missing and unknown CAMT directions cannot default to credit',()=>{
  for(const v of ['', 'DIBT','CREDIT',null,undefined,0,'REVERSAL'])
    assert.throws(()=>normalizeCamtDirection(v),{message:'BANK_STATEMENT_DIRECTION_INVALID'});
});
test('#743 parser enforces direction before assigning signed amount',()=>{
  const parser=readFileSync(new URL('../backend/src/modules/bank-reconciliation/statement-parser.ts',import.meta.url),'utf8');
  assert.match(parser,/normalizeCamtDirection\(xmlText\(block,'CdtDbtInd'\)\)/);
  assert.match(parser,/BANK_STATEMENT_DIRECTION_INVALID/);
});
