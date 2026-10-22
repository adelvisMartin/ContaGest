import test from 'node:test';
import assert from 'node:assert/strict';
import {projectOpenItemCoverage} from '../backend/src/modules/accounting/open-item-coverage.ts';
const rows=[
 {id:'b',tenantId:'T1',number:'F-002',status:'paid',issueDate:'2026-09-15T10:00:00.000Z',currency:'VES',totalExact:'100.00'},
 {id:'a',tenantId:'T1',number:'F-001',status:'overdue',issueDate:'2026-09-01T10:00:00.000Z',currency:'USD',totalExact:'25.25'}
];
const q={tenantId:'T1',kind:'ar',asOf:'2026-10-16',invoices:rows};
const fail=fn=>assert.throws(fn,{message:'SUBLEDGER_COVERAGE_EVIDENCE_INVALID'});
test('#744 stable sha regardless of DB iteration order',()=>{
 const a=projectOpenItemCoverage(q),b=projectOpenItemCoverage({...q,invoices:[...rows].reverse()});
 assert.equal(a.evidenceSha256,b.evidenceSha256);assert.equal(a.documents[0].sourceId,'a');
});
test('#744 paid and overdue labels cannot replace allocation/due date evidence',()=>{
 const a=projectOpenItemCoverage(q);
 assert.equal(a.status,'NOT_RECONCILABLE');assert.equal(a.authoritativeOpenBalance,false);
 assert.equal(a.documents[0].openBalanceExact,null);assert.equal(a.documents[1].daysOverdue,null);
 assert.ok(a.blockers.includes('PAYMENT_ALLOCATIONS_NOT_AVAILABLE'));
});
test('#744 fail-closed cross-tenant id and duplicate document source',()=>{
 fail(()=>projectOpenItemCoverage({...q,invoices:[{...rows[0],tenantId:'T2'}]}));
 fail(()=>projectOpenItemCoverage({...q,invoices:[rows[0],rows[0]]}));
});
test('#744 rejects invalid dates, currency, statuses and decimal errors',()=>{
 fail(()=>projectOpenItemCoverage({...q,asOf:'2026-02-30'}));
 fail(()=>projectOpenItemCoverage({...q,invoices:[{...rows[0],issueDate:'2026-02-30T10:00:00.000Z'}]}));
 fail(()=>projectOpenItemCoverage({...q,invoices:[{...rows[0],status:'unknown'}]}));
 fail(()=>projectOpenItemCoverage({...q,invoices:[{...rows[0],currency:'invalid'}]}));
 fail(()=>projectOpenItemCoverage({...q,invoices:[{...rows[0],totalExact:'1e10'}]}));
});
test('#744 tenant/book and asOf are part of SHA boundary',()=>{
 const a=projectOpenItemCoverage(q);
 assert.notEqual(a.evidenceSha256,projectOpenItemCoverage({...q,kind:'ap'}).evidenceSha256);
 assert.notEqual(a.evidenceSha256,projectOpenItemCoverage({...q,asOf:'2026-10-17'}).evidenceSha256);
});
test('#744 empty period is not mistaken for reconciled account',()=>{
 const a=projectOpenItemCoverage({...q,invoices:[]});
 assert.equal(a.sourceCount,0);assert.equal(a.status,'NOT_RECONCILABLE');
 assert.ok(Object.isFrozen(a.documents));
});
test('#744 future issue dates cannot appear in an as-of period',()=>{
 fail(()=>projectOpenItemCoverage({...q,invoices:[{...rows[0],issueDate:'2026-10-17T00:00:00.000Z'}]}));
});

test('#744 never accepts negative, leading-zero or Decimal(18,2)-overflow invoice totals as reconcilable evidence',()=>{
  for (const totalExact of ['-0.01','-0','-10.00','01.00','99999999999999999.99','10000000000000000.00']) {
    fail(()=>projectOpenItemCoverage({...q,invoices:[{...rows[0],totalExact}]}));
  }
  const accepted=projectOpenItemCoverage({...q,invoices:[{...rows[0],totalExact:'9999999999999999.99'}]});
  assert.equal(accepted.documents[0].sourceTotalExact,'9999999999999999.99');
  assert.equal(accepted.authoritativeOpenBalance,false);
});
