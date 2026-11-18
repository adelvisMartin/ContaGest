import test from 'node:test';
import assert from 'node:assert/strict';
import { gymHistoricalPlanCoverage, gymHistoricalSetAdherence } from '../backend/src/modules/verticals/gym-performance-adherence.mjs';

test('#793 completed sessions use immutable routine prescription, not current routine', () => {
  const history = [
    {routineSnapshot:[{sets:3},{sets:2}]},
    {routineSnapshot:[{sets:4}]}
  ];
  const coverage = gymHistoricalPlanCoverage(history);
  assert.deepEqual(coverage,{plannedSets:9,unknownPlanSessions:0,planComplete:true});
  assert.equal(gymHistoricalSetAdherence(6,coverage),66.7);
  // Changing live routine rows cannot affect an already-snapshotted denominator.
  const liveRoutine = [{sets:100}];
  assert.equal(gymHistoricalPlanCoverage(history).plannedSets,9);
  assert.equal(liveRoutine[0].sets,100);
});

test('#793 legacy/invalid prescriptions fail closed rather than manufacture past adherence', () => {
  const rows=[{routineSnapshot:[{sets:2}]},{routineSnapshot:[]},
    {routineSnapshot:null},{routineSnapshot:[{sets:-1}]},
    {routineSnapshot:[{sets:1.5}]},{routineSnapshot:[{sets:'3'}]}];
  const coverage=gymHistoricalPlanCoverage(rows);
  assert.deepEqual(coverage,{plannedSets:2,unknownPlanSessions:5,planComplete:false});
  assert.equal(gymHistoricalSetAdherence(2,coverage),null);
  assert.equal(gymHistoricalSetAdherence(5,{plannedSets:0,planComplete:true}),null);
  assert.equal(gymHistoricalSetAdherence(0,{plannedSets:5,planComplete:true}),0);
  assert.equal(gymHistoricalSetAdherence(10,{plannedSets:5,planComplete:true}),100);
});

test('#793 empty window, malformed rows and unsafe totals remain bounded', () => {
  assert.deepEqual(gymHistoricalPlanCoverage([]),{plannedSets:0,unknownPlanSessions:0,planComplete:true});
  assert.deepEqual(gymHistoricalPlanCoverage([{routineSnapshot:[{sets:Number.MAX_SAFE_INTEGER},{sets:1}]}]),
    {plannedSets:0,unknownPlanSessions:1,planComplete:false});
  assert.equal(gymHistoricalSetAdherence(-1,{plannedSets:4,planComplete:true}),null);
});
