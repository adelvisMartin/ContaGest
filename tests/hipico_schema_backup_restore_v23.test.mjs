import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildBackupEvidence } from '../scripts/hipico-schema-backup-evidence-v23.mjs';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');
const SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TABLE_SHA='b'.repeat(64);
const NOW=new Date('2026-09-18T02:45:00.000Z');

function counts(value=1){
  return Object.fromEntries([
    'hipico_agent_evaluations','hipico_audit_events','hipico_automation_transition_events',
    'hipico_bot_channels','hipico_document_events','hipico_document_sources','hipico_documents',
    'hipico_domain_aggregates','hipico_domain_events','hipico_group_automation','hipico_ledger_entries',
    'hipico_meetings','hipico_messages','hipico_observability_events','hipico_operation_events',
    'hipico_outbox','hipico_outbox_receipts','hipico_profiles','hipico_provider_evidence',
    'hipico_race_events','hipico_races','hipico_reconciliations','hipico_shadow_evaluations',
    'hipico_users','hipico_workspaces'
  ].map((name)=>[name,value]));
}

test('v23 evidence is PASS only after exact-scope restore verification',()=>{
  const evidence=buildBackupEvidence({
    candidateSha:SHA,
    backupId:'hipico-backup-001',
    restoreTestId:'hipico-restore-001',
    targetDatabase:'postgres',
    scope:'hipico-canonical-v12-v27',
    migrationChain:'v12-v27',
    tableManifestSha256:TABLE_SHA,
    sourceCounts:counts(2),
    restoredCounts:counts(2),
    orphanForeignKeys:0,
    restoreVerified:true,
    now:NOW
  });
  assert.equal(evidence.schema,'hipico-schema-backup-evidence.v17');
  assert.equal(evidence.status,'PASS');
  assert.equal(evidence.restoreVerified,true);
  assert.equal(evidence.candidateSha,SHA);
  assert.equal(evidence.scope,'hipico-canonical-v12-v27');
  assert.equal(evidence.migrationChain,'v12-v27');
  assert.equal(evidence.tableManifestSha256,TABLE_SHA);
  assert.equal(evidence.tableCount,25);
});

test('v23 evidence fails closed on count mismatch, orphan FK, invalid SHA or wrong scope',()=>{
  const base={
    candidateSha:SHA,
    backupId:'hipico-backup-001',
    restoreTestId:'hipico-restore-001',
    targetDatabase:'postgres',
    scope:'hipico-canonical-v12-v27',
    migrationChain:'v12-v27',
    tableManifestSha256:TABLE_SHA,
    sourceCounts:counts(1),
    restoredCounts:counts(1),
    orphanForeignKeys:0,
    restoreVerified:true,
    now:NOW
  };
  const mismatch=counts(1);
  mismatch.hipico_outbox=0;
  assert.equal(buildBackupEvidence({...base,restoredCounts:mismatch}).status,'FAIL');
  assert.equal(buildBackupEvidence({...base,orphanForeignKeys:1}).status,'FAIL');
  assert.equal(buildBackupEvidence({...base,candidateSha:'abc'}).status,'FAIL');
  assert.equal(buildBackupEvidence({...base,scope:'contagest-prisma-data'}).status,'FAIL');
  assert.equal(buildBackupEvidence({...base,restoreVerified:false}).status,'FAIL');
});

