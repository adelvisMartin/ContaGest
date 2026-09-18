import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');

test('v24 change-control workflow is manual-only with exact SHA and change ticket inputs',async()=>{
  const workflow=await read('.github/workflows/hipico-schema-change-control-v24.yml');
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/\npush:/);
  assert.doesNotMatch(workflow,/\npull_request:/);
  assert.doesNotMatch(workflow,/\nschedule:/);
  assert.match(workflow,/candidate_sha:/);
  assert.match(workflow,/change_ticket:/);
  assert.match(workflow,/ref:\s*\$\{\{\s*inputs\.candidate_sha\s*\}\}/);
  assert.match(workflow,/HIPICO_CANDIDATE_SHA:\s*\$\{\{\s*inputs\.candidate_sha\s*\}\}/);
  assert.match(workflow,/HIPICO_SCHEMA_CHANGE_TICKET:\s*\$\{\{\s*inputs\.change_ticket\s*\}\}/);
});

test('v24 reuses v23 backup restore before running v17 preflight',async()=>{
  const workflow=await read('.github/workflows/hipico-schema-change-control-v24.yml');
  const backup=workflow.indexOf('bash ops/backup/hipico-backup-postgres.sh');
  const restore=workflow.indexOf('bash ops/backup/hipico-restore-drill.sh');
  const preflight=workflow.indexOf('node scripts/hipico-schema-rollout-preflight-v17.mjs');
  assert.ok(backup>=0,'v23 backup producer missing');
  assert.ok(restore>backup,'v23 restore must follow backup');
  assert.ok(preflight>restore,'v17 preflight must run only after restore evidence');
  assert.match(workflow,/HIPICO_SCHEMA_BACKUP_EVIDENCE:\s*artifacts\/qa\/hipico-schema-change-control\/\$\{\{\s*inputs\.candidate_sha\s*\}\}\/backup-evidence\.json/);
  assert.match(workflow,/HIPICO_SCHEMA_ROLLOUT_REPORT:\s*artifacts\/qa\/hipico-schema-change-control\/\$\{\{\s*inputs\.candidate_sha\s*\}\}\/change-plan\.json/);
});

test('v24 uses separate dedicated backup and read-only verification database secrets',async()=>{
  const workflow=await read('.github/workflows/hipico-schema-change-control-v24.yml');
  assert.match(workflow,/HIPICO_BACKUP_DATABASE_URL:\s*\$\{\{\s*secrets\.HIPICO_BACKUP_DATABASE_URL\s*\}\}/);
  assert.match(workflow,/HIPICO_BACKUP_EXPECTED_ROLE:\s*hipico_backup/);
  assert.match(workflow,/HIPICO_SCHEMA_DRIFT_DATABASE_URL:\s*\$\{\{\s*secrets\.HIPICO_SCHEMA_VERIFY_DATABASE_URL\s*\}\}/);
  assert.doesNotMatch(workflow,/SERVICE_ROLE|SUPABASE_SERVICE_ROLE/i);
});

test('v24 never applies remote migrations and READY remains manual-only',async()=>{
  const workflow=await read('.github/workflows/hipico-schema-change-control-v24.yml');
  for(const forbidden of [
    /supabase\s+db\s+push/i,
    /supabase\s+migration\s+up/i,
    /prisma\s+migrate\s+deploy[^\n]*HIPICO_SCHEMA_DRIFT_DATABASE_URL/i,
    /psql[^\n]*(HIPICO_SCHEMA_DRIFT_DATABASE_URL|HIPICO_BACKUP_DATABASE_URL)[^\n]*-f/i,
    /apply[_ -]?migration/i
  ]) assert.doesNotMatch(workflow,forbidden);
  assert.match(workflow,/READY_FOR_MANUAL_APPLY/);
  assert.match(workflow,/NO_CHANGES/);
  assert.match(workflow,/BLOCKED/);
  assert.match(workflow,/NOT_EXECUTED/);
  assert.doesNotMatch(workflow,/\b(?:DEPLOYED|APPLIED)\b/);
});

test('v24 publishes SHA-bound plan and backup evidence artifacts',async()=>{
  const workflow=await read('.github/workflows/hipico-schema-change-control-v24.yml');
  assert.match(workflow,/actions\/upload-artifact/);
  assert.match(workflow,/hipico-schema-change-control-\$\{\{\s*inputs\.candidate_sha\s*\}\}/);
  assert.match(workflow,/change-plan\.json/);
  assert.match(workflow,/backup-evidence\.json/);
  assert.match(workflow,/backup-manifest\.json/);
});

test('v24 keeps restore target disposable and local',async()=>{
  const workflow=await read('.github/workflows/hipico-schema-change-control-v24.yml');
  assert.match(workflow,/postgres:17/);
  assert.match(workflow,/127\.0\.0\.1/);
  assert.match(workflow,/hipico_change_control_restore/);
  assert.match(workflow,/HIPICO_RESTORE_DATABASE_URL:/);
});
