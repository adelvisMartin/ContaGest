import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');

test('v27 provision SQL is manual, idempotent and consumes the canonical inventory',async()=>{
  const sql=await read('ops/database/provision-hipico-backup-role.sql');
  assert.match(sql,/\\getenv\s+backup_password\s+HIPICO_BACKUP_PASSWORD/);
  assert.match(sql,/ops\/backup\/hipico-public-tables\.txt/);
  assert.match(sql,/CREATE TEMP TABLE hipico_backup_scope/i);
  assert.match(sql,/\\copy\s+hipico_backup_scope/i);
  assert.match(sql,/count\(\*\)\s*=\s*25/i);
  assert.match(sql,/CREATE ROLE hipico_backup/i);
  assert.match(sql,/ALTER ROLE hipico_backup WITH LOGIN PASSWORD/i);
  assert.match(sql,/NOSUPERUSER/i);
  assert.match(sql,/NOCREATEDB/i);
  assert.match(sql,/NOCREATEROLE/i);
  assert.match(sql,/NOINHERIT/i);
  assert.match(sql,/NOREPLICATION/i);
  assert.match(sql,/NOBYPASSRLS/i);
  assert.match(sql,/REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM hipico_backup/i);
  assert.match(sql,/GRANT SELECT ON TABLE public\.%I TO hipico_backup/i);
  assert.match(sql,/hipico_backup_read_all/i);
  assert.match(sql,/REVOKE service_role FROM hipico_backup/i);
  assert.doesNotMatch(sql,/\bINHERIT\b(?![^\n]*NOINHERIT)/i);
  assert.doesNotMatch(sql,/PASSWORD\s+'[^']+'/i);
});

test('v27 SQL supports PRE_ROLLOUT and STEADY_STATE without duplicating table names',async()=>{
  const sql=await read('ops/database/provision-hipico-backup-role.sql');
  assert.match(sql,/PRE_ROLLOUT/);
  assert.match(sql,/STEADY_STATE/);
  assert.match(sql,/HIPICO_BACKUP_ROLE_MODE/);
  for(const table of ['hipico_outbox','hipico_users','hipico_workspaces']){
    assert.doesNotMatch(sql,new RegExp(`public\\.${table}\\b`));
  }
});

test('v27 manual verify SQL fails closed on role, grants, auth and cross-scope drift',async()=>{
  const sql=await read('ops/database/verify-hipico-backup-role.sql');
  assert.match(sql,/ops\/backup\/hipico-public-tables\.txt/);
  assert.match(sql,/rolinherit/i);
  assert.match(sql,/service_role/i);
  assert.match(sql,/information_schema\.role_table_grants/i);
  assert.match(sql,/CROSS_SCOPE_GRANT/i);
  assert.match(sql,/MUTABLE_PRIVILEGE/i);
  assert.match(sql,/AUTH_SCHEMA_ACCESS/i);
  assert.match(sql,/TABLE_MISSING/i);
  assert.match(sql,/RLS_POLICY_MISSING/i);
  assert.match(sql,/\\quit\s+2/);
});

test('v27 shell wrapper delegates provisioning to the SQL artifact and requires secrets via env',async()=>{
  const shell=await read('ops/database/provision-hipico-backup-role.sh');
  assert.match(shell,/HIPICO_BACKUP_DDL_URL/);
  assert.match(shell,/HIPICO_BACKUP_PASSWORD/);
  assert.match(shell,/HIPICO_BACKUP_ROLE_MODE/);
  assert.match(shell,/provision-hipico-backup-role\.sql/);
  assert.doesNotMatch(shell,/CREATE ROLE hipico_backup/);
  assert.doesNotMatch(shell,/ALTER ROLE hipico_backup WITH LOGIN/);
});

test('v27 verifier checks NOINHERIT in the existing read-only Node evidence path',async()=>{
  const source=await read('scripts/hipico-backup-role-verify-v24.mjs');
  assert.match(source,/rolinherit\s+as\s+inherit/i);
  assert.match(source,/ROLE_INHERIT_FORBIDDEN/);
  assert.match(source,/inherit:roleRow\.inherit===true/);
});

test('v27 activation runbook requires verify-before-secrets and documents safe rollback',async()=>{
  const doc=await read('docs/hipico/HIPICO_BACKUP_ROLE_ACTIVATION.md');
  assert.match(doc,/PRE_ROLLOUT/);
  assert.match(doc,/STEADY_STATE/);
  assert.match(doc,/provision-hipico-backup-role\.sh/);
  assert.match(doc,/hipico-backup-role-verify-v24\.mjs/);
  assert.match(doc,/PASS.*secrets|secrets.*PASS/is);
  assert.match(doc,/backup en curso|backup in progress/i);
  assert.match(doc,/DROP ROLE hipico_backup/i);
  assert.match(doc,/NOINHERIT/);
});

test('v27 no GitHub workflow provisions the backup role',async()=>{
  const workflows=[
    '.github/workflows/hipico-backup-role-verify-v24.yml',
    '.github/workflows/hipico-schema-backup-restore-v23.yml',
    '.github/workflows/hipico-schema-change-control-v24.yml'
  ];
  for(const file of workflows){
    const source=await read(file);
    assert.doesNotMatch(source,/provision-hipico-backup-role\.(?:sh|sql)/i,`${file} must remain verification-only`);
  }
});