test('v23 backup script is dedicated-role, SELECT-only, inventory-driven and encrypts before off-site copy',async()=>{
  const source=await read('ops/backup/hipico-backup-postgres.sh');
  assert.match(source,/HIPICO_BACKUP_DATABASE_URL/);
  assert.match(source,/HIPICO_BACKUP_EXPECTED_ROLE:-hipico_backup/);
  assert.match(source,/rolbypassrls/);
  assert.match(source,/rolsuper/);
  assert.match(source,/rolcreatedb/);
  assert.match(source,/rolcreaterole/);
  assert.match(source,/hipico-public-tables\.txt/);
  assert.match(source,/table_count.*25|25.*table_count/i);
  assert.match(source,/--data-only/);
  assert.match(source,/--enable-row-security/);
  assert.match(source,/--no-owner/);
  assert.match(source,/--no-acl/);
  assert.match(source,/auth-user-ids/);
  assert.doesNotMatch(source,/encrypted_password|refresh_token|raw_user_meta_data|raw_app_meta_data/i);
  assert.match(source,/age -r/);
  assert.match(source,/rclone copyto/);
  assert.match(source,/rclone lsf/);
  assert.doesNotMatch(source,/rclone\s+(?:delete|purge|deletefile)/);
  assert.doesNotMatch(source,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i);
});

test('v23 ephemeral helper creates only minimal auth.users identity contract on disposable DB',async()=>{
  const source=await read('ops/database/prepare-hipico-restore-ephemeral.sql');
  assert.match(source,/\(_drill\|_restore\)/);
  assert.match(source,/CREATE SCHEMA IF NOT EXISTS auth/i);
  assert.match(source,/CREATE TABLE IF NOT EXISTS auth\.users/i);
  assert.match(source,/id\s+uuid\s+PRIMARY KEY/i);
  assert.match(source,/email\s+text/i);
  assert.match(source,/raw_app_meta_data\s+jsonb/i);
  assert.match(source,/raw_user_meta_data\s+jsonb/i);
  assert.doesNotMatch(source,/encrypted_password|refresh_token|token_hash|session/i);
});

test('v23 restore drill is local-only, candidate-bound, replays Prisma + v12-v27, compares 25 counts and checks FKs',async()=>{
  const source=await read('ops/backup/hipico-restore-drill.sh');
  assert.match(source,/HIPICO_RESTORE_DATABASE_URL/);
  assert.match(source,/127\.0\.0\.1|localhost/);
  assert.match(source,/\(_drill\|_restore\)/);
  assert.match(source,/HIPICO_CANDIDATE_SHA/);
  assert.match(source,/git rev-parse HEAD/);
  assert.match(source,/prepare-hipico-restore-ephemeral\.sql/);
  assert.match(source,/prisma migrate deploy/);
  assert.match(source,/hipico-schema-rollout-v17\.json/);
  assert.match(source,/v12-v27/);
  assert.match(source,/pg_restore/);
  assert.match(source,/source-counts/);
  assert.match(source,/restored-counts/);
  assert.match(source,/orphan/i);
  assert.match(source,/hipico-schema-backup-evidence-v23\.mjs/);
  assert.doesNotMatch(source,/ALLOW_UNSAFE_RESTORE|ALLOW_PRIMARY_HOST_RESTORE/);
});

test('v23 workflow is manual-only and binds backup+restore evidence to candidate SHA',async()=>{
  const workflow=await read('.github/workflows/hipico-schema-backup-restore-v23.yml');
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/\npush:/);
  assert.doesNotMatch(workflow,/\npull_request:/);
  assert.doesNotMatch(workflow,/\nschedule:/);
  assert.match(workflow,/candidate_sha:/);
  assert.match(workflow,/ref:\s*\$\{\{\s*inputs\.candidate_sha\s*\}\}/);
  assert.match(workflow,/HIPICO_CANDIDATE_SHA:\s*\$\{\{\s*inputs\.candidate_sha\s*\}\}/);
  assert.match(workflow,/HIPICO_BACKUP_DATABASE_URL:\s*\$\{\{\s*secrets\.HIPICO_BACKUP_DATABASE_URL\s*\}\}/);
  assert.match(workflow,/postgres:17/);
  assert.match(workflow,/hipico-backup-postgres\.sh/);
  assert.match(workflow,/hipico-restore-drill\.sh/);
  assert.match(workflow,/backup-evidence\.json/);
  assert.match(workflow,/actions\/upload-artifact/);
});
