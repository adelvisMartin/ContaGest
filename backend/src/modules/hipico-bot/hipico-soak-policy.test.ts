import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { evaluateSoak } from './hipico-soak-policy.js';

const policy={
  releaseMinimumHours:24,
  requiredDrills:['bridge-restart','backend-restart','lab-reconnect','source-session-reconnect-readonly'],
  minimumHealthCoverageRatio:.9,
  minimumSpoolCoverageRatio:.9,
  drillEvidenceRequired:true,
  healthEndpointRequiredForRelease:true,
  spoolPathRequiredForRelease:true,
  invariantEvidenceRequiredForRelease:true,
  thresholds:{maxRssGrowthMbPerHour:32,maxHeapGrowthMbPerHour:24,maxEventLoopP95Ms:250,maxBacklogAgeSeconds:120,maxSpoolBytes:536870912,maxUnexpectedDuplicateResponses:0,maxLostDecisions:0,maxContextLeaks:0,maxHealthFailureRate:.01}
};
const drill=(id:string)=>({status:'PASS' as const,at:'2026-08-30T23:00:00.000Z',evidence:[`${id}.log`]});
const base={
  candidateSha:'a'.repeat(40),durationMs:24*3600000,samples:100,
  rssStartMb:100,rssEndMb:120,heapStartMb:50,heapEndMb:60,
  eventLoopP95Ms:10,maxBacklogAgeSeconds:5,maxSpoolBytes:1024,
  unexpectedDuplicateResponses:0,lostDecisions:0,contextLeaks:0,
  healthConfigured:true,spoolConfigured:true,healthChecks:100,healthFailures:0,
  spoolChecks:100,spoolAvailableChecks:100,operatorPresent:true,
  sourceReadOnly:'PASS' as const,labOnlyWriteDestination:'PASS' as const,sessionFallbackSafe:'PASS' as const,
  invariantEvidenceComplete:true,
  drills:{'bridge-restart':drill('bridge-restart'),'backend-restart':drill('backend-restart'),'lab-reconnect':drill('lab-reconnect'),'source-session-reconnect-readonly':drill('source-session-reconnect-readonly')}
};

test('24h clean observed run with evidenced drills can PASS',()=>assert.equal(evaluateSoak(base,policy).status,'PASS'));
test('short run is smoke only, never release PASS',()=>assert.equal(evaluateSoak({...base,durationMs:60_000,rssEndMb:base.rssStartMb,heapEndMb:base.heapStartMb},policy).status,'SMOKE_ONLY'));
test('missing drill blocks release',()=>assert.equal(evaluateSoak({...base,drills:{...base.drills,'bridge-restart':{status:'NOT_EXECUTED' as const}}},policy).status,'BLOCKED'));
test('PASS drill without timestamp/evidence blocks release',()=>{const result=evaluateSoak({...base,drills:{...base.drills,'bridge-restart':{status:'PASS' as const,at:null,evidence:[]}}},policy);assert.equal(result.status,'BLOCKED');assert.ok(result.blocked.includes('DRILL_bridge-restart_EVIDENCE_MISSING'));});
test('SOURCE invariant not verified blocks release',()=>assert.equal(evaluateSoak({...base,sourceReadOnly:'NOT_EXECUTED'},policy).status,'BLOCKED'));
test('safety invariant PASS flags without SHA-bound evidence cannot release',()=>{const result=evaluateSoak({...base,invariantEvidenceComplete:false},policy);assert.equal(result.status,'BLOCKED');assert.ok(result.blocked.includes('SAFETY_INVARIANT_EVIDENCE_INCOMPLETE'));});
test('operator identity and session fallback are mandatory for release',()=>{const operator=evaluateSoak({...base,operatorPresent:false},policy);assert.equal(operator.status,'BLOCKED');assert.ok(operator.blocked.includes('OPERATOR_NOT_IDENTIFIED'));const session=evaluateSoak({...base,sessionFallbackSafe:'NOT_EXECUTED'},policy);assert.equal(session.status,'BLOCKED');assert.ok(session.blocked.includes('SESSION_FALLBACK_SAFE_NOT_EXECUTED'));});
test('health endpoint and spool observation are mandatory',()=>{assert.equal(evaluateSoak({...base,healthConfigured:false,healthChecks:0},policy).status,'BLOCKED');assert.equal(evaluateSoak({...base,spoolConfigured:false,spoolChecks:0,spoolAvailableChecks:0},policy).status,'BLOCKED');});
test('insufficient health or spool sampling blocks release',()=>{const health=evaluateSoak({...base,healthChecks:50},policy);assert.equal(health.status,'BLOCKED');assert.ok(health.blocked.includes('HEALTH_COVERAGE_INCOMPLETE'));const spool=evaluateSoak({...base,spoolAvailableChecks:50},policy);assert.equal(spool.status,'BLOCKED');assert.ok(spool.blocked.includes('SPOOL_COVERAGE_INCOMPLETE'));});
test('memory or spool growth threshold fails',()=>{assert.equal(evaluateSoak({...base,rssEndMb:1000},policy).status,'FAIL');const spool=evaluateSoak({...base,maxSpoolBytes:policy.thresholds.maxSpoolBytes+1},policy);assert.equal(spool.status,'FAIL');assert.ok(spool.violations.includes('SPOOL_BYTES'));});
test('lost or duplicate decisions fail',()=>{assert.equal(evaluateSoak({...base,lostDecisions:1},policy).status,'FAIL');assert.equal(evaluateSoak({...base,unexpectedDuplicateResponses:1},policy).status,'FAIL');});
test('unbound SHA blocks evidence',()=>assert.equal(evaluateSoak({...base,candidateSha:'UNBOUND'},policy).status,'BLOCKED'));
test('runner measures nested spool-v2 and computes backlog from queued plus failed',()=>{const script=fs.readFileSync('scripts/hipico-soak-v120.ts','utf8');assert.match(script,/recursiveFileStats/);assert.match(script,/path\.join\(target,'queued'\)/);assert.match(script,/path\.join\(target,'failed'\)/);assert.match(script,/queued\.files\+failed\.files/);assert.match(script,/spoolAvailableChecks/);});
test('runner binds operator/session invariants and preserves hashed evidence inputs inside the artifact',()=>{const script=fs.readFileSync('scripts/hipico-soak-v120.ts','utf8');assert.match(script,/operator-id/);assert.match(script,/safety-evidence/);assert.match(script,/SAFETY_EVIDENCE_SHA_MISMATCH/);assert.match(script,/invariantEvidenceComplete/);assert.match(script,/samplesSha256/);assert.match(script,/drillEvidenceSha256/);assert.match(script,/safetyEvidenceSha256/);assert.match(script,/drill-evidence-input\.json/);assert.match(script,/safety-evidence-input\.json/);assert.match(script,/copyFileSync/);assert.match(script,/schemaVersion:4/);});
