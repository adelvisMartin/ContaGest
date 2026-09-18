import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildBackupEvidence } from '../scripts/hipico-schema-backup-evidence-v23.mjs';
import { validateBackupEvidence } from '../scripts/hipico-schema-rollout-preflight-v17.mjs';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');
const SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TABLE_SHA='b'.repeat(64);
const NOW=new Date('2026-09-18T03:20:00.000Z');
const TABLES=[
  'hipico_agent_evaluations','hipico_audit_events','hipico_automation_transition_events',
  'hipico_bot_channels','hipico_document_events','hipico_document_sources','hipico_documents',
  'hipico_domain_aggregates','hipico_domain_events','hipico_group_automation','hipico_ledger_entries',
  'hipico_meetings','hipico_messages','hipico_observability_events','hipico_operation_events',
  'hipico_outbox','hipico_outbox_receipts','hipico_profiles','hipico_provider_evidence',
  'hipico_race_events','hipico_races','hipico_reconciliations','hipico_shadow_evaluations',
  'hipico_users','hipico_workspaces'
];
const PRESENT=TABLES.slice(0,11);
const DEFERRED=TABLES.slice(11);

function sourceCounts(value=2){
  return Object.fromEntries(PRESENT.map((table)=>[table,value]));
}
function restoredCounts(value=2){
  return Object.fromEntries(TABLES.map((table)=>[table,PRESENT.includes(table)?value:0]));
}
function baseEvidence(overrides={}){
  return {
    candidateSha:SHA,
    backupId:'hipico-backup-pre-001',
    restoreTestId:'hipico-restore-pre-001',
    targetDatabase:'postgres',
    scope:'hipico-canonical-v12-v27',
    migrationChain:'v12-v27',
    tableManifestSha256:TABLE_SHA,
    canonicalTables:TABLES,
    mode:'PRE_ROLLOUT',
    presentTables:PRESENT,
    deferredTables:DEFERRED,
    sourceCounts:sourceCounts(),
    restoredCounts:restoredCounts(),
    orphanForeignKeys:0,
    restoreVerified:true,
    now:NOW,
    ...overrides
  };
}

test('v25 PRE_ROLLOUT evidence passes with exact present/deferred partition and restored candidate schema',()=>{
  const evidence=buildBackupEvidence(baseEvidence());
  assert.equal(evidence.status,'PASS');
  assert.equal(evidence.mode,'PRE_ROLLOUT');
  assert.equal(evidence.canonicalTableCount,25);
  assert.equal(evidence.sourceTableCount,11);
  assert.deepEqual(evidence.presentTables,PRESENT);
  assert.deepEqual(evidence.deferredTables,DEFERRED);
  assert.equal(evidence.restoreVerified,true);
});

test('v25 STEADY_STATE rejects the same 11/25 source subset',()=>{
  const evidence=buildBackupEvidence(baseEvidence({mode:'STEADY_STATE'}));
  assert.equal(evidence.status,'FAIL');
  assert.ok(evidence.reasons.includes('STEADY_STATE_REQUIRES_FULL_SCOPE'));
});

test('v25 evidence rejects partition overlap, missing canonical entries and counts for deferred tables',()=>{
  const overlap=buildBackupEvidence(baseEvidence({
    deferredTables:[PRESENT[0],...DEFERRED]
  }));
  assert.equal(overlap.status,'FAIL');
  assert.ok(overlap.reasons.includes('TABLE_PARTITION_INVALID'));

  const missing=buildBackupEvidence(baseEvidence({
    deferredTables:DEFERRED.slice(1)
  }));
  assert.equal(missing.status,'FAIL');
  assert.ok(missing.reasons.includes('TABLE_PARTITION_INVALID'));

  const invalidSourceCounts=buildBackupEvidence(baseEvidence({
    sourceCounts:{...sourceCounts(),[DEFERRED[0]]:1}
  }));
  assert.equal(invalidSourceCounts.status,'FAIL');
  assert.ok(invalidSourceCounts.reasons.includes('SOURCE_COUNTS_SCOPE_MISMATCH'));
});

test('v25 evidence compares counts only for source-present tables and still rejects mismatches',()=>{
  const restored=restoredCounts();
  restored[PRESENT[0]]=99;
  const evidence=buildBackupEvidence(baseEvidence({restoredCounts:restored}));
  assert.equal(evidence.status,'FAIL');
  assert.ok(evidence.reasons.includes(`COUNT_MISMATCH:${PRESENT[0]}`));
});

