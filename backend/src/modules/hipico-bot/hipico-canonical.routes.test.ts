import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  canonicalMutationPolicy,
  canonicalRequiresReview,
  configuredCanonicalOwnerId,
  __test__
} from './hipico-canonical.routes.js';
import { normalizeDomainReadLimit } from './hipico-domain-query.store.js';

const OWNER='11111111-1111-4111-8111-111111111111';
const base={
  eventType:'RACE_OPENED' as const,
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
  assert.equal(policy.stateWriteEligible,true);
  assert.equal(policy.sourceWrite,false);
  assert.equal(policy.monetaryWrite,false);
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

test('bet evidence can be recorded without ever becoming a monetary mutation',()=>{
  const policy=canonicalMutationPolicy({eventType:'BET_RECORDED',confirmedOperatorAction:false,confirmationReason:null});
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
  assert.match(source,/app\.use\('\/api\/v1\/hipico', authRateLimit, mutationRateLimit, hipicoCanonicalRoutes\)/);
  assert.ok(source.indexOf("app.use('/api/v1/hipico',")<source.indexOf('app.use(csrfProtection)'), 'token-authenticated canonical facade must not depend on cookie CSRF');
});