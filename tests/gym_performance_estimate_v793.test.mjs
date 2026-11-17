import test from 'node:test';
import assert from 'node:assert/strict';
import { gymEpleyEstimate } from '../backend/src/modules/verticals/gym-performance-estimate.mjs';

test('#793 Epley v1: deterministic, 2-decimal estimates',()=>{
  assert.equal(gymEpleyEstimate(100,1),103.33);
  assert.equal(gymEpleyEstimate(100,12),140);
  assert.equal(gymEpleyEstimate(60,8),76);
  assert.equal(gymEpleyEstimate(60,8),gymEpleyEstimate(60,8));
});
test('#793 Epley: out-of-range / nonfinite / noninteger stays unknown',()=>{
  for(const [load,reps] of [
    [0,8],[-10,5],[Infinity,5],[NaN,5],[Number.MAX_VALUE,12],[100,0],[100,13],
    [100,2.5],[100,Infinity],[100,NaN]
  ])assert.equal(gymEpleyEstimate(load,reps),null);
});
