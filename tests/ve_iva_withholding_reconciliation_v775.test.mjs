import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileVatWithholdingApplications} from '../backend/src/modules/fiscal/ve-iva-withholding-reconciliation.ts';
const row={id:'event1',tenantId:'T',purchaseInvoiceId:'p1',status:'POSTED',purchaseStatus:'issued',sourceLedgerPosted:true,ledgerEntryId:'L1',ledgerPosted:true,ledgerSourceId:'event1',reversalLedgerEntryId:null,reversalLedgerPosted:null,reversalOfId:null,reversalLinesInverse:false,withheldMinor:'1200',postedDebitMinor:'1200',postedCreditMinor:'1200',reversalDebitMinor:'0',reversalCreditMinor:'0',evidenceValid:true};
const run=(rows)=>reconcileVatWithholdingApplications('T','2099-01',rows);
test('posted invoice exactly reconciles AP debit and withholding payable credit',()=>{const result=run([row]);assert.equal(result.status,'RECONCILED_INTERNAL_ONLY');assert.equal(result.netOutstandingMinor,'1200');assert.equal(result.officialCertificateVerified,false);});
test('reversal cancels outstanding without mutating original history',()=>{const reversed={...row,status:'REVERSED',purchaseStatus:'cancelled',reversalLedgerEntryId:'L2',reversalLedgerPosted:true,reversalOfId:'L1',reversalLinesInverse:true,reversalDebitMinor:'1200',reversalCreditMinor:'1200'};const r=run([reversed]);assert.equal(r.netOutstandingMinor,'0');assert.equal(r.reversedMinor,'1200');assert.equal(r.issueCount,0);});
test('defective amounts, provenance, source posting, duplicate ids and cross tenants fail closed',()=>{for(const change of [{postedCreditMinor:'1100'},{evidenceValid:false},{sourceLedgerPosted:false},{tenantId:'B'},{purchaseStatus:'cancelled'}]){const r=()=>run([{...row,...change}]);if(change.tenantId)assert.throws(r,/RETIVA_INTERNAL_RECONCILIATION_INVALID/);else assert.equal(r().status,'BLOCKED_INTERNAL_RECONCILIATION');}assert.throws(()=>run([row,row]),/RETIVA_INTERNAL_RECONCILIATION_INVALID/);});
test('reversal cannot be considered reconciled without linking original or balancing amounts',()=>{for(const change of [{reversalLedgerEntryId:null},{reversalOfId:'wrong'},{reversalDebitMinor:'1000'},{reversalLedgerPosted:false}]){const r=run([{...row,status:'REVERSED',reversalLedgerEntryId:'L2',reversalLedgerPosted:true,reversalOfId:'L1',reversalLinesInverse:true,reversalDebitMinor:'1200',reversalCreditMinor:'1200',...change}]);assert.equal(r.status,'BLOCKED_INTERNAL_RECONCILIATION');}});

test('zero applications is blocked, never misreported as legally reconciled',()=>{
  assert.equal(run([]).status,'BLOCKED_EMPTY_PERIOD');
});
test('equal debit and credit totals do not prove reversal line direction',()=>{
  const r=run([{...row,status:'REVERSED',reversalLedgerEntryId:'L2',
    reversalLedgerPosted:true,reversalOfId:'L1',reversalLinesInverse:false,
    reversalDebitMinor:'1200',reversalCreditMinor:'1200'}]);
  assert.equal(r.status,'BLOCKED_INTERNAL_RECONCILIATION');
  assert.ok(r.rows[0].blockingIssues.includes('REVERSAL_LINES_NOT_INVERSE'));
});
