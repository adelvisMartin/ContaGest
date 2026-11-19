import test from 'node:test';
import assert from 'node:assert/strict';
import { gymHistoricalPlanCoverage, gymHistoricalSetAdherence } from '../backend/src/modules/verticals/gym-performance-adherence.mjs';

test('#709 invalid history fails closed and never produces complete adherence',()=>{
  for(const sessions of [undefined,null,{},'invalid',42]) {
    const coverage=gymHistoricalPlanCoverage(sessions);
    assert.deepEqual(coverage,{plannedSets:0,unknownPlanSessions:1,planComplete:false});
    assert.equal(gymHistoricalSetAdherence(5,coverage),null);
  }
});
test('#709 historical adherence rejects coerced or unsafe denominators',()=>{
  for(const plannedSets of ['10',0.5,Infinity,NaN,-1,Number.MAX_SAFE_INTEGER+1,null]) {
    assert.equal(gymHistoricalSetAdherence(5,{plannedSets,planComplete:true}),null);
  }
  assert.equal(gymHistoricalSetAdherence(6,{plannedSets:9,planComplete:true}),66.7);
  assert.equal(gymHistoricalSetAdherence(0,{plannedSets:5,planComplete:true}),0);
});
test('#709 only boolean completed snapshots can yield adherence',()=>{
  assert.equal(gymHistoricalSetAdherence(2,{plannedSets:5,planComplete:'true'}),null);
});