test('v25 rollout preflight accepts only PRE_ROLLOUT backup evidence while schema is in DRIFT',()=>{
  const valid=buildBackupEvidence(baseEvidence());
  const accepted=validateBackupEvidence(valid,{
    candidateSha:SHA,
    targetDatabase:'postgres',
    expectedScope:'hipico-canonical-v12-v27',
    expectedMigrationChain:'v12-v27',
    expectedTableManifestSha256:TABLE_SHA,
    expectedMode:'PRE_ROLLOUT',
    expectedCanonicalTableCount:25,
    now:NOW,
    maxAgeHours:24
  });
  assert.equal(accepted.ok,true);
  assert.equal(accepted.sanitized.mode,'PRE_ROLLOUT');
  assert.equal(accepted.sanitized.sourceTableCount,11);

  const wrongMode=buildBackupEvidence(baseEvidence({
    mode:'STEADY_STATE',
    presentTables:TABLES,
    deferredTables:[],
    sourceCounts:Object.fromEntries(TABLES.map((x)=>[x,2])),
    restoredCounts:Object.fromEntries(TABLES.map((x)=>[x,2]))
  }));
  const rejected=validateBackupEvidence(wrongMode,{
    candidateSha:SHA,
    targetDatabase:'postgres',
    expectedScope:'hipico-canonical-v12-v27',
    expectedMigrationChain:'v12-v27',
    expectedTableManifestSha256:TABLE_SHA,
    expectedMode:'PRE_ROLLOUT',
    expectedCanonicalTableCount:25,
    now:NOW,
    maxAgeHours:24
  });
  assert.equal(rejected.ok,false);
  assert.equal(rejected.reason,'BACKUP_MODE_MISMATCH');
});

test('v25 backup producer records present/deferred tables and supports PRE_ROLLOUT vs STEADY_STATE',async()=>{
  const source=await read('ops/backup/hipico-backup-postgres.sh');
  assert.match(source,/HIPICO_BACKUP_MODE/);
  assert.match(source,/PRE_ROLLOUT/);
  assert.match(source,/STEADY_STATE/);
  assert.match(source,/presentTables/);
  assert.match(source,/deferredTables/);
  assert.match(source,/sourceTableCount/);
  assert.match(source,/dump_args/);
  assert.match(source,/continue/);
  assert.match(source,/STEADY_STATE.*missing|missing.*STEADY_STATE/is);
});

test('v25 restore drill rebuilds full schema, verifies 25/25 target tables, restores subset and compares source-present counts',async()=>{
  const source=await read('ops/backup/hipico-restore-drill.sh');
  assert.match(source,/presentTables/);
  assert.match(source,/deferredTables/);
  assert.match(source,/canonicalTableCount/);
  assert.match(source,/sourceTableCount/);
  assert.match(source,/Expected 25 restored schema tables|25.*restored schema/i);
  assert.match(source,/source-counts/);
  assert.match(source,/restored-counts/);
  assert.match(source,/hipico-schema-backup-evidence-v23\.mjs/);
});

test('v25 backup workflow exposes phase explicitly and defaults to PRE_ROLLOUT',async()=>{
  const workflow=await read('.github/workflows/hipico-schema-backup-restore-v23.yml');
  assert.match(workflow,/mode:/);
  assert.match(workflow,/default:\s*PRE_ROLLOUT/);
  assert.match(workflow,/PRE_ROLLOUT/);
  assert.match(workflow,/STEADY_STATE/);
  assert.match(workflow,/HIPICO_BACKUP_MODE:\s*\$\{\{\s*inputs\.mode\s*\}\}/);
});

test('v25 preflight implementation validates expected backup phase and canonical table count',async()=>{
  const source=await read('scripts/hipico-schema-rollout-preflight-v17.mjs');
  assert.match(source,/expectedMode/);
  assert.match(source,/BACKUP_MODE_MISMATCH/);
  assert.match(source,/expectedCanonicalTableCount/);
  assert.match(source,/BACKUP_CANONICAL_TABLE_COUNT_MISMATCH/);
  assert.match(source,/PRE_ROLLOUT/);
});
