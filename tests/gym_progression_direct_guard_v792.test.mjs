import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateGymProgression as evaluate} from '../backend/src/modules/verticals/gym.progression.ts';
const input=(strategy='linear_load')=>({strategy,config:{loadIncrementKg:2.5,targetRir:2,targetRpe:8,stallAfter:3},
 current:{loadKg:50,reps:8},performance:{completed:true,achievedReps:8,rir:2,rpe:8,consecutiveMisses:0}});
test('coherent effort preserves previous load-increment semantics',()=>{const r=evaluate(input());assert.equal(r.action,'increase_load');assert.equal(r.next.loadKg,52.5)});
test('incoherent effort refuses load increase even if rep target met',()=>{const x=input();x.performance.rpe=5;const r=evaluate(x);assert.equal(r.action,'hold');assert.deepEqual(r.reasons,['incoherent_effort_evidence']);assert.equal(r.next.loadKg,50)});
test('incoherent effort refuses reset despite stall counter',()=>{const x=input();x.performance.rpe=4;x.performance.consecutiveMisses=8;const r=evaluate(x);assert.equal(r.action,'hold');assert.equal(r.next.loadKg,50)});
test('incoherent effort refuses percent-1RM prediction',()=>{const x=input('percent_1rm');x.config.oneRepMaxKg=100;x.config.percent1Rm=80;x.performance.rpe=5;const r=evaluate(x);assert.equal(r.action,'hold')});
test('manual strategy stays manual without unwanted load changes',()=>{const x=input('manual');x.performance.rpe=5;const r=evaluate(x);assert.equal(r.action,'hold');assert.deepEqual(r.reasons,['manual_strategy'])});
test('missing effort evidence retains preexisting hold behavior',()=>{const x=input();x.performance.rir=null;const r=evaluate(x);assert.equal(r.action,'hold');assert.deepEqual(r.reasons,['missing_effort_evidence'])});
