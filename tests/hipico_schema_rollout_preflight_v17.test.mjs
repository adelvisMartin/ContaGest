import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildRolloutPlan,
  loadMigrationUnits,
  loadBackupScopeContract,
  validateBackupEvidence,
  validateMigrationOrder
} from '../scripts/hipico-schema-rollout-preflight-v17.mjs';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');
const SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW='2026-09-18T01:00:00.000Z';

function validBackup(contract,overrides={}){
  return {
    schema:'hipico-schema-backup-evidence.v17',
    candidateSha:SHA,
    status:'PASS',
    restoreVerified:true,
    backupId:'backup-20260918-001',
    restoreTestId:'restore-20260918-001',
    targetDatabase:'postgres',
    checkedAt:'2026-09-18T00:30:00.000Z',
    scope:contract.scope,
    migrationChain:contract.migrationChain,
    tableManifestSha256:contract.tableManifestSha256,
    ...overrides
  };
}

function drift(status='DRIFT',overrides={}){
  return {
    schema:'hipico-schema-drift-report.v15',
    candidateSha:SHA,
    status,
    target:{database:'postgres',remote:true},
    missing:status==='DRIFT'?['audit.source','observability.events']:[],
    observed:[],
    ...overrides
  };
}

test('v17 rollout manifest exactly matches the canonical v12-v27 E2E migration order',async()=>{
  const [manifestText,chain]=await Promise.all([
    read('ops/roadmap/hipico-schema-rollout-v17.json'),
    read('scripts/hipico-apply-e2e-schema-v290.mjs')
  ]);
  const manifest=JSON.parse(manifestText);
  assert.equal(manifest.schema,'hipico-schema-rollout.v17');
  assert.equal(manifest.autoApply,false);
  assert.equal(manifest.manualApplyRequired,true);
  assert.equal(manifest.migrations.length,26);
  const parsed=[...chain.matchAll(/'((?:supabase\/sql\/hipico_v[^']+\.sql))'/g)].map((m)=>m[1]);
  const canonical=[...new Set(parsed)].slice(0,26);
  assert.deepEqual(manifest.migrations.map((m)=>m.path),canonical);
  assert.equal(validateMigrationOrder(manifest,chain).ok,true);
});

test('v17 migration units bind every SQL file to a SHA-256 digest',async()=>{
  const manifest=JSON.parse(await read('ops/roadmap/hipico-schema-rollout-v17.json'));
  const units=await loadMigrationUnits(manifest);
  assert.equal(units.length,26);
  for(const unit of units){
    assert.match(unit.sha256,/^[a-f0-9]{64}$/);
    assert.equal(unit.autoApply,false);
    assert.equal(unit.manualReviewRequired,true);
    assert.ok(['LOW','MEDIUM','HIGH'].includes(unit.risk));
  }
});

test('v17 MATCH produces NO_CHANGES without requiring backup evidence',async()=>{
  const manifest=JSON.parse(await read('ops/roadmap/hipico-schema-rollout-v17.json'));
  const units=await loadMigrationUnits(manifest);
  const plan=buildRolloutPlan({
    candidateSha:SHA,
    driftReport:drift('MATCH'),
    migrationUnits:units,
    backupEvidence:null,
    changeTicket:'',
    now:new Date(NOW)
  });
  assert.equal(plan.status,'NO_CHANGES');
  assert.equal(plan.autoApply,false);
  assert.equal(plan.manualApplyRequired,true);
  assert.deepEqual(plan.missingCapabilities,[]);
});

test('v17 DRIFT is READY_FOR_MANUAL_APPLY only with valid backup restore evidence and change ticket',async()=>{
  const manifest=JSON.parse(await read('ops/roadmap/hipico-schema-rollout-v17.json'));
  const units=await loadMigrationUnits(manifest);
  const contract=await loadBackupScopeContract();
  const plan=buildRolloutPlan({
    candidateSha:SHA,
    driftReport:drift(),
    migrationUnits:units,
    backupEvidence:validBackup(contract),
    changeTicket:'#375',
    backupScopeContract:contract,
    now:new Date(NOW)
  });
  assert.equal(plan.status,'READY_FOR_MANUAL_APPLY');
  assert.equal(plan.autoApply,false);
  assert.equal(plan.changeTicket,'#375');
  assert.equal(plan.backup.restoreVerified,true);
  assert.deepEqual(plan.missingCapabilities,['audit.source','observability.events']);
  assert.equal(plan.migrations.length,26);
});

