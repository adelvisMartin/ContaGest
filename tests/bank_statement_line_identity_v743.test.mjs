import test from 'node:test';
import assert from 'node:assert/strict';
import { statementImportLineHash } from '../backend/src/modules/bank-reconciliation/statement-line-identity.ts';

const A='a'.repeat(64), B='b'.repeat(64), C='c'.repeat(64);
const base={canonicalLineHash:A, sourceHash:B, rowIndex:0, bankLineId:null};
const hash=patch=>statementImportLineHash({...base,...patch});

test('#743 identical real rows without bank IDs retain distinct identities',()=>{
  assert.notEqual(hash({rowIndex:0}),hash({rowIndex:1}));
  assert.match(hash({rowIndex:1}),/^[a-f0-9]{64}$/);
});
test('#743 retry of same extract and row is deterministic',()=>{
  assert.equal(hash({rowIndex:13}),hash({rowIndex:13}));
});
test('#743 overlapping exports without bank ID cannot masquerade as same imported source',()=>{
  assert.notEqual(hash({sourceHash:B}),hash({sourceHash:C}));
  assert.notEqual(hash({canonicalLineHash:A}),hash({canonicalLineHash:C}));
});
test('#743 bank-provided line IDs preserve original fingerprint/DB unique index semantics',()=>{
  assert.equal(hash({bankLineId:'FITID-1',rowIndex:3}),A);
  assert.equal(hash({bankLineId:'FITID-1',rowIndex:4}),A);
});
test('#743 invalid source fingerprints, ordinals and bank IDs fail closed',()=>{
  for(const p of [{sourceHash:'a'}, {sourceHash:A.toUpperCase()}, {canonicalLineHash:'bad'},
                  {rowIndex:-1}, {rowIndex:1.5}, {rowIndex:100_000},
                  {rowIndex:Number.MAX_SAFE_INTEGER+1}, {bankLineId:''},
                  {bankLineId:{toString:()=> 'x'}}]) {
    assert.throws(()=>hash(p),{message:'BANK_STATEMENT_LINE_IDENTITY_INVALID'});
  }
});
