import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareProjectTimeReviewIntent, PROJECT_TIME_REVIEW_INTENT_VERSION,
  PROJECT_TIME_REVIEW_STATES } from '../backend/src/modules/projects/time-entry-review-intent.ts';

const fixture = (overrides={}) => ({
  tenantId:'tenant-a', expectedRevision:5, action:'submit',
  entry:{id:'entry-a',tenantId:'tenant-a',projectId:'project-a',memberId:'member-a',
    state:'draft',revision:5,linkedInvoiceId:null},
  actor:{id:'member-a',tenantId:'tenant-a',canReviewTime:false},
  ...overrides
});
const submit=()=>prepareProjectTimeReviewIntent(fixture());
const submitted=(overrides={})=>fixture({
  action:'approve',entry:{...fixture().entry,state:'submitted'},
  actor:{id:'manager-a',tenantId:'tenant-a',canReviewTime:true},...overrides
});
const reject=(input,code)=>assert.throws(()=>prepareProjectTimeReviewIntent(input),new RegExp(code));

test('#761 submit generates a versioned immutable intent, not persisted approval',()=>{
  const decision=submit();
  assert.equal(decision.version,PROJECT_TIME_REVIEW_INTENT_VERSION);
  assert.equal(decision.previousState,'draft');
  assert.equal(decision.proposedState,'submitted');
  assert.equal(decision.expectedRevision,5);
  assert.equal(decision.proposedRevision,6);
  assert.equal(decision.requiresAtomicTenantScopedCompareAndSwap,true);
  assert.equal(decision.persisted,false);
  assert.equal(decision.billableAuthorized,false);
  assert.equal(decision.invoiceAuthorized,false);
  assert.equal(Object.isFrozen(decision),true);
});
test('#761 only member can submit, withdraw, revise own time',()=>{
  reject(fixture({actor:{id:'other',tenantId:'tenant-a',canReviewTime:true}}), 'FORBIDDEN');
  const withdrawn=prepareProjectTimeReviewIntent(fixture({action:'withdraw',entry:{...fixture().entry,state:'submitted'}}));
  assert.equal(withdrawn.proposedState,'draft');
  const revised=prepareProjectTimeReviewIntent(fixture({action:'revise',entry:{...fixture().entry,state:'rejected'}}));
  assert.equal(revised.proposedState,'draft');
  reject(fixture({action:'revise'}), 'TRANSITION_INVALID');
});
test('#761 independent reviewer can approve only submitted entries',()=>{
  const approved=prepareProjectTimeReviewIntent(submitted());
  assert.equal(approved.proposedState,'approved');
  assert.equal(approved.invoiceAuthorized,false);
  assert.equal(approved.persisted,false);
});
test('#761 independent reviewer can reject submitted entries',()=>{
  const decided=prepareProjectTimeReviewIntent(submitted({action:'reject'}));
  assert.equal(decided.proposedState,'rejected');
});
test('#761 reject self-approval and self-rejection despite claimed reviewer grant',()=>{
  for(const action of ['approve','reject']){
    reject(submitted({action,actor:{id:'member-a',tenantId:'tenant-a',canReviewTime:true}}),'FORBIDDEN');
  }
});
test('#761 reject absent reviewer grant and string-forged permission',()=>{
  for(const canReviewTime of [false,'true',null,1]){
    reject(submitted({actor:{id:'manager-a',tenantId:'tenant-a',canReviewTime}}),
      canReviewTime===false?'FORBIDDEN':'PRINCIPAL_INVALID');
  }
});
test('#761 cross-tenant principal or entry never reaches transition',()=>{
  reject(submitted({actor:{id:'manager-a',tenantId:'tenant-b',canReviewTime:true}}),'SCOPE_MISMATCH');
  reject(submitted({entry:{...submitted().entry,tenantId:'tenant-b'}}),'SCOPE_MISMATCH');
  reject(submitted({tenantId:'tenant-b'}),'SCOPE_MISMATCH');
});
test('#761 stale expected revision rejects duplicate retry and stale edits',()=>{
  reject(fixture({expectedRevision:4}),'STALE_REVISION');
  reject(fixture({expectedRevision:6}),'STALE_REVISION');
  const first=submit();
  assert.equal(first.proposedRevision,6);
  // A transaction that won revision=6 makes old retries invalid.
  reject(fixture({entry:{...fixture().entry,revision:6}}),'STALE_REVISION');
});
test('#761 reject invalid, negative, nonintegral or overflowing revisions',()=>{
  for(const revision of [0,-1,2.5,NaN,Number.MAX_SAFE_INTEGER]){
    reject(fixture({entry:{...fixture().entry,revision},expectedRevision:revision}), 'REVISION_INVALID');
  }
});
test('#761 financially linked entries reject all review actions',()=>{
  for(const action of ['submit','withdraw','approve','reject','revise']){
    reject(fixture({action,entry:{...fixture().entry,linkedInvoiceId:'invoice-42'}}), 'FINANCIALLY_LOCKED');
  }
});
test('#761 approved entries are terminal even with reviewer privileges',()=>{
  for(const action of ['submit','withdraw','approve','reject','revise']){
    reject(submitted({action,entry:{...fixture().entry,state:'approved'}}),'TRANSITION_INVALID');
  }
});
test('#761 reject invalid states and unknown actions',()=>{
  assert.deepEqual([...PROJECT_TIME_REVIEW_STATES],['draft','submitted','rejected','approved']);
  for(const state of ['paid','invoiced','',null]){
    reject(fixture({entry:{...fixture().entry,state}}),'STATE_INVALID');
  }
  for(const action of ['pay','bill','__proto__',null]){
    reject(fixture({action}),'ACTION_INVALID');
  }
});
test('#761 validate owner/tenant/project/member references',()=>{
  for(const id of ['', 'a/b', '../admin', null, 3]){
    reject(fixture({entry:{...fixture().entry,id}}),'REFERENCE_INVALID');
    reject(fixture({actor:{...fixture().actor,id}}),'REFERENCE_INVALID');
  }
});
test('#761 no rate/ledger/invoice actions or secret fields are returned',()=>{
  const input=submitted();
  const before=JSON.stringify(input);
  const result=prepareProjectTimeReviewIntent(input);
  assert.equal(JSON.stringify(input),before,'pure policy must not mutate input');
  assert.deepEqual(Object.keys(result).sort(),[
    'version','tenantId','entryId','projectId','actorId','action','expectedRevision',
    'proposedRevision','previousState','proposedState','requiresAtomicTenantScopedCompareAndSwap',
    'persisted','billableAuthorized','invoiceAuthorized'
  ].sort());
  assert.equal(result.invoiceAuthorized,false);
});