test('v17 DRIFT without verified restore evidence is BLOCKED',async()=>{
  const manifest=JSON.parse(await read('ops/roadmap/hipico-schema-rollout-v17.json'));
  const units=await loadMigrationUnits(manifest);
  const contract=await loadBackupScopeContract();
  const plan=buildRolloutPlan({
    candidateSha:SHA,
    driftReport:drift(),
    migrationUnits:units,
    backupEvidence:validBackup(contract,{restoreVerified:false}),
    changeTicket:'#375',
    backupScopeContract:contract,
    now:new Date(NOW)
  });
  assert.equal(plan.status,'BLOCKED');
  assert.equal(plan.reason,'BACKUP_RESTORE_EVIDENCE_INVALID');
});

test('v17 stale backup evidence is rejected fail-closed',async()=>{
  const contract=await loadBackupScopeContract();
  const result=validateBackupEvidence(validBackup(contract,{checkedAt:'2026-09-16T00:00:00.000Z'}),{
    candidateSha:SHA,
    targetDatabase:'postgres',
    expectedScope:contract.scope,
    expectedMigrationChain:contract.migrationChain,
    expectedTableManifestSha256:contract.tableManifestSha256,
    now:new Date(NOW),
    maxAgeHours:24
  });
  assert.equal(result.ok,false);
  assert.equal(result.reason,'BACKUP_EVIDENCE_STALE');
});

test('v17 invalid or mismatched SHA can never produce rollout readiness',async()=>{
  const manifest=JSON.parse(await read('ops/roadmap/hipico-schema-rollout-v17.json'));
  const units=await loadMigrationUnits(manifest);
  const contract=await loadBackupScopeContract();
  for(const candidateSha of ['', 'abc', 'g'.repeat(40)]){
    const plan=buildRolloutPlan({
      candidateSha,
      driftReport:drift(),
      migrationUnits:units,
      backupEvidence:validBackup(contract),
      changeTicket:'#375',
      backupScopeContract:contract,
      now:new Date(NOW)
    });
    assert.equal(plan.status,'BLOCKED');
    assert.equal(plan.reason,'CANDIDATE_SHA_REQUIRED');
  }
  const mismatch=buildRolloutPlan({
    candidateSha:SHA,
    driftReport:drift('DRIFT',{candidateSha:'b'.repeat(40)}),
    migrationUnits:units,
    backupEvidence:validBackup(contract),
    changeTicket:'#375',
    backupScopeContract:contract,
    now:new Date(NOW)
  });
  assert.equal(mismatch.status,'BLOCKED');
  assert.equal(mismatch.reason,'DRIFT_SHA_MISMATCH');
});

test('v17 planner source has no mutation or auto-apply path',async()=>{
  const source=await read('scripts/hipico-schema-rollout-preflight-v17.mjs');
  assert.doesNotMatch(source,/client\.query\s*\(/i);
  assert.doesNotMatch(source,/\b(?:ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\s+(?:TABLE|INTO|FROM|SCHEMA|FUNCTION|TRIGGER|INDEX)\b/i);
  assert.doesNotMatch(source,/exec(?:File|Sync)?\s*\(/i);
  assert.match(source,/autoApply:false/);
  assert.match(source,/runDriftCheck/);
  assert.doesNotMatch(source,/console\.(?:log|error)\([^\n]*(?:DATABASE_URL|connectionString|password|token)/i);
});


test('v17 manifest/order mismatch blocks rollout readiness',async()=>{
  const manifest=JSON.parse(await read('ops/roadmap/hipico-schema-rollout-v17.json'));
  const units=await loadMigrationUnits(manifest);
  const contract=await loadBackupScopeContract();
  const plan=buildRolloutPlan({
    candidateSha:SHA,
    driftReport:drift(),
    migrationUnits:units,
    backupEvidence:validBackup(contract),
    changeTicket:'#375',
    backupScopeContract:contract,
    orderValidation:{ok:false,reason:'MIGRATION_ORDER_MISMATCH'},
    now:new Date(NOW)
  });
  assert.equal(plan.status,'BLOCKED');
  assert.equal(plan.reason,'MIGRATION_ORDER_MISMATCH');
});

test('v17 drift NOT_EXECUTED never becomes rollout readiness',async()=>{
  const manifest=JSON.parse(await read('ops/roadmap/hipico-schema-rollout-v17.json'));
  const units=await loadMigrationUnits(manifest);
  const contract=await loadBackupScopeContract();
  const plan=buildRolloutPlan({
    candidateSha:SHA,
    driftReport:drift('NOT_EXECUTED',{reason:'DATABASE_URL_REQUIRED'}),
    migrationUnits:units,
    backupEvidence:validBackup(contract),
    changeTicket:'#375',
    backupScopeContract:contract,
    now:new Date(NOW)
  });
  assert.equal(plan.status,'NOT_EXECUTED');
  assert.equal(plan.reason,'DATABASE_URL_REQUIRED');
  assert.equal(plan.autoApply,false);
});
