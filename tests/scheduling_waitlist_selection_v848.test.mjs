import assert from 'node:assert/strict';
import test from 'node:test';
import { selectWaitlistOffer, WaitlistSelectionError } from '../backend/src/modules/scheduling/waitlist-offer-selection.ts';
const NOW = '2026-10-15T12:00:00.000Z';
const policy = (overrides={}) => ({
  tenantRevision: 'tenant-r2', serviceRevision: 'service-r3', resolvedAtUtc: NOW,
  values: { waitlistEnabled: true, waitlistOfferTtlMinutes: 60, ...overrides }
});
const entry = (id='a', overrides={}) => ({
  id, tenantId: 'tenant-A', locationId: 'loc-A', sessionId: 'session-A',
  joinedAtUtc:'2026-10-15T11:00:00.000Z',version:1,status:'waiting',eligibility:'eligible',...overrides
});
const input = (overrides={}) => ({
  tenantId:'tenant-A', locationId:'loc-A',sessionId:'session-A',nowUtc:NOW,
  availableCapacity:1, policy:policy(), entries:[entry()],...overrides
});
const fail = f => assert.throws(f,e=>e instanceof WaitlistSelectionError && e.code==='SCHEDULING_WAITLIST_INPUT_INVALID');
test('earliest eligible waiting gets advisory offer with policy revision and expiry',()=>{
  assert.deepEqual(selectWaitlistOffer(input()),{
    action:'OFFER',entryId:'a',expectedVersion:1,expiresAtUtc:'2026-10-15T13:00:00.000Z',
    tenantPolicyRevision:'tenant-r2',servicePolicyRevision:'service-r3'
  });
});
test('FIFO ordering uses joined instant, not array order',()=>{
  const r=selectWaitlistOffer(input({entries:[entry('later',{joinedAtUtc:'2026-10-15T11:20:00.000Z'}),entry('early')]}));
  assert.equal(r.entryId,'early');
});
test('ties break by stable ASCII entry id rather than input order',()=>{
  assert.equal(selectWaitlistOffer(input({entries:[entry('z'),entry('a')]})).entryId,'a');
});
test('does not change original entry array or policy object',()=>{
  const q=input({entries:[entry('z'),entry('a')]}); const before=JSON.stringify(q);
  const r=selectWaitlistOffer(q);assert.equal(JSON.stringify(q),before);assert.ok(Object.isFrozen(r));
});
test('only one candidate even if there are multiple seats available',()=>{
  const r=selectWaitlistOffer(input({availableCapacity:5,entries:[entry('a'),entry('b')]}));assert.equal(r.action,'OFFER');assert.equal(r.entryId,'a');
});
test('zero capacity prevents offer',()=>{
  assert.deepEqual(selectWaitlistOffer(input({availableCapacity:0})),{action:'NO_CAPACITY'});
});
test('disabled policy prevents offer',()=>{
  assert.deepEqual(selectWaitlistOffer(input({policy:policy({waitlistEnabled:false,waitlistOfferTtlMinutes:0})})),{action:'DISABLED'});
});
test('offered record, even expired, forces reconciliation before another offer',()=>{
  for(const expiry of ['2026-10-15T11:50:00.000Z','2026-10-15T12:50:00.000Z']){
    assert.deepEqual(selectWaitlistOffer(input({entries:[entry('a',{status:'offered',offerExpiresAtUtc:expiry}),entry('b')]})),{action:'RECONCILE_OFFERS'});
  }
});
test('eligibility unknown cannot silently skip earlier waiter',()=>{
  assert.deepEqual(selectWaitlistOffer(input({entries:[entry('first',{eligibility:'unknown'}),entry('later',{joinedAtUtc:'2026-10-15T11:01:00.000Z'})]})),{action:'ELIGIBILITY_REQUIRED'});
});
test('explicitly ineligible head requires review rather than unfair reordering',()=>{
  assert.equal(selectWaitlistOffer(input({entries:[entry('first',{eligibility:'ineligible'}),entry('later')]})).action,'ELIGIBILITY_REQUIRED');
});
test('terminal statuses ignored if no waiting, without producing false offers',()=>{
  assert.deepEqual(selectWaitlistOffer(input({entries:[entry('a',{status:'cancelled'}),entry('b',{status:'expired'}),entry('c',{status:'accepted'})]})),{action:'NONE_WAITING'});
});
test('empty list yields NONE_WAITING',()=>{
  assert.equal(selectWaitlistOffer(input({entries:[]})).action,'NONE_WAITING');
});
test('service override TTL uses exact minutes and null revision is preserved',()=>{
  const r=selectWaitlistOffer(input({policy:{...policy({waitlistOfferTtlMinutes:5}),serviceRevision:null}}));
  assert.equal(r.expiresAtUtc,'2026-10-15T12:05:00.000Z');assert.equal(r.servicePolicyRevision,null);
});
test('duplicate entry IDs fail closed before any decision',()=>fail(()=>selectWaitlistOffer(input({entries:[entry(),entry()]}))));
test('cross-tenant, cross-location or cross-session injected record fails closed',()=>{
  for (const overrides of [{tenantId:'tenant-B'},{locationId:'loc-B'},{sessionId:'session-B'}]) {
    fail(()=>selectWaitlistOffer(input({entries:[entry('a',overrides)]})));
  }
});
test('invalid, repeated or naive timestamps rejected',()=>{
  for(const value of ['2026-10-15T12:00:00Z','2026-02-30T12:00:00.000Z','bad','2026-10-15T08:00:00.000-04:00']){
    fail(()=>selectWaitlistOffer(input({nowUtc:value})));
  }
});
test('future joined timestamps rejected',()=>fail(()=>selectWaitlistOffer(input({entries:[entry('a',{joinedAtUtc:'2026-10-15T12:00:00.001Z'})]}))));
test('offered rows require future-to-join expiry and waiting rows forbid stale expiry',()=>{
  fail(()=>selectWaitlistOffer(input({entries:[entry('a',{status:'offered'})]})));
  fail(()=>selectWaitlistOffer(input({entries:[entry('a',{status:'offered',offerExpiresAtUtc:'2026-10-15T11:00:00.000Z'})]})));
  fail(()=>selectWaitlistOffer(input({entries:[entry('a',{offerExpiresAtUtc:'2026-10-15T12:00:00.000Z'})]})));
});
test('rejects malformed revision, stale future policy and TTL mismatch',()=>{
  fail(()=>selectWaitlistOffer(input({policy:{...policy(),tenantRevision:'../x'}})));
  fail(()=>selectWaitlistOffer(input({policy:{...policy(),resolvedAtUtc:'2026-10-15T12:00:01.000Z'}})));
  fail(()=>selectWaitlistOffer(input({policy:policy({waitlistOfferTtlMinutes:0})})));
  fail(()=>selectWaitlistOffer(input({policy:policy({waitlistEnabled:false})})));
});
test('rejects negative, fractional and out-of-range capacity or versions',()=>{
  for(const cap of [-1,1.5,Infinity,100001,'1']) fail(()=>selectWaitlistOffer(input({availableCapacity:cap})));
  for(const version of [0,-1,1.5,Infinity,'2'])fail(()=>selectWaitlistOffer(input({entries:[entry('a',{version})]})));
});
test('rejects unknown fields in envelope and entries',()=>{
  fail(()=>selectWaitlistOffer({...input(),browserTenantRole:'admin'}));
  fail(()=>selectWaitlistOffer(input({entries:[entry('a',{phone:'555'})]})));
});
test('limits snapshot size to 512 entries',()=>{
  fail(()=>selectWaitlistOffer(input({entries:Array.from({length:513},(_,i)=>entry('id'+i))})));
});
test('invalid scope or status fails closed',()=>{
  fail(()=>selectWaitlistOffer(input({tenantId:'../tenant'})));
  fail(()=>selectWaitlistOffer(input({entries:[entry('a',{status:'promoted'})]})));
  fail(()=>selectWaitlistOffer(input({entries:[entry('a',{eligibility:'skipped'})]})));
});
test('policy disabled still rejects forged cross-tenant entries',()=>{
  fail(()=>selectWaitlistOffer(input({policy:policy({waitlistEnabled:false,waitlistOfferTtlMinutes:0}), entries:[entry('a',{tenantId:'tenant-B'})]})));
});

test('offer expiry beyond Date bounds fails closed',()=>{
  fail(()=>selectWaitlistOffer(input({nowUtc:'9999-12-31T23:59:59.999Z'})));
});
