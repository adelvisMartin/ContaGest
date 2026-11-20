import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCamtDirection, signedCamtAmount } from '../backend/src/modules/bank-reconciliation/camt-direction.mjs';

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

test('#743 CAMT sign is consistent with credit/debit without double-negation',()=>{
  assert.equal(signedCamtAmount('23.25','CRDT'),'23.25');
  assert.equal(signedCamtAmount('23.25','DBIT'),'-23.25');
  assert.equal(signedCamtAmount('-23.25','DBIT'),'-23.25');
  assert.equal(signedCamtAmount('0.00','DBIT'),'0.00');
  for(const amount of ['-23.25','-0.00']) assert.throws(
    ()=>signedCamtAmount(amount,'CRDT'),{message:'BANK_STATEMENT_CAMT_AMOUNT_INVALID'}
  );
  for(const value of ['',null,undefined,100,'123e3','4.323','abc']) assert.throws(
    ()=>signedCamtAmount(value,'DBIT'),{message:'BANK_STATEMENT_CAMT_AMOUNT_INVALID'}
  );
});
test('#743 parser calls the domain CAMT amount validator',()=>{
  const parser=readFileSync(new URL('../backend/src/modules/bank-reconciliation/statement-parser.ts',import.meta.url),'utf8');
  assert.match(parser,/signedCamtAmount\(amountValue, indicator\)/);
  assert.match(parser,/BANK_STATEMENT_CAMT_AMOUNT_INVALID/);
});
