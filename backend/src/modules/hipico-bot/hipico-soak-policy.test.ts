import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSoak } from './hipico-soak-policy.js';

const policy={releaseMinimumHours:24,requiredDrills:['bridge-restart','backend-restart','lab-reconnect','source-session-reconnect-readonly'],thresholds:{maxRssGrowthMbPerHour:32,maxHeapGrowthMbPerHour:24,maxEventLoopP95Ms:250,maxBacklogAgeSeconds:120,maxUnexpectedDuplicateResponses:0,maxLostDecisions:0,maxContextLeaks:0,maxHealthFailureRate:.01}};
const base={candidateSha:'a'.repeat(40),durationMs:24*3600000,samples:100,rssStartMb:100,rssEndMb:120,heapStartMb:50,heapEndMb:60,eventLoopP95Ms:10,maxBacklogAgeSeconds:5,unexpectedDuplicateResponses:0,lostDecisions:0,contextLeaks:0,healthChecks:100,healthFailures:0,sourceReadOnly:'PASS' as const,labOnlyWriteDestination:'PASS' as const,drills:{'bridge-restart':'PASS' as const,'backend-restart':'PASS' as const,'lab-reconnect':'PASS' as const,'source-session-reconnect-readonly':'PASS' as const}};

test('24h clean run with all drills can PASS',()=>assert.equal(evaluateSoak(base,policy).status,'PASS'));
test('short run is smoke only, never release PASS',()=>assert.equal(evaluateSoak({...base,durationMs:60_000},policy).status,'SMOKE_ONLY'));
test('missing drill blocks release',()=>assert.equal(evaluateSoak({...base,drills:{...base.drills,'bridge-restart':'NOT_EXECUTED'}},policy).status,'BLOCKED'));
test('SOURCE invariant not verified blocks release',()=>assert.equal(evaluateSoak({...base,sourceReadOnly:'NOT_EXECUTED'},policy).status,'BLOCKED'));
test('memory leak threshold fails',()=>{const result=evaluateSoak({...base,rssEndMb:1000},policy);assert.equal(result.status,'FAIL');assert.ok(result.violations.includes('RSS_GROWTH'));});
test('lost or duplicate decisions fail',()=>{assert.equal(evaluateSoak({...base,lostDecisions:1},policy).status,'FAIL');assert.equal(evaluateSoak({...base,unexpectedDuplicateResponses:1},policy).status,'FAIL');});
test('unbound SHA blocks evidence',()=>assert.equal(evaluateSoak({...base,candidateSha:'UNBOUND'},policy).status,'BLOCKED'));
