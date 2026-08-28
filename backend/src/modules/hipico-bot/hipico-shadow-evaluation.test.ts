import test from 'node:test';
import assert from 'node:assert/strict';
import { compareShadowPrediction,summarizeShadowEvaluations,assessShadowPromotion } from './hipico-shadow-evaluation.js';

test('exact, partial, mismatch and unresolved are distinct',()=>{
  assert.equal(compareShadowPrediction({intent:'race_result',board:['2','4','10']},{intent:'race_result',board:['2','4','10']}).status,'exact');
  assert.equal(compareShadowPrediction({intent:'race_result',board:['2','4','10']},{intent:'race_result',board:['2','4','9']}).status,'partial');
  assert.equal(compareShadowPrediction({intent:'race_result'},{intent:'balance_snapshot'}).status,'mismatch');
  assert.equal(compareShadowPrediction({intent:'race_result'},null).status,'unresolved');
});

test('stable comparison ignores object key ordering but not value differences',()=>{
  assert.equal(compareShadowPrediction({entities:{amount:50,horse:'1'}},{entities:{horse:'1',amount:50}}).status,'exact');
  assert.equal(compareShadowPrediction({entities:{amount:50}},{entities:{amount:60}}).status,'mismatch');
});

test('promotion gate never auto-promotes and blocks critical mismatch',()=>{
  const rows=Array.from({length:200},(_,i)=>({status:(i===199?'mismatch':'exact') as 'exact'|'mismatch',critical:i===199}));
  const summary=summarizeShadowEvaluations(rows);
  const gate=assessShadowPromotion(summary);
  assert.equal(gate.autoPromote,false);
  assert.equal(gate.eligibleForReview,false);
  assert.ok(gate.blockers.includes('CRITICAL_MISMATCH_PRESENT'));
});

test('insufficient sample cannot pass even with perfect accuracy',()=>{
  const summary=summarizeShadowEvaluations([{status:'exact'}]);
  const gate=assessShadowPromotion(summary);
  assert.equal(gate.eligibleForReview,false);
  assert.ok(gate.blockers.includes('INSUFFICIENT_RESOLVED_SAMPLE'));
});
