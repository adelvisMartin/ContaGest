import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyBackupRoleVerification } from '../scripts/hipico-backup-role-verify-v24.mjs';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');
const SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW=new Date('2026-09-18T03:10:00.000Z');

function validObservation(overrides={}){
  return {
    role:{
      exists:true,
      login:true,
      superuser:false,
      createdb:false,
      createrole:false,
      inherit:false,
      replication:false,
      bypassrls:false,
      serviceRoleMember:false,
      schemaUsage:true,
      schemaCreate:false,
      databaseConnect:true
    },
    expectedTables:Array.from({length:25},(_,i)=>`hipico_table_${String(i+1).padStart(2,'0')}`),
    observedTables:Array.from({length:25},(_,i)=>({
      table:`hipico_table_${String(i+1).padStart(2,'0')}`,
      exists:true,
      select:true,
      mutablePrivileges:[],
      rls:i%2===0,
      backupPolicy:i%2===0
    })),
    crossScopeGrants:[],
    ...overrides
  };
}

test('v24 valid least-privilege observation is PASS',()=>{
  const report=classifyBackupRoleVerification({
    candidateSha:SHA,
    observation:validObservation(),
    mode:'STEADY_STATE',
    now:NOW
  });
  assert.equal(report.status,'PASS');
  assert.equal(report.reason,null);
  assert.deepEqual(report.findings,[]);
});

test('v24 PRE_ROLLOUT allows canonical tables that do not exist yet and records them as deferred',()=>{
  const obs=validObservation();
  obs.observedTables[0]={...obs.observedTables[0],exists:false,select:false,rls:false,backupPolicy:false};
  const report=classifyBackupRoleVerification({
    candidateSha:SHA,
    observation:obs,
    mode:'PRE_ROLLOUT',
    now:NOW
  });
  assert.equal(report.status,'PASS');
  assert.deepEqual(report.deferredTables,[obs.observedTables[0].table]);
});

test('v24 STEADY_STATE rejects any missing canonical table',()=>{
  const obs=validObservation();
  obs.observedTables[0]={...obs.observedTables[0],exists:false,select:false,rls:false,backupPolicy:false};
  const report=classifyBackupRoleVerification({
    candidateSha:SHA,
    observation:obs,
    mode:'STEADY_STATE',
    now:NOW
  });
  assert.equal(report.status,'FAIL');
  assert.ok(report.findings.includes(`TABLE_MISSING:${obs.observedTables[0].table}`));
});

test('v24 missing role is FAIL',()=>{
  const obs=validObservation();
  obs.role.exists=false;
  const report=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,mode:'STEADY_STATE',now:NOW});
  assert.equal(report.status,'FAIL');
  assert.ok(report.findings.includes('ROLE_MISSING'));
});

test('v24 mutable privilege is FAIL',()=>{
  const obs=validObservation();
  obs.observedTables[0].mutablePrivileges=['INSERT'];
  const report=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,mode:'STEADY_STATE',now:NOW});
  assert.equal(report.status,'FAIL');
  assert.ok(report.findings.some((x)=>x.startsWith('MUTABLE_PRIVILEGE:')));
});

test('v24 inherited privileges are forbidden',()=>{
  const obs=validObservation();
  obs.role.inherit=true;
  const report=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,mode:'STEADY_STATE',now:NOW});
  assert.equal(report.status,'FAIL');
  assert.ok(report.findings.includes('ROLE_INHERIT_FORBIDDEN'));
});

test('v24 cross-scope grant is FAIL',()=>{
  const obs=validObservation({crossScopeGrants:['public.CustomerAccount']});
  const report=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,mode:'STEADY_STATE',now:NOW});
  assert.equal(report.status,'FAIL');
  assert.ok(report.findings.includes('CROSS_SCOPE_GRANT:public.CustomerAccount'));
});

test('v24 effective auth schema access is FAIL',()=>{
  const obs=validObservation({authScopeAccess:['TABLE:users']});
  const report=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,mode:'STEADY_STATE',now:NOW});
  assert.equal(report.status,'FAIL');
  assert.ok(report.findings.includes('AUTH_SCHEMA_ACCESS:TABLE:users'));
});

test('v24 default privileges that could reach future tables are FAIL',()=>{
  const obs=validObservation({defaultPrivileges:['r']});
  const report=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,mode:'STEADY_STATE',now:NOW});
  assert.equal(report.status,'FAIL');
  assert.ok(report.findings.includes('DEFAULT_PRIVILEGE_FORBIDDEN:r'));
});

