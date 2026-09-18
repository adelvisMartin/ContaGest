import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow=await readFile(
  new URL('../.github/workflows/hipico-schema-change-control-v24.yml',import.meta.url),
  'utf8'
);

test('v26 change-control pins PRE_ROLLOUT for role verification and backup',()=>{
  assert.match(workflow,/HIPICO_BACKUP_ROLE_MODE:\s*PRE_ROLLOUT/);
  assert.match(workflow,/HIPICO_BACKUP_MODE:\s*PRE_ROLLOUT/);
  assert.match(
    workflow,
    /HIPICO_BACKUP_ROLE_REPORT:\s*artifacts\/qa\/hipico-schema-change-control\/\$\{\{\s*inputs\.candidate_sha\s*\}\}\/backup-role\.json/
  );
});

test('v26 verifies hipico_backup before producing any backup',()=>{
  const verify=workflow.indexOf('node scripts/hipico-backup-role-verify-v24.mjs');
  const backup=workflow.indexOf('bash ops/backup/hipico-backup-postgres.sh');
  const restore=workflow.indexOf('bash ops/backup/hipico-restore-drill.sh');
  const preflight=workflow.indexOf('node scripts/hipico-schema-rollout-preflight-v17.mjs');

  assert.ok(verify>=0,'backup role verifier missing');
  assert.ok(backup>verify,'backup must run after role verification');
  assert.ok(restore>backup,'restore must follow backup');
  assert.ok(preflight>restore,'preflight must run after restore');
});

test('v26 role verification and backup share the same dedicated database URL',()=>{
  assert.match(workflow,/HIPICO_BACKUP_DATABASE_URL:\s*\$\{\{\s*secrets\.HIPICO_BACKUP_DATABASE_URL\s*\}\}/);
  const verifyBlock=workflow.slice(
    workflow.indexOf('- name: Verify hipico_backup role'),
    workflow.indexOf('- name: Produce encrypted off-site backup')
  );
  assert.doesNotMatch(verifyBlock,/SERVICE_ROLE|SUPABASE_SERVICE_ROLE/i);
});

test('v26 never auto-provisions the role and remains fail-closed',()=>{
  assert.doesNotMatch(workflow,/provision-hipico-backup-role\.sh/);
  assert.doesNotMatch(workflow,/continue-on-error:\s*true/i);
  assert.doesNotMatch(workflow,/supabase\s+db\s+push/i);
  assert.doesNotMatch(workflow,/supabase\s+migration\s+up/i);
  assert.doesNotMatch(workflow,/psql[^\n]*HIPICO_BACKUP_DATABASE_URL[^\n]*-f/i);
});

test('v26 archives role evidence with the same SHA-bound change-control artifact',()=>{
  assert.match(workflow,/backup-role\.json/);
  assert.match(workflow,/hipico-schema-change-control-\$\{\{\s*inputs\.candidate_sha\s*\}\}/);
  assert.match(workflow,/backup-evidence\.json/);
  assert.match(workflow,/change-plan\.json/);
});
