import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSoak } from './hipico-soak-policy.js';

const policy={
  releaseMinimumHours:24,
  requiredDrills:['bridge-restart','backend-restart','lab-reconnect','source-session-reconnect-readonly'],
  minimumHealthCoverageRatio:.9,
  drillEvidenceRequired:true,
  healthEndpointRequiredForRelease:true,
  spoolPathRequiredForRelease:true,
  thresholds:{maxRssGrowthMbPerHour:32,maxHeapGrowthMbPerHour:24,maxEventLoopP95Ms:250,maxBacklogAgeSeconds:120,maxSpoolBytes:536870912,maxUnexpectedDuplicateResponses:0,maxLostDecisions:0,maxContextLeaks:0,maxHealthFailureRate:.01}
};
const drill=(id:string)=>({status:'PASS' as const,at:'2026-08-30T23:00:00.000Z',evidence:[`${id}.log`]});
const base={
  candidateSha:'a'.repeat(40),durationMs:24*3600000,samples:100,
  rssStartMb:100,rssEndMb:120,heapStartMb:50,heapEndMb:60,
  eventLoopP95Ms:10,maxBacklogAgeSeconds:5,maxSpoolBytes:1024,
  unexpectedDuplicateResponses:0,lostDecisions:0,contextLeaks:0,
  healthConfigured:true,spoolConfigured:true,healthChecks:100,healthFailures:0,
  sourceReadOnly:'PASS' as const,labOnlyWriteDestination:'PASS' as const,
  drills:{'bridge-restart':drill('bridge-restart'),'backend-restart':drill('backend-restart'),'lab-reconnect':drill('lab-reconnect'),'source-session-reconnect-readonly':drill('source-session-reconnect-readonly')}
};

test('24h clean observed run with evidenced drills can PASS',()=>assert.equal(evaluateSoak(base,policy).status,'PASS'));
test('short run is smoke only, never release PASS',()=>assert.equal(evaluateSoak({...base,durationMs:60_000},policy).status,'SMOKE_ONLY'));
test('missing drill blocks release',()=>assert.equal(evaluateSoak({...base,drills:{...base.drills,'bridge-restart':{status:'NOT_EXECUTED' as const}}},policy).status,'BLOCKED'));
test('PASS drill without timestamp/evidence blocks release',()=>{const result=evaluateSoak({...base,drills:{...base.drills,'bridge-restart':{status:'PASS' as const,at:null,evidence:[]}}},policy);assert.equal(result.status,'BLOCKED');assert.ok(result.blocked.includes('DRILL_bridge-restart_EVIDENCE_MISSING'));});
test('SOURCE invariant not verified blocks release',()=>assert.equal(evaluateSoak({...base,sourceReadOnly:'NOT_EXECUTED'},policy).status,'BLOCKED'));
test('health endpoint and spool observation are mandatory',()=>{assert.equal(evaluateSoak({...base,healthConfigured:false,healthChecks:0},policy).status,'BLOCKED');assert.equal(evaluateSoak({...base,spoolConfigured:false},policy).status,'BLOCKED');});
test('insufficient health sampling blocks release',()=>{const result=evaluateSoak({...base,healthChecks:50},policy);assert.equal(result.status,'BLOCKED');assert.ok(result.blocked.includes('HEALTH_COVERAGE_INCOMPLETE'));});
test('memory or spool growth threshold fails',()=>{assert.equal(evaluateSoak({...base,rssEndMb:1000},policy).status,'FAIL');const spool=evaluateSoak({...base,maxSpoolBytes:policy.thresholds.maxSpoolBytes+1},policy);assert.equal(spool.status,'FAIL');assert.ok(spool.violations.includes('SPOOL_BYTES'));});
test('lost or duplicate decisions fail',()=>{assert.equal(evaluateSoak({...base,lostDecisions:1},policy).status,'FAIL');assert.equal(evaluateSoak({...base,unexpectedDuplicateResponses:1},policy).status,'FAIL');});
test('unbound SHA blocks evidence',()=>assert.equal(evaluateSoak({...base,candidateSha:'UNBOUND'},policy).status,'BLOCKED'));
