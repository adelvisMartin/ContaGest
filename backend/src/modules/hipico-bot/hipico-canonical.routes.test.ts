import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  canonicalEvidenceIssue,
  canonicalMutationPolicy,
  canonicalRaceContextKey,
  canonicalRequiresReview,
  canonicalScopeIssue,
  configuredCanonicalOwnerId,
  __test__
} from './hipico-canonical.routes.js';
import { normalizeDomainReadLimit } from './hipico-domain-query.store.js';

const OWNER='11111111-1111-4111-8111-111111111111';
const validRaceContext={raceDate:'2026-09-11',raceNumber:1,racetrack:'Churchill Downs',raceContextComplete:true};
const racePayload=(extra:Record<string,unknown>={})=>({...validRaceContext,...extra});
const base={
  eventType:'RACE_OPENED' as const,
  aggregateKind:'race' as const,
  normalizedPayload:validRaceContext,
  confirmedOperatorAction:false,
  confirmationReason:null
};

test('canonical owner is server-side only and malformed owner config fails closed',()=>{
  assert.equal(configuredCanonicalOwnerId({HIPICO_OWNER_ID:OWNER} as NodeJS.ProcessEnv),OWNER);
  assert.equal(configuredCanonicalOwnerId({HIPICO_OWNER_ID:'not-a-uuid'} as NodeJS.ProcessEnv),null);
  const parsed=__test__.domainEventSchema.safeParse({
    ownerId:'22222222-2222-4222-8222-222222222222',
    groupKey:'g1',aggregateKind:'race',aggregateKey:'r1',sourceMessageKey:'m1',eventType:'RACE_OPENED',
    timestamp:'2026-09-11T20:00:00.000Z',operatorId:'operator',confirmedOperatorAction:true,confirmationReason:'validated opening'
  });
  assert.equal(parsed.success,false,'request body must not be allowed to override server ownerId');
});

test('state-advancing events remain review-only until explicit operator confirmation with reason',()=>{
  assert.equal(canonicalRequiresReview(base),true);
  assert.equal(canonicalRequiresReview({...base,confirmedOperatorAction:true,confirmationReason:'ok'}),true);
  assert.equal(canonicalRequiresReview({...base,confirmedOperatorAction:true,confirmationReason:'validated race opening'}),false);
  const policy=canonicalMutationPolicy({...base,confirmedOperatorAction:true,confirmationReason:'validated race opening'});
  assert.equal(policy.requiresReview,false);
  assert.equal(policy.evidenceIssue,null);
  assert.equal(policy.stateWriteEligible,true);
  assert.equal(policy.sourceWrite,false);
  assert.equal(policy.monetaryWrite,false);
});

test('operator confirmation cannot override incomplete or invalid dated race context evidence',()=>{
  for(const normalizedPayload of [
    undefined,
    {raceNumber:1,racetrack:'Churchill Downs'},
    {raceNumber:1,racetrack:'Churchill Downs',raceContextComplete:true},
    {raceDate:'2026-09-11',raceNumber:0,racetrack:'Churchill Downs',raceContextComplete:true},
    {raceDate:'2026-09-11',raceNumber:1000,racetrack:'Churchill Downs',raceContextComplete:true},
    {raceDate:'2026-09-11',raceNumber:1,racetrack:'',raceContextComplete:true},
    {raceDate:'2026-02-31',raceNumber:1,racetrack:'Churchill Downs',raceContextComplete:true}
  ]){
    const policy=canonicalMutationPolicy({
      eventType:'RACE_OPENED',aggregateKind:'race',normalizedPayload,
      confirmedOperatorAction:true,confirmationReason:'operator confirmed race opening'
    });
    assert.equal(policy.evidenceIssue,'HIPICO_RACE_CONTEXT_INCOMPLETE');
    assert.equal(policy.requiresReview,true);
    assert.equal(policy.stateWriteEligible,false);
  }
});

test('every race event is bound to deterministic date track and race identity before persistence',()=>{
  for(const eventType of __test__.RACE_CONTEXT_BOUND_EVENTS){
    const aggregateKey=canonicalRaceContextKey({eventType,normalizedPayload:validRaceContext});
    assert.ok(aggregateKey,eventType);
    assert.equal(canonicalScopeIssue({
      eventType,aggregateKind:'race',aggregateKey,normalizedPayload:validRaceContext,
      confirmedOperatorAction:true,confirmationReason:'verified race identity'
    }),null,eventType);
    assert.equal(canonicalScopeIssue({
      eventType,aggregateKind:'race',aggregateKey:'wrong-race',normalizedPayload:validRaceContext,
      confirmedOperatorAction:true,confirmationReason:'verified race identity'
    }),'HIPICO_RACE_AGGREGATE_KEY_MISMATCH',eventType);
    assert.equal(canonicalScopeIssue({
      eventType,aggregateKind:'race',aggregateKey,
      confirmedOperatorAction:true,confirmationReason:'verified race identity'
    }),'HIPICO_RACE_CONTEXT_INCOMPLETE',eventType);
  }
});

