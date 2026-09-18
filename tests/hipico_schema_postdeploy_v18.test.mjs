import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyPostdeploy } from '../scripts/hipico-schema-postdeploy-v18.mjs';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');
const SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW=new Date('2026-09-18T01:20:00.000Z');

const allChecks=()=>({
  observabilityTablePresent:true,
  observabilityRls:true,
  observabilityAppendOnlyTrigger:true,
  outboxRls:true,
  outboxReceiptsTablePresent:true,
  outboxReceiptsRls:true,
  outboxReceiptsAppendOnlyTrigger:true,
  outboxSelectPolicyPresent:true,
  outboxReceiptsSelectPolicyPresent:true,
  outboxInsertPolicyPresent:false,
  outboxUpdatePolicyPresent:false,
  outboxReceiptsInsertPolicyPresent:false,
  outboxAnonInsert:false,
  outboxAnonUpdate:false,
  outboxAnonDelete:false,
  outboxAnonTruncate:false,
  outboxAuthenticatedInsert:false,
  outboxAuthenticatedUpdate:false,
  outboxAuthenticatedDelete:false,
  outboxAuthenticatedTruncate:false,
  outboxReceiptsAnonInsert:false,
  outboxReceiptsAnonUpdate:false,
  outboxReceiptsAnonDelete:false,
  outboxReceiptsAnonTruncate:false,
  outboxReceiptsAuthenticatedInsert:false,
  outboxReceiptsAuthenticatedUpdate:false,
  outboxReceiptsAuthenticatedDelete:false,
  outboxReceiptsAuthenticatedTruncate:false,
  auditIdempotencyIndex:true,
  auditSourceConstraint:true,
  auditAuthorityConstraint:true,
  auditProvenanceColumnsNotNull:true,
  auditRpcPresent:true,
  auditRpcSecurityDefiner:true,
  auditRpcAnonExecute:false,
  auditRpcAuthenticatedExecute:true,
  auditRpcServiceRoleExecute:true,
  auditSanitizerPresent:true,
  auditAnonDirectInsert:false,
  auditAnonDirectUpdate:false,
  auditAnonDirectDelete:false,
  auditAuthenticatedDirectInsert:false,
  auditAuthenticatedDirectUpdate:false,
  auditAuthenticatedDirectDelete:false,
  auditSanitizerPublicExecute:false,
  auditSanitizerAnonExecute:false,
  auditSanitizerAuthenticatedExecute:false
});

const drift=(status='MATCH',overrides={})=>({
  schema:'hipico-schema-drift-report.v15',
  candidateSha:SHA,
  status,
  reason:status==='DRIFT'?'REPOSITORY_DATABASE_SCHEMA_DRIFT':null,
  target:{database:'postgres',remote:true},
  missing:status==='DRIFT'?['audit.source']:[],
  observed:[],
  ...overrides
});

test('v18 PASS requires drift MATCH and every v25-v27 security boundary',()=>{
  const report=classifyPostdeploy({
    candidateSha:SHA,
    driftReport:drift(),
    securityChecks:allChecks(),
    now:NOW
  });
  assert.equal(report.status,'PASS');
  assert.equal(report.autoRepair,false);
  assert.deepEqual(report.failedChecks,[]);
});

test('v18 one broken security boundary fails closed',()=>{
  const checks=allChecks();
  checks.auditRpcAnonExecute=true;
  const report=classifyPostdeploy({
    candidateSha:SHA,
    driftReport:drift(),
    securityChecks:checks,
    now:NOW
  });
  assert.equal(report.status,'FAIL');
  assert.equal(report.reason,'SECURITY_BOUNDARY_MISMATCH');
  assert.ok(report.failedChecks.includes('auditRpcAnonExecute'));
});

test('v18 drift is FAIL even when all security checks pass',()=>{
  const report=classifyPostdeploy({
    candidateSha:SHA,
    driftReport:drift('DRIFT'),
    securityChecks:allChecks(),
    now:NOW
  });
  assert.equal(report.status,'FAIL');
  assert.equal(report.reason,'SCHEMA_DRIFT');
  assert.deepEqual(report.missingCapabilities,['audit.source']);
});

test('v18 missing or invalid exact SHA is NOT_EXECUTED',()=>{
  for(const candidateSha of ['', 'abc', 'g'.repeat(40)]){
    const report=classifyPostdeploy({
      candidateSha,
      driftReport:drift(),
      securityChecks:allChecks(),
      now:NOW
    });
    assert.equal(report.status,'NOT_EXECUTED');
    assert.equal(report.reason,'CANDIDATE_SHA_REQUIRED');
  }
});

test('v18 drift NOT_EXECUTED remains NOT_EXECUTED',()=>{
  const report=classifyPostdeploy({
    candidateSha:SHA,
    driftReport:drift('NOT_EXECUTED',{reason:'DATABASE_URL_REQUIRED'}),
    securityChecks:null,
    now:NOW
  });
  assert.equal(report.status,'NOT_EXECUTED');
  assert.equal(report.reason,'DATABASE_URL_REQUIRED');
});

test('v18 verifier is read-only and checks v25-v27 security primitives',async()=>{
  const source=await read('scripts/hipico-schema-postdeploy-v18.mjs');
  assert.match(source,/runDriftCheck/);
  assert.match(source,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/i);
  assert.match(source,/ROLLBACK/i);
  assert.doesNotMatch(source,/\bCOMMIT\b/i);
  assert.doesNotMatch(source,/\b(?:ALTER|CREATE|DROP|TRUNCATE)\s+(?:TABLE|SCHEMA|FUNCTION|TRIGGER|INDEX)\b/i);
  assert.doesNotMatch(source,/\bINSERT\s+INTO\b/i);
  assert.doesNotMatch(source,/\bUPDATE\s+public\./i);
  assert.doesNotMatch(source,/\bDELETE\s+FROM\b/i);
  for(const marker of [
    'hipico_observability_events',
    'hipico_observability_no_mutation',
    'hipico_outbox_receipts',
    'hipico_outbox_receipts_immutable',
    'hipico_outbox_select_own',
    'hipico_outbox_receipts_select_own',
    'hipico_audit_owner_idempotency_unique',
    'hipico_audit_events_source_check',
    'hipico_audit_events_authority_check',
    'hipico_append_audit',
    'hipico_audit_strip_reserved',
    'auditSanitizerPresent',
    'has_function_privilege',
    'has_table_privilege'
  ]) assert.match(source,new RegExp(marker));
  assert.match(source,/autoRepair:false/);
});

test('v18 workflow is manual-only and binds evidence to an explicit candidate SHA',async()=>{
  const workflow=await read('.github/workflows/hipico-schema-postdeploy-v18.yml');
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/\npush:/);
  assert.doesNotMatch(workflow,/\npull_request:/);
  assert.doesNotMatch(workflow,/\nschedule:/);
  assert.match(workflow,/candidate_sha:/);
  assert.match(workflow,/ref:\s*\$\{\{\s*inputs\.candidate_sha\s*\}\}/);
  assert.match(workflow,/HIPICO_CANDIDATE_SHA:\s*\$\{\{\s*inputs\.candidate_sha\s*\}\}/);
  assert.match(workflow,/HIPICO_SCHEMA_DRIFT_DATABASE_URL:/);
  assert.match(workflow,/hipico-schema-postdeploy-v18\.mjs/);
  assert.match(workflow,/actions\/upload-artifact/);
});
