import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canonicalMutationPolicy, canonicalRaceContextKey, canonicalScopeIssue } from './hipico-canonical.routes.js';

const source=readFileSync(new URL('./hipico-canonical.routes.ts',import.meta.url),'utf8');
const context={raceNumber:4,racetrack:'Churchill Downs',raceContextComplete:true};
const confirmed={confirmedOperatorAction:true,confirmationReason:'operator verified race context'};

function scope(eventType:'PLAN_RECORDED'|'RACE_OPENED'|'RACE_CLOSED',aggregateKey:string,normalizedPayload:unknown=context){
  return{
    eventType,
    aggregateKind:'race' as const,
    aggregateKey,
    normalizedPayload,
    ...confirmed
  };
}

test('canonical race anchors derive one deterministic aggregate key from track and race number',()=>{
  const opened=canonicalRaceContextKey({eventType:'RACE_OPENED',normalizedPayload:context});
  const closed=canonicalRaceContextKey({eventType:'RACE_CLOSED',normalizedPayload:{raceContextComplete:true,racetrack:'churchill   downs',raceNumber:4}});
  const plan=canonicalRaceContextKey({eventType:'PLAN_RECORDED',normalizedPayload:{raceNumber:4,racetrack:'CHURCHILL DOWNS',raceContextComplete:true}});
  assert.match(String(opened),/^racectx_[a-f0-9]{24}$/);
  assert.equal(opened,closed);
  assert.equal(opened,plan);
});

test('canonical race anchors reject an aggregate key that belongs to another race',()=>{
  const expected=canonicalRaceContextKey({eventType:'RACE_OPENED',normalizedPayload:context});
  assert.ok(expected);
  assert.equal(canonicalScopeIssue(scope('RACE_OPENED',String(expected))),null);
  assert.equal(canonicalScopeIssue(scope('RACE_CLOSED','racectx_000000000000000000000000')),'HIPICO_RACE_AGGREGATE_KEY_MISMATCH');
  assert.equal(canonicalScopeIssue(scope('PLAN_RECORDED','race-4-free-text')),'HIPICO_RACE_AGGREGATE_KEY_MISMATCH');
});

test('a plan cannot open race state without complete race context evidence',()=>{
  const incomplete=canonicalMutationPolicy({
    eventType:'PLAN_RECORDED',aggregateKind:'race',normalizedPayload:{offers:[]},...confirmed
  });
  assert.equal(incomplete.evidenceIssue,'HIPICO_RACE_CONTEXT_INCOMPLETE');
  assert.equal(incomplete.requiresReview,true);
  assert.equal(incomplete.stateWriteEligible,false);

  const complete=canonicalMutationPolicy({
    eventType:'PLAN_RECORDED',aggregateKind:'race',normalizedPayload:context,...confirmed
  });
  assert.equal(complete.evidenceIssue,null);
  assert.equal(complete.requiresReview,false);
  assert.equal(complete.stateWriteEligible,true);
});

test('non-anchor race evidence stays scoped by the already-established aggregate lifecycle',()=>{
  assert.equal(canonicalScopeIssue({
    eventType:'RESULT_RECORDED',aggregateKind:'race',aggregateKey:'racectx_existing',normalizedPayload:{board:['7','3','1']},...confirmed
  }),null);
  const result=canonicalMutationPolicy({
    eventType:'RESULT_RECORDED',aggregateKind:'race',normalizedPayload:{board:['7','3','1']},...confirmed
  });
  assert.equal(result.stateWriteEligible,true);
});

test('canonical API surfaces the deterministic key in preview and mismatch responses',()=>{
  assert.match(source,/raceContextKey:\s*operationalRaceContextKey\(result\.entities\)/);
  assert.match(source,/HIPICO_RACE_AGGREGATE_KEY_MISMATCH/);
  assert.match(source,/expectedAggregateKey/);
});