test('same track and race number on a different date derives a distinct aggregate key',()=>{
  const first=canonicalRaceContextKey({eventType:'RACE_OPENED',normalizedPayload:validRaceContext});
  const second=canonicalRaceContextKey({eventType:'RACE_OPENED',normalizedPayload:{...validRaceContext,raceDate:'2026-09-12'}});
  assert.ok(first&&second);
  assert.notEqual(first,second);
});

test('result settlement and balance state transitions require scoped, unique structured evidence',()=>{
  const confirmed={confirmedOperatorAction:true,confirmationReason:'operator verified structured evidence'};
  assert.equal(canonicalMutationPolicy({eventType:'RESULT_RECORDED',aggregateKind:'race',normalizedPayload:{},...confirmed}).evidenceIssue,'HIPICO_RACE_CONTEXT_INCOMPLETE');
  assert.equal(canonicalMutationPolicy({eventType:'RESULT_RECORDED',aggregateKind:'race',normalizedPayload:racePayload(),...confirmed}).evidenceIssue,'HIPICO_RESULT_BOARD_REQUIRED');
  assert.equal(canonicalMutationPolicy({eventType:'RESULT_RECORDED',aggregateKind:'race',normalizedPayload:racePayload({board:['7','3','1']}),...confirmed}).stateWriteEligible,true);
  assert.equal(canonicalMutationPolicy({eventType:'RESULT_RECORDED',aggregateKind:'race',normalizedPayload:racePayload({board:['7','3','7']}),...confirmed}).evidenceIssue,'HIPICO_RESULT_BOARD_REQUIRED');

  assert.equal(canonicalMutationPolicy({eventType:'SETTLEMENT_RECORDED',aggregateKind:'race',normalizedPayload:racePayload({settlementRows:[]}),...confirmed}).evidenceIssue,'HIPICO_SETTLEMENT_ROWS_REQUIRED');
  assert.equal(canonicalMutationPolicy({eventType:'SETTLEMENT_RECORDED',aggregateKind:'race',normalizedPayload:racePayload({settlementRows:[{participant:'P1',amount:-120}]}),...confirmed}).evidenceIssue,null);
  assert.equal(canonicalMutationPolicy({eventType:'SETTLEMENT_RECORDED',aggregateKind:'race',normalizedPayload:racePayload({settlementRows:[{participant:'P1',amount:-120},{participant:' p1 ',amount:120}]}),...confirmed}).evidenceIssue,'HIPICO_SETTLEMENT_ROWS_REQUIRED');

  assert.equal(canonicalMutationPolicy({eventType:'BALANCE_CONFIRMED',aggregateKind:'race',normalizedPayload:racePayload({balances:[{participant:'P1',available:'100'}]}),...confirmed}).evidenceIssue,'HIPICO_BALANCES_REQUIRED');
  assert.equal(canonicalMutationPolicy({eventType:'BALANCE_CONFIRMED',aggregateKind:'race',normalizedPayload:racePayload({balances:[{participant:'P1',available:100}]}),...confirmed}).evidenceIssue,null);
  assert.equal(canonicalMutationPolicy({eventType:'BALANCE_CONFIRMED',aggregateKind:'race',normalizedPayload:racePayload({balances:[{participant:'P1',available:100},{participant:'p1',available:50}]}),...confirmed}).evidenceIssue,'HIPICO_BALANCES_REQUIRED');
});

test('canonical aggregate kind and correction identity are fail-closed before persistence',()=>{
  assert.equal(canonicalScopeIssue({eventType:'RACE_OPENED',aggregateKind:'day',confirmedOperatorAction:true,confirmationReason:'verified'}),'HIPICO_EVENT_AGGREGATE_KIND_MISMATCH');
  assert.equal(canonicalScopeIssue({eventType:'DAY_CLOSED',aggregateKind:'race',confirmedOperatorAction:true,confirmationReason:'verified'}),'HIPICO_EVENT_AGGREGATE_KIND_MISMATCH');
  assert.equal(canonicalScopeIssue({eventType:'CORRECTION',aggregateKind:'race',confirmedOperatorAction:true,confirmationReason:'verified'}),'HIPICO_ORIGINAL_EVENT_REQUIRED');
  assert.equal(canonicalScopeIssue({eventType:'REVERSAL',aggregateKind:'race',originalEventId:'evt-1',confirmedOperatorAction:true,confirmationReason:'verified'}),null);
});

test('evidence validator rejects malformed boards and accepts bounded valid dated race context',()=>{
  assert.equal(canonicalEvidenceIssue({eventType:'RESULT_RECORDED',normalizedPayload:racePayload({board:['']}),confirmedOperatorAction:true,confirmationReason:'verified'}),'HIPICO_RESULT_BOARD_REQUIRED');
  assert.equal(canonicalEvidenceIssue({...base,confirmedOperatorAction:true,confirmationReason:'validated race opening'}),null);
});

