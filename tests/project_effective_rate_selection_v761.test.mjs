import test from 'node:test';
import assert from 'node:assert/strict';
import {selectEffectiveRateForApprovedTime as select} from '../backend/src/modules/projects/project-effective-rate-selection.ts';
const ids=['cb0054f7-ef51-4580-888a-087701fca814','130849ad-a46d-5adb-a286-2774fd36bfac','bd24f62c-54f7-4c84-918a-df3ef1d6eaf0','9236ec7b-5eaf-44c2-9526-6b8ebce8d58e','d04e6b97-539c-5a63-91b7-7e02fd5c929a','2e01330b-5d9b-5f71-8b1f-83c065c0c9ad','5ee1ef27-07ab-5b54-a58d-49ce038f4b53'];
const [tenantId,projectId,clientId,memberId,entryId,card1,card2]=ids;
const E=()=>({id:entryId,tenantId,projectId,clientId,memberId,status:'approved',revision:2,startedAtUtc:'2026-10-15T12:00:00.000Z',endedAtUtc:'2026-10-15T13:00:00.000Z',billable:false,linkedInvoiceId:null});
const C=(revision=1,effectiveFromUtc='2026-10-01T00:00:00.000Z')=>({id:revision===1?card1:card2,tenantId,projectId,clientId,memberId,revision,status:'fixed',hourlyRateExact:'100.25',currency:'USD',effectiveFromUtc});
const s=(entry=E(),cards=[C()])=>select({tenantId,entry,cards});
test('choose latest effective immutable revision independently of input order',()=>{const c2=C(2,'2026-10-10T00:00:00.000Z');assert.equal(s(E(),[c2,C()]).rateCardRevision,2);assert.equal(s(E(),[c2,C()]).rateCardId,card2)});
test('return no financial authority nor persistence',()=>{const x=s();assert.equal(x.billableAuthorized,false);assert.equal(x.invoiceAuthorized,false);assert.equal(x.persisted,false);assert.equal(Object.isFrozen(x),true);assert.equal(x.hourlyRateExact,'100.25')});
test('reject draft, submitted, paid, linked invoices and missing revision',()=>{for(const patch of [{status:'draft'},{status:'submitted'},{billable:true},{linkedInvoiceId:card1},{revision:1}])assert.throws(()=>s({...E(),...patch}))});
test('reject tenant, client, project, member mismatches',()=>{for(const prop of ['tenantId','clientId','projectId','memberId'])assert.throws(()=>s(E(),[{...C(),[prop]:card2}]))});
test('reject missing rate and future-only rate',()=>{assert.throws(()=>s(E(),[]),/NO_EFFECTIVE/);assert.throws(()=>s(E(),[C(1,'2026-10-16T00:00:00.000Z')]),/NO_EFFECTIVE/)});
test('reject mid-entry rate change rather than price a split interval incorrectly',()=>{assert.throws(()=>s(E(),[C(),C(2,'2026-10-15T12:30:00.000Z')]),/SPLIT_INTERVAL/)});
test('future rate starting exactly at end is not part of the time interval',()=>{assert.equal(s(E(),[C(),C(2,'2026-10-15T13:00:00.000Z')]).rateCardRevision,1)});
test('reject repeated revision and equal effective timestamp',()=>{assert.throws(()=>s(E(),[C(),{...C(),id:card2}]),/REVISION/);assert.throws(()=>s(E(),[C(),C(2)]),/AMBIGUOUS/)});
test('reject revisions with holes or time traveling effectivity',()=>{assert.throws(()=>s(E(),[C(),C(3,'2026-10-10T00:00:00.000Z')]),/HISTORY/);assert.throws(()=>s(E(),[C(),C(2,'2026-09-01T00:00:00.000Z')]),/HISTORY/)});
test('reject currency changes and unsafe price precision',()=>{assert.throws(()=>s(E(),[C(),{...C(2,'2026-10-10T00:00:00.000Z'),currency:'EUR'}]),/CURRENCY/);for(const hourlyRateExact of ['0.00','1.222','1e3',0])assert.throws(()=>s(E(),[{...C(),hourlyRateExact}]),/MONEY/)});
test('reject malformed UTC, invalid intervals and more than 1024 versions',()=>{assert.throws(()=>s({...E(),startedAtUtc:'2026-10-15T12:00:00-04:00'}));assert.throws(()=>s({...E(),endedAtUtc:E().startedAtUtc}),/INTERVAL/);assert.throws(()=>s(E(),Array(1025).fill(C())),/TOO_MANY/)});
test('reject forged rate status and tenant parameter',()=>{assert.throws(()=>s(E(),[{...C(),status:'draft'}]));assert.throws(()=>select({tenantId:card1,entry:E(),cards:[C()]}))});

test('accept actual RFC4122 36-character tenant/project/client/member/card IDs',()=>{
  for(const id of [tenantId,projectId,clientId,memberId,entryId,card1,card2]){
    assert.equal(id.length,36);
  }
  const selected=s();
  assert.equal(selected.tenantId,tenantId);
  assert.equal(selected.entryId,entryId);
  assert.equal(selected.rateCardId,card1);
});
test('reject truncated 32-character, invalid variant and malformed source IDs',()=>{
  const shortened=tenantId.replace('-888a-','-8');
  assert.throws(()=>s({...E(),tenantId:shortened}),/PROJECT_RATE_SELECT_ID_INVALID/);
  assert.throws(()=>s({...E(),projectId:projectId.replace('-a286-','-0286-')}),/PROJECT_RATE_SELECT_ID_INVALID/);
  assert.throws(()=>s(E(),[{...C(),id:card1.slice(0,32)}]),/PROJECT_RATE_SELECT_ID_INVALID/);
});
