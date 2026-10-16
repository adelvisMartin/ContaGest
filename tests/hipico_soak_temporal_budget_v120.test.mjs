import test from 'node:test';
import assert from 'node:assert/strict';
import { validSoakMetricEvidence } from '../scripts/hipico-soak-metric-integrity-v120.mjs';

const dayMs=24*60*60*1000;
function example({ samples=2880, endMs=Date.now()-3600000 }={}){
  const startedAt=new Date(endMs-dayMs).toISOString();
  const completedAt=new Date(endMs).toISOString();
  return {
    startedAt,completedAt,
    summaryInput:{
      durationMs:dayMs,rssStartMb:100,rssEndMb:124,
      heapStartMb:40,heapEndMb:52,eventLoopP95Ms:15,
      maxBacklogAgeSeconds:2,maxSpoolBytes:1024,
      unexpectedDuplicateResponses:0,lostDecisions:0,contextLeaks:0,
      samples,healthChecks:samples,healthFailures:0,
      spoolChecks:samples,spoolAvailableChecks:samples
    },
    evaluation:{
      durationHours:24,rssGrowthMbPerHour:1,
      heapGrowthMbPerHour:0.5,healthFailureRate:0,
      healthCoverageRatio:1,spoolCoverageRatio:1
    }
  };
}

test('#120 legitimate 24h metrics at exact or 90% sample density are accepted',()=>{
  assert.equal(validSoakMetricEvidence(example()),true);
  assert.equal(validSoakMetricEvidence(example({samples:2592})),true);
});

test('#120 million samples in a 24h 30-second budget are not believable evidence',()=>{
  assert.equal(validSoakMetricEvidence(example({samples:1000000})),false);
  assert.equal(validSoakMetricEvidence(example({samples:4000})),false);
});

test('#120 impossible future-started/future-completed 24h soak cannot grant PASS',()=>{
  assert.equal(validSoakMetricEvidence(example({endMs:Date.now()+2*dayMs})),false);
});

test('#120 shorter run cannot be backdated into a 24h soak',()=>{
  const invalid=example();
  invalid.startedAt=new Date(Date.parse(invalid.completedAt)-3600000).toISOString();
  assert.equal(validSoakMetricEvidence(invalid),false);
});