test('ambiguous and unknown events cannot be promoted by operator confirmation',()=>{
  for(const eventType of ['AMBIGUOUS','UNKNOWN'] as const){
    const policy=canonicalMutationPolicy({eventType,confirmedOperatorAction:true,confirmationReason:'operator reviewed this evidence'});
    assert.equal(policy.requiresReview,true);
    assert.equal(policy.stateWriteEligible,false);
    assert.equal(policy.sourceWrite,false);
    assert.equal(policy.monetaryWrite,false);
  }
});

test('bet evidence requires dated race identity and can never become a monetary mutation',()=>{
  const incomplete=canonicalMutationPolicy({eventType:'BET_RECORDED',confirmedOperatorAction:false,confirmationReason:null});
  assert.equal(incomplete.requiresReview,true);
  assert.equal(incomplete.evidenceIssue,'HIPICO_RACE_CONTEXT_INCOMPLETE');
  const policy=canonicalMutationPolicy({
    eventType:'BET_RECORDED',normalizedPayload:validRaceContext,
    confirmedOperatorAction:false,confirmationReason:null
  });
  assert.equal(policy.requiresReview,false);
  assert.equal(policy.evidenceOnly,true);
  assert.equal(policy.stateWriteEligible,false);
  assert.equal(policy.monetaryWrite,false);
});

test('corrections and reversals require an explicit audited operator action',()=>{
  for(const eventType of ['CORRECTION','REVERSAL'] as const){
    assert.equal(canonicalRequiresReview({eventType,confirmedOperatorAction:false,confirmationReason:null}),true);
    assert.equal(canonicalRequiresReview({eventType,confirmedOperatorAction:true,confirmationReason:'audited correction reason'}),false);
    assert.equal(canonicalMutationPolicy({eventType,confirmedOperatorAction:true,confirmationReason:'audited correction reason'}).evidenceOnly,true);
  }
});

test('canonical schemas require group scope, bound read limits and reject unexpected fields',()=>{
  assert.equal(__test__.previewSchema.safeParse({text:'hola'}).success,false);
  assert.equal(__test__.previewSchema.safeParse({groupKey:'g1',text:'hola',raceDate:'2026-09-11'}).success,true);
  assert.equal(__test__.previewSchema.safeParse({groupKey:'g1',text:'hola',raceDate:'2026/09/11'}).success,false);
  assert.equal(__test__.domainReadSchema.safeParse({groupKey:'g1',limit:'25'}).success,true);
  assert.equal(__test__.domainReadSchema.safeParse({groupKey:'g1',limit:'201'}).success,false);
  assert.equal(__test__.domainReadSchema.safeParse({groupKey:'g1',ownerId:OWNER}).success,false);
  assert.equal(__test__.domainEventSchema.safeParse({
    groupKey:'g1',aggregateKind:'race',aggregateKey:'r1',sourceMessageKey:'m1',eventType:'RACE_OPENED',
    timestamp:'2026-09-11T20:00:00.000Z',operatorId:'operator',unexpected:true
  }).success,false);
});

test('domain read limit is bounded defensively inside the store too',()=>{
  assert.equal(normalizeDomainReadLimit(undefined),50);
  assert.equal(normalizeDomainReadLimit(-10),1);
  assert.equal(normalizeDomainReadLimit(5000),200);
  assert.equal(normalizeDomainReadLimit(42.9),42);
});

test('domain read query is scoped by owner, group, kind and aggregate key and omits raw message text',()=>{
  const source=readFileSync(new URL('./hipico-domain-query.store.ts',import.meta.url),'utf8');
  assert.match(source,/owner_id=\$\{ownerId\}::uuid/);
  assert.match(source,/group_key=\$\{groupKey\}/);
  assert.match(source,/aggregate_kind=\$\{input\.aggregateKind\}/);
  assert.match(source,/aggregate_key=\$\{aggregateKey\}/);
  assert.doesNotMatch(source,/raw_message AS "rawMessage"/);
});

test('application mounts canonical facade separately from legacy integration adapters',()=>{
  const source=readFileSync(new URL('../../app.ts',import.meta.url),'utf8');
  assert.match(source,/app\.use\('\/api\/v1\/hipico-bot', hipicoWebhookRoutes\)/);
  assert.match(source,/app\.use\(\s*'\/api\/v1\/hipico',\s*authRateLimit,\s*mutationRateLimit,\s*hipicoProviderRoutes,\s*hipicoRaceRoutes,\s*hipicoAgentRoutes,\s*hipicoCommandCenterRoutes,\s*hipicoOperatorReadRoutes,\s*hipicoCanonicalRoutes\s*\)/s);
  const canonicalMount=source.indexOf("'\/api\/v1\/hipico',".replaceAll('\\/','/'));
  assert.ok(canonicalMount>=0,'canonical Hípico chain must mount the complete bounded facade under one limiter chain');
  assert.ok(canonicalMount<source.indexOf('app.use(csrfProtection)'), 'token-authenticated canonical facade must not depend on cookie CSRF');
});