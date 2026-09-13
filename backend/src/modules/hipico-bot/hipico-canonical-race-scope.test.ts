import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canonicalMutationPolicy, canonicalPreviewRaceContext, canonicalRaceContextKey, canonicalScopeIssue, __test__ } from './hipico-canonical.routes.js';

const source=readFileSync(new URL('./hipico-canonical.routes.ts',import.meta.url),'utf8');
const context={raceDate:'2026-09-11',raceNumber:4,racetrack:'Churchill Downs',raceContextComplete:true};
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

test('canonical race anchors derive one deterministic aggregate key from date track and race number',()=>{
  const opened=canonicalRaceContextKey({eventType:'RACE_OPENED',normalizedPayload:context});
  const closed=canonicalRaceContextKey({eventType:'RACE_CLOSED',normalizedPayload:{raceDate:'2026-09-11',raceContextComplete:true,racetrack:'churchill   downs',raceNumber:4}});
  const plan=canonicalRaceContextKey({eventType:'PLAN_RECORDED',normalizedPayload:{raceDate:'2026-09-11',raceNumber:4,racetrack:'CHURCHILL DOWNS',raceContextComplete:true}});
  assert.match(String(opened),/^racectx_[a-f0-9]{24}$/);
  assert.equal(opened,closed);
  assert.equal(opened,plan);
});

test('same track and race number on another day cannot share a canonical aggregate',()=>{
  const dayOne=canonicalRaceContextKey({eventType:'RACE_OPENED',normalizedPayload:context});
  const dayTwo=canonicalRaceContextKey({eventType:'RACE_OPENED',normalizedPayload:{...context,raceDate:'2026-09-12'}});
  assert.ok(dayOne&&dayTwo);
  assert.notEqual(dayOne,dayTwo);
  assert.equal(
    canonicalScopeIssue(scope('RACE_OPENED',String(dayOne),{...context,raceDate:'2026-09-12'})),
    'HIPICO_RACE_AGGREGATE_KEY_MISMATCH'
  );
});

test('canonical race identity never invents or normalizes an invalid race date',()=>{
  for(const normalizedPayload of [
    {raceNumber:4,racetrack:'Churchill Downs',raceContextComplete:true},
    {...context,raceDate:''},
    {...context,raceDate:'11/09/2026'},
    {...context,raceDate:'2026-02-31'},
    {...context,raceDate:'2026-13-01'}
  ]){
    assert.equal(canonicalRaceContextKey({eventType:'RACE_OPENED',normalizedPayload}),null);
    assert.equal(
      canonicalScopeIssue({eventType:'RACE_OPENED',aggregateKind:'race',aggregateKey:'racectx_000000000000000000000000',normalizedPayload,...confirmed}),
      'HIPICO_RACE_CONTEXT_INCOMPLETE'
    );
  }
});

test('canonical race anchors reject an aggregate key that belongs to another race',()=>{
  const expected=canonicalRaceContextKey({eventType:'RACE_OPENED',normalizedPayload:context});
  assert.ok(expected);
  assert.equal(canonicalScopeIssue(scope('RACE_OPENED',String(expected))),null);
  assert.equal(canonicalScopeIssue(scope('RACE_CLOSED','racectx_000000000000000000000000')),'HIPICO_RACE_AGGREGATE_KEY_MISMATCH');
  assert.equal(canonicalScopeIssue(scope('PLAN_RECORDED','race-4-free-text')),'HIPICO_RACE_AGGREGATE_KEY_MISMATCH');
});

test('a plan cannot open race state without complete dated race context evidence',()=>{
  const incomplete=canonicalMutationPolicy({
    eventType:'PLAN_RECORDED',aggregateKind:'race',normalizedPayload:{offers:[]},...confirmed
  });
  assert.equal(incomplete.evidenceIssue,'HIPICO_RACE_CONTEXT_INCOMPLETE');
  assert.equal(incomplete.requiresReview,true);
  assert.equal(incomplete.stateWriteEligible,false);

  const missingDate=canonicalMutationPolicy({
    eventType:'PLAN_RECORDED',aggregateKind:'race',normalizedPayload:{raceNumber:4,racetrack:'Churchill Downs',raceContextComplete:true},...confirmed
  });
  assert.equal(missingDate.evidenceIssue,'HIPICO_RACE_CONTEXT_INCOMPLETE');
  assert.equal(missingDate.stateWriteEligible,false);

  const complete=canonicalMutationPolicy({
    eventType:'PLAN_RECORDED',aggregateKind:'race',normalizedPayload:context,...confirmed
  });
  assert.equal(complete.evidenceIssue,null);
  assert.equal(complete.requiresReview,false);
  assert.equal(complete.stateWriteEligible,true);
});

test('every race lifecycle event is bound to the same deterministic dated race identity',()=>{
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

test('result cannot advance state unless date race identity and board evidence are present',()=>{
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

test('canonical API preview exposes date-aware key readiness without hiding legacy classification evidence',()=>{
  const entities={raceNumber:4,racetrack:'Churchill Downs'};
  const missingDate=canonicalPreviewRaceContext(entities);
  assert.equal(missingDate.raceContextKey,null);
  assert.equal(missingDate.canonicalRaceContextKey,null);
  assert.equal(missingDate.raceDateRequired,true);

  const dated=canonicalPreviewRaceContext(entities,'2026-09-11');
  assert.match(String(dated.raceContextKey),/^racectx_[a-f0-9]{24}$/);
  assert.equal(dated.canonicalRaceContextKey,dated.raceContextKey);
  assert.equal(dated.raceDateRequired,false);

  assert.match(source,/const raceContext = canonicalPreviewRaceContext\(result\.entities, input\.raceDate\)/);
  assert.match(source,/classification:\s*result/);
  assert.match(source,/\.\.\.raceContext/);
  assert.match(source,/HIPICO_RACE_AGGREGATE_KEY_MISMATCH/);
  assert.match(source,/expectedAggregateKey/);
});