import assert from 'node:assert/strict';
import test from 'node:test';
import { searchMultiStageSlots, MultiStageSlotSearchError } from '../backend/src/modules/scheduling/multi-stage-slot-search.ts';

const iso = (h, m = 0) => `2026-10-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
const now = (h, m = 0) => iso(h, m);
const values = { minAdvanceMinutes: 30, maxAdvanceDays: 1, cancellationNoticeMinutes: 60,
  bufferBeforeMinutes: 0, bufferAfterMinutes: 0, waitlistEnabled: true, waitlistOfferTtlMinutes: 60 };
const tenant = (overrides = {}) => ({ revision: 'tenant_v2', effectiveFromUtc: '2026-01-01T00:00:00.000Z', values: {...values, ...overrides} });
const service = (overrides = {}) => ({ revision: 'service_v3', effectiveFromUtc: '2026-10-01T00:00:00.000Z', values: overrides });
const query = (withPolicy = {}) => ({ candidateQuery: {
  available: [{ start: iso(9), end: iso(13) }], durationMinutes: 90, stepMinutes: 30
}, steps: [{stepId:'triage',offsetMinutes:0,durationMinutes:30,resourceIds:['chair-A']},
  {stepId:'care',offsetMinutes:30,durationMinutes:60,resourceIds:['provider-A']}],
bookingPolicy: {tenant:tenant(),atUtc:now(9),...withPolicy} });

const starts = (q) => searchMultiStageSlots(q).suggestions.map(x=>x.startsAtUtc);
const rejected = (fn, code) => assert.throws(fn, e => e?.code === code);

test('policy rejects already-too-early starts without hiding later valid candidates', () => {
  const r = searchMultiStageSlots(query());
  assert.deepEqual(r.suggestions.map(x=>x.startsAtUtc), [iso(9,30),iso(10),iso(10,30),iso(11),iso(11,30)]);
  assert.equal(r.rejectedByPolicy, 1);
  assert.equal(r.rejectedByResources, 0);
  assert.equal(r.complete, true);
});
test('exact earliest booking boundary is included', () => {
  assert.equal(starts(query())[0], iso(9,30));
});
test('max booking advance boundary excludes later days but retains exact latest', () => {
  const q = query({atUtc:'2026-10-14T10:00:00.000Z'});
  const r=searchMultiStageSlots(q);
  assert.deepEqual(r.suggestions.map(x=>x.startsAtUtc),[iso(9),iso(9,30),iso(10)]);
  assert.equal(r.rejectedByPolicy, 3);
});
test('service policy can override min notice without modifying tenant policy', () => {
  const q=query({service:service({minAdvanceMinutes:0})});
  const r=searchMultiStageSlots(q);
  assert.equal(r.suggestions[0].startsAtUtc,iso(9));
  assert.deepEqual(r.policyEvidence,{tenantRevision:'tenant_v2',serviceRevision:'service_v3',evaluatedAtUtc:now(9)});
  assert.equal(q.bookingPolicy.tenant.values.minAdvanceMinutes,30);
});
test('conflicting resource and booking window reasons remain separately accounted', () => {
  const q = query();
  q.existing=[{resourceId:'chair-A',startsAtUtc:iso(9),endsAtUtc:iso(9,30)}];
  const r=searchMultiStageSlots(q);
  assert.equal(r.rejectedByResources,1);
  assert.equal(r.rejectedByPolicy,0);
  assert.equal(r.examinedCandidates,6);
});
test('must not apply output limit before policy filtering', () => {
  const q=query();q.limit=1;
  const r=searchMultiStageSlots(q);
  assert.equal(r.suggestions.length,1);
  assert.equal(r.suggestions[0].startsAtUtc,iso(9,30));
  assert.equal(r.rejectedByPolicy,1);
  assert.equal(r.truncated,true);
});
test('policy applies to empty availability and future-effective revisions fail closed', () => {
  const q=query({tenant:{...tenant(),effectiveFromUtc:'2026-11-01T00:00:00.000Z'}});
  q.candidateQuery.available=[];
  rejected(()=>searchMultiStageSlots(q),'SCHEDULING_POLICY_NOT_EFFECTIVE');
});
test('malformed policy or unexpected policy context key fails closed', () => {
  const q=query({injectTenant:'forged'});
  rejected(()=>searchMultiStageSlots(q),'SCHEDULING_POLICY_INVALID');
  rejected(()=>searchMultiStageSlots(query({atUtc:'2026-10-15T09:00:00-05:00'})),'SCHEDULING_POLICY_INSTANT_INVALID');
});
test('policy max/min with unsupported values fails closed', () => {
  rejected(()=>searchMultiStageSlots(query({service:service({minAdvanceMinutes:6000,maxAdvanceDays:1})})),'SCHEDULING_POLICY_INVALID');
  rejected(()=>searchMultiStageSlots(query({service:service({waitlistEnabled:false})})),'SCHEDULING_POLICY_INVALID');
});
test('policy before/after buffers cannot be weakened by slot envelope', () => {
  const q=query({tenant:tenant({bufferBeforeMinutes:15,bufferAfterMinutes:20})});
  rejected(()=>searchMultiStageSlots(q),'SCHEDULING_MULTISTAGE_QUERY_INVALID');
  q.candidateQuery.bufferBeforeMinutes=15;
  rejected(()=>searchMultiStageSlots(q),'SCHEDULING_MULTISTAGE_QUERY_INVALID');
  q.candidateQuery.bufferAfterMinutes=20;
  assert.equal(searchMultiStageSlots(q).suggestions[0].startsAtUtc,iso(9,15+30));
});
test('no policy retains existing behavior and exposes null evidence', () => {
  const q=query();delete q.bookingPolicy;
  const r=searchMultiStageSlots(q);
  assert.equal(r.suggestions[0].startsAtUtc,iso(9));
  assert.equal(r.rejectedByPolicy,0);
  assert.equal(r.policyEvidence,null);
});
test('results capped by core 256 remain incomplete, even if the policy rejects all scanned starts', () => {
  const q={ candidateQuery:{available:[{start:'2026-10-15T00:00:00.000Z',end:'2026-10-15T12:00:00.000Z'}],durationMinutes:1,stepMinutes:1},
    steps:[{stepId:'short',offsetMinutes:0,durationMinutes:1,resourceIds:['r1']}],
    bookingPolicy:{tenant:tenant({minAdvanceMinutes:400}),atUtc:'2026-10-15T00:00:00.000Z'}};
  const r=searchMultiStageSlots(q);
  assert.equal(r.suggestions.length,0);
  assert.equal(r.rejectedByPolicy,256);
  assert.equal(r.complete,false);
  assert.equal(r.truncated,true);
});
test('replaying equal inputs produces identical result with no mutation', () => {
  const q=query();const before=JSON.stringify(q);
  assert.deepEqual(searchMultiStageSlots(q),searchMultiStageSlots(q));
  assert.equal(JSON.stringify(q),before);
});
