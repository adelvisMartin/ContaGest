import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canonicalMutationPolicy, canonicalRaceContextKey, canonicalScopeIssue, __test__ } from './hipico-canonical.routes.js';

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

test('every race lifecycle event is bound to the same deterministic race identity',()=>{
  const expected=canonicalRaceContextKey({eventType:'RACE_OPENED',normalizedPayload:context});
  assert.ok(expected);
  for(const eventType of __test__.RACE_CONTEXT_BOUND_EVENTS){
    const payload={...context,
      ...(eventType==='RESULT_RECORDED'?{board:['7','3','1']}:{}),
      ...(eventType==='SETTLEMENT_RECORDED'?{settlementRows:[{participant:'P1',amount:-120}]}:{}),
      ...(eventType==='BALANCE_CONFIRMED'?{balances:[{participant:'P1',available:100}]}:{})
    };
    assert.equal(canonicalRaceContextKey({eventType,normalizedPayload:payload}),expected,eventType);
    assert.equal(canonicalScopeIssue({eventType,aggregateKind:'race',aggregateKey:expected,normalizedPayload:payload,...confirmed}),null,eventType);
    assert.equal(canonicalScopeIssue({eventType,aggregateKind:'race',aggregateKey:'racectx_000000000000000000000000',normalizedPayload:payload,...confirmed}),'HIPICO_RACE_AGGREGATE_KEY_MISMATCH',eventType);
    assert.equal(canonicalScopeIssue({eventType,aggregateKind:'race',aggregateKey:expected,normalizedPayload:undefined,...confirmed}),'HIPICO_RACE_CONTEXT_INCOMPLETE',eventType);
  }
});

test('result cannot advance state unless both race identity and board evidence are present',()=>{
  const expected=canonicalRaceContextKey({eventType:'RESULT_RECORDED',normalizedPayload:context});
  assert.ok(expected);
  const incomplete=canonicalMutationPolicy({
    eventType:'RESULT_RECORDED',aggregateKind:'race',normalizedPayload:{board:['7','3','1']},...confirmed
  });
  assert.equal(incomplete.evidenceIssue,'HIPICO_RACE_CONTEXT_INCOMPLETE');
  assert.equal(incomplete.stateWriteEligible,false);

  const complete=canonicalMutationPolicy({
    eventType:'RESULT_RECORDED',aggregateKind:'race',normalizedPayload:{...context,board:['7','3','1']},...confirmed
  });
  assert.equal(complete.evidenceIssue,null);
  assert.equal(complete.stateWriteEligible,true);
});

test('canonical API surfaces the deterministic key in preview and mismatch responses',()=>{
  assert.match(source,/raceContextKey:\s*operationalRaceContextKey\(result\.entities\)/);
  assert.match(source,/HIPICO_RACE_AGGREGATE_KEY_MISMATCH/);
  assert.match(source,/expectedAggregateKey/);
});