test('v24 RLS table without backup policy is FAIL',()=>{
  const obs=validObservation();
  obs.observedTables[0].backupPolicy=false;
  const report=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,mode:'STEADY_STATE',now:NOW});
  assert.equal(report.status,'FAIL');
  assert.ok(report.findings.some((x)=>x.startsWith('RLS_POLICY_MISSING:')));
});

test('v24 invalid SHA is NOT_EXECUTED',()=>{
  const report=classifyBackupRoleVerification({
    candidateSha:'abc',
    observation:validObservation(),
    mode:'STEADY_STATE',
    now:NOW
  });
  assert.equal(report.status,'NOT_EXECUTED');
  assert.equal(report.reason,'CANDIDATE_SHA_REQUIRED');
});

test('v24 provisioner consumes canonical inventory and delegates role SQL to one versioned artifact',async()=>{
  const [script,sql,inventory]=await Promise.all([
    read('ops/database/provision-hipico-backup-role.sh'),
    read('ops/database/provision-hipico-backup-role.sql'),
    read('ops/backup/hipico-public-tables.txt')
  ]);
  const tables=inventory.split(/\r?\n/).map((x)=>x.trim()).filter((x)=>x&&!x.startsWith('#'));
  assert.equal(tables.length,25);
  assert.match(script,/ops\/backup\/hipico-public-tables\.txt/);
  assert.doesNotMatch(script,/HIPICO_BACKUP_TABLE_FILE/);
  assert.match(script,/HIPICO_BACKUP_PASSWORD/);
  assert.match(script,/HIPICO_BACKUP_DDL_URL/);
  assert.match(script,/HIPICO_BACKUP_ROLE_MODE/);
  assert.match(script,/provision-hipico-backup-role\.sql/);
  assert.doesNotMatch(script,/CREATE ROLE hipico_backup/);
  assert.match(sql,/ops\/backup\/hipico-public-tables\.txt/);
  assert.match(sql,/CREATE ROLE hipico_backup/);
  for(const flag of ['NOSUPERUSER','NOCREATEDB','NOCREATEROLE','NOINHERIT','NOREPLICATION','NOBYPASSRLS']){
    assert.match(sql,new RegExp(flag));
  }
  assert.match(sql,/REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM hipico_backup/);
  assert.match(sql,/GRANT SELECT ON TABLE public\.%I TO hipico_backup/);
  assert.match(sql,/CREATE POLICY hipico_backup_read_all/);
  for(const table of tables){
    assert.doesNotMatch(sql,new RegExp(`public\\.${table}\\b`));
  }
});

test('v24 verifier is catalog-read-only and inventory-driven',async()=>{
  const source=await read('scripts/hipico-backup-role-verify-v24.mjs');
  assert.match(source,/hipico-public-tables\.txt/);
  assert.match(source,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/i);
  assert.match(source,/ROLLBACK/i);
  assert.doesNotMatch(source,/\bCOMMIT\b/i);
  assert.doesNotMatch(source,/\b(?:ALTER\s+(?:ROLE|TABLE|SCHEMA)|CREATE\s+(?:ROLE|POLICY|TABLE|SCHEMA)|DROP\s+(?:ROLE|POLICY|TABLE|SCHEMA)|TRUNCATE\s+TABLE|GRANT\s+|REVOKE\s+)\b/i);
  assert.match(source,/information_schema\.role_table_grants/);
  assert.match(source,/pg_policies/);
  assert.match(source,/pg_auth_members/);
  assert.match(source,/has_database_privilege/);
  assert.match(source,/has_schema_privilege/);
});

test('v24 workflow is manual verification-only and never provisions',async()=>{
  const workflow=await read('.github/workflows/hipico-backup-role-verify-v24.yml');
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/mode:/);
  assert.match(workflow,/PRE_ROLLOUT/);
  assert.match(workflow,/STEADY_STATE/);
  assert.doesNotMatch(workflow,/\npush:/);
  assert.doesNotMatch(workflow,/\npull_request:/);
  assert.doesNotMatch(workflow,/\nschedule:/);
  assert.match(workflow,/HIPICO_BACKUP_DATABASE_URL:\s*\$\{\{\s*secrets\.HIPICO_BACKUP_DATABASE_URL\s*\}\}/);
  assert.match(workflow,/node scripts\/hipico-backup-role-verify-v24\.mjs/);
  assert.doesNotMatch(workflow,/provision-hipico-backup-role\.sh/);
  assert.match(workflow,/actions\/upload-artifact/);
});
