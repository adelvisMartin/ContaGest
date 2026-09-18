import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyBackupRoleVerification } from '../scripts/hipico-backup-role-verify-v24.mjs';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');
const SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW=new Date('2026-09-18T03:35:00.000Z');

function role(overrides={}){
  return {
    exists:true,
    login:true,
    inherit:false,
    superuser:false,
    createdb:false,
    createrole:false,
    replication:false,
    bypassrls:false,
    serviceRoleMember:false,
    schemaUsage:true,
    schemaCreate:false,
    databaseConnect:true,
    authSchemaUsage:false,
    authExplicitGrants:[],
    ...overrides
  };
}
function observation(overrides={}){
  const expectedTables=Array.from({length:25},(_,i)=>`hipico_table_${i}`);
  return {
    role:role(),
    expectedTables,
    observedTables:expectedTables.map((table)=>({
      table,exists:true,select:true,mutablePrivileges:[],rls:false,backupPolicy:false
    })),
    crossScopeGrants:[],
    ...overrides
  };
}

test('v26 hardened hipico_backup role PASS requires NOINHERIT and no auth access',()=>{
  const report=classifyBackupRoleVerification({
    candidateSha:SHA,
    observation:observation(),
    mode:'STEADY_STATE',
    now:NOW
  });
  assert.equal(report.status,'PASS');
});

test('v26 INHERIT or auth schema/grants fail closed',()=>{
  const inherit=classifyBackupRoleVerification({
    candidateSha:SHA,
    observation:observation({role:role({inherit:true})}),
    mode:'STEADY_STATE',
    now:NOW
  });
  assert.equal(inherit.status,'FAIL');
  assert.ok(inherit.findings.includes('ROLE_INHERIT_FORBIDDEN'));

  const authUsage=classifyBackupRoleVerification({
    candidateSha:SHA,
    observation:observation({role:role({authSchemaUsage:true})}),
    mode:'STEADY_STATE',
    now:NOW
  });
  assert.equal(authUsage.status,'FAIL');
  assert.ok(authUsage.findings.includes('AUTH_SCHEMA_USAGE_FORBIDDEN'));

  const authGrant=classifyBackupRoleVerification({
    candidateSha:SHA,
    observation:observation({role:role({authExplicitGrants:['auth.users:SELECT']})}),
    mode:'STEADY_STATE',
    now:NOW
  });
  assert.equal(authGrant.status,'FAIL');
  assert.ok(authGrant.findings.includes('AUTH_EXPLICIT_GRANT:auth.users:SELECT'));
});

test('v26 provisioner uses SQL baseline with NOINHERIT and revokes auth schema access',async()=>{
  const [shell,sql]=await Promise.all([
    read('ops/database/provision-hipico-backup-role.sh'),
    read('ops/database/provision-hipico-backup-role.sql')
  ]);
  assert.match(shell,/provision-hipico-backup-role\.sql/);
  assert.match(sql,/CREATE ROLE hipico_backup/i);
  assert.match(sql,/NOINHERIT/i);
  assert.doesNotMatch(sql,/\bINHERIT\b(?![^\n]*NOINHERIT)/i);
  assert.match(sql,/REVOKE ALL ON SCHEMA auth FROM hipico_backup/i);
  assert.match(sql,/REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth FROM hipico_backup/i);
  assert.match(sql,/REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth FROM hipico_backup/i);
  assert.match(sql,/REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA auth FROM hipico_backup/i);
  assert.doesNotMatch(sql,/GRANT\s+.*\s+ON\s+.*auth\./i);
  assert.doesNotMatch(sql,/PASSWORD\s+'[^']+'/i);
});

test('v26 verification SQL is catalog-only and rejects role/auth privilege drift',async()=>{
  const sql=await read('ops/database/verify-hipico-backup-role.sql');
  assert.match(sql,/rolinherit/i);
  assert.match(sql,/rolbypassrls/i);
  assert.match(sql,/service_role/i);
  assert.match(sql,/has_schema_privilege\('hipico_backup','auth','USAGE'\)/i);
  assert.match(sql,/information_schema\.role_table_grants/i);
  assert.match(sql,/table_schema='auth'/i);
  assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|INSERT|UPDATE|DELETE)\s+(?:ROLE|TABLE|SCHEMA|ON|INTO|FROM)/i);
});

test('v26 activation runbook is manual, secret-safe and has rollback/verification ordering',async()=>{
  const doc=await read('docs/hipico/HIPICO_BACKUP_ROLE_ACTIVATION.md');
  assert.match(doc,/manual/i);
  assert.match(doc,/HIPICO_BACKUP_PASSWORD/);
  assert.match(doc,/HIPICO_BACKUP_DDL_URL/);
  assert.match(doc,/PRE_ROLLOUT/);
  assert.match(doc,/STEADY_STATE/);
  assert.match(doc,/verify/i);
  assert.match(doc,/rollback/i);
  assert.match(doc,/backup.*curso|backup.*running|backup.*in progress/i);
  assert.match(doc,/service_role/i);
  assert.match(doc,/auth/i);
  assert.doesNotMatch(doc,/postgres(?:ql)?:\/\/[^\s]+:[^\s]+@/i);
});

test('v26 workflow remains verification-only and never applies provisioning SQL',async()=>{
  const workflow=await read('.github/workflows/hipico-backup-role-verify-v24.yml');
  assert.doesNotMatch(workflow,/provision-hipico-backup-role(?:\.sh|\.sql)/);
  assert.doesNotMatch(workflow,/psql\s+.*provision/i);
});
