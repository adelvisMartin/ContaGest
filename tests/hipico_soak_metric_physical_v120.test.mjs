import test from 'node:test';
import assert from 'node:assert/strict';
import {validSoakMetricEvidence} from '../scripts/hipico-soak-metric-integrity-v120.mjs';

const day=24*3600*1000;
function fixture(){
  const end=Date.now()-100000;
  const s={durationMs:day,rssStartMb:100,rssEndMb:125,heapStartMb:40,heapEndMb:52,
    eventLoopP95Ms:10,maxBacklogAgeSeconds:5,maxSpoolBytes:0,
    unexpectedDuplicateResponses:0,lostDecisions:0,contextLeaks:0,samples:2880,
    healthChecks:2880,healthFailures:0,spoolChecks:2880,spoolAvailableChecks:2880};
  const e={durationHours:24,rssGrowthMbPerHour:25/24,heapGrowthMbPerHour:12/24,
    healthFailureRate:0,healthCoverageRatio:1,spoolCoverageRatio:1};
  return {startedAt:new Date(end-day).toISOString(),completedAt:new Date(end).toISOString(),summaryInput:s,evaluation:e};
}
function recalculateMemoryMetrics(value) {
  const s=value.summaryInput, e=value.evaluation;
  const hours=s.durationMs/3600000;
  e.rssGrowthMbPerHour=(s.rssEndMb-s.rssStartMb)/hours;
  e.heapGrowthMbPerHour=(s.heapEndMb-s.heapStartMb)/hours;
  return value;
}

test('valid actual Node process memory shape and canonical UTC remains admissible',()=>{
  assert.equal(validSoakMetricEvidence(fixture()),true);
});
test('reject naive timestamps and noncanonical ISO timezone and precision',()=>{
  for(const key of ['startedAt','completedAt'])for(const value of [
    '2026-10-15T12:00:00Z','2026-10-15T12:00:00.000+00:00',
    '2026-10-15T12:00:00', '2026-10-15T08:00:00.000-04:00',
    '2026-02-30T12:00:00.000Z', '2026-10-15'
  ]){
    const v=fixture();v[key]=value;
    assert.equal(validSoakMetricEvidence(v),false,key+' '+value);
  }
});
test('reject zero or physically impossible process memory snapshots',()=>{
  for(const [key,value] of [
    ['rssStartMb',0],['rssEndMb',0],['heapStartMb',0],['heapEndMb',0],
    ['heapStartMb',101],['heapEndMb',126]
  ]){
    const v=fixture();v.summaryInput[key]=value;
    assert.equal(validSoakMetricEvidence(recalculateMemoryMetrics(v)),false,key);
  }
});
test('do not weaken existing density, duration or derived metric guards',()=>{
  const sparse=fixture();sparse.summaryInput.samples=2500;
  assert.equal(validSoakMetricEvidence(sparse),false);
  const over=fixture();over.summaryInput.samples=6000;
  assert.equal(validSoakMetricEvidence(over),false);
  const badDuration=fixture();badDuration.startedAt=new Date(Date.parse(badDuration.completedAt)-3600000).toISOString();
  assert.equal(validSoakMetricEvidence(badDuration),false);
  const forged=fixture();forged.evaluation.rssGrowthMbPerHour=0;
  assert.equal(validSoakMetricEvidence(forged),false);
});
test('accept bounded 90% density and positive memory even for flat growth',()=>{
  const v=fixture();v.summaryInput.samples=2592;
  v.summaryInput.healthChecks=2592;v.summaryInput.spoolChecks=2592;v.summaryInput.spoolAvailableChecks=2592;
  v.summaryInput.rssEndMb=v.summaryInput.rssStartMb;v.summaryInput.heapEndMb=v.summaryInput.heapStartMb;
  v.evaluation.rssGrowthMbPerHour=0;v.evaluation.heapGrowthMbPerHour=0;
  assert.equal(validSoakMetricEvidence(v),true);
});
