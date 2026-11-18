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
      connectedUser:'hipico_backup',
      sessionUser:'hipico_backup',
      login:true,
      superuser:false,
      createdb:false,
      createrole:false,
      inherit:false,
      replication:false,
      bypassrls:false,
      serviceRoleMember:false,
      roleMemberships:[],
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
    authScopeAccess:[],
    defaultPrivileges:[],
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


test('v24 role verification fails closed if the observed database connection is not hipico_backup',()=>{
  for(const connectedUser of ['postgres','service_role',null]){
    const obs=validObservation();
    obs.role.connectedUser=connectedUser;
    const report=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,mode:'STEADY_STATE',now:NOW});
    assert.equal(report.status,'FAIL');
    assert.ok(report.findings.includes('BACKUP_CONNECTION_ROLE_MISMATCH'));
  }
  for(const sessionUser of ['postgres','service_role',null]){
    const obs=validObservation();
    obs.role.sessionUser=sessionUser;
    const report=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,mode:'STEADY_STATE',now:NOW});
    assert.equal(report.status,'FAIL');
    assert.ok(report.findings.includes('BACKUP_CONNECTION_ROLE_MISMATCH'));
  }
});

test('v24 unknown or omitted dangerous privileges cannot produce PASS',()=>{
  const privilegeCodes={
    superuser:'ROLE_SUPERUSER_FORBIDDEN',
    createdb:'ROLE_CREATEDB_FORBIDDEN',
    createrole:'ROLE_CREATEROLE_FORBIDDEN',
    replication:'ROLE_REPLICATION_FORBIDDEN',
    bypassrls:'ROLE_BYPASSRLS_FORBIDDEN',
    serviceRoleMember:'SERVICE_ROLE_MEMBERSHIP_FORBIDDEN',
    schemaCreate:'PUBLIC_SCHEMA_CREATE_FORBIDDEN'
  };
  for(const [key,code] of Object.entries(privilegeCodes)){
    for(const value of [undefined,null,'false',0]){
      const observation=validObservation();
      if(value===undefined)delete observation.role[key];
      else observation.role[key]=value;
      const result=classifyBackupRoleVerification({
        candidateSha:SHA,observation,mode:'STEADY_STATE',now:NOW
      });
      assert.equal(result.status,'FAIL',`${key}=${String(value)}`);
      assert.ok(result.findings.includes(code),`${key}=${String(value)}`);
    }
  }
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
  assert.doesNotMatch(source,/from information_schema\.role_table_grants/);
  assert.match(source,/has_any_column_privilege/);
  assert.match(source,/role_memberships/);
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


test('v24 unknown privileged flags cannot prove a least-privilege connection',()=>{
  for(const [flag,error] of [
    ['superuser','ROLE_SUPERUSER_FORBIDDEN'],['createdb','ROLE_CREATEDB_FORBIDDEN'],
    ['createrole','ROLE_CREATEROLE_FORBIDDEN'],['replication','ROLE_REPLICATION_FORBIDDEN'],
    ['bypassrls','ROLE_BYPASSRLS_FORBIDDEN'],
    ['serviceRoleMember','SERVICE_ROLE_MEMBERSHIP_FORBIDDEN'],
    ['schemaCreate','PUBLIC_SCHEMA_CREATE_FORBIDDEN']
  ])for(const value of [undefined,null,true]){
    const observation=validObservation();
    observation.role[flag]=value;
    const report=classifyBackupRoleVerification({candidateSha:SHA,observation,now:NOW});
    assert.equal(report.status,'FAIL',flag);
    assert.ok(report.findings.includes(error),flag);
  }
});

test('v24 unknown grants, auth schema or default grants evidence must not report PASS',()=>{
  for(const [key,code] of [
    ['crossScopeGrants','CROSS_SCOPE_GRANTS_NOT_VERIFIED'],
    ['authScopeAccess','AUTH_SCOPE_ACCESS_NOT_VERIFIED'],
    ['defaultPrivileges','DEFAULT_PRIVILEGES_NOT_VERIFIED']
  ])for(const value of [undefined,null]){
    const obs=validObservation();obs[key]=value;
    const result=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,now:NOW});
    assert.equal(result.status,'FAIL',key);
    assert.ok(result.findings.includes(code));
  }
});

test('v24 table privilege proof must explicitly include all permission and RLS fields',()=>{
  for(const [key,code] of [
    ['mutablePrivileges','MUTABLE_PRIVILEGES_NOT_VERIFIED'],
    ['rls','RLS_STATE_NOT_VERIFIED'],
    ['backupPolicy','BACKUP_POLICY_NOT_VERIFIED']
  ]){
    const obs=validObservation();delete obs.observedTables[0][key];
    const result=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,now:NOW});
    assert.equal(result.status,'FAIL',key);
    assert.ok(result.findings.some(f=>f.startsWith(code)),key);
  }
});

test('v24 must reject duplicate/invalid table inventory and malformed observations',()=>{
  for(const change of [
    obs=>obs.expectedTables[24]=obs.expectedTables[0],
    obs=>obs.expectedTables[24]='other_schema',
    obs=>obs.observedTables[24]={...obs.observedTables[0]},
    obs=>obs.observedTables[24]=null
  ]){
    const obs=validObservation();change(obs);
    const result=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,now:NOW});
    assert.equal(result.status,'FAIL');
  }
});

test('v24 forbids any extra role membership even when NOINHERIT is configured',()=>{
  for(const roles of [['pg_read_all_data'],['privileged_team'],['read_team','backup_team']]){
    const obs=validObservation();obs.role.roleMemberships=roles;
    const report=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,now:NOW});
    assert.equal(report.status,'FAIL');
    assert.ok(report.findings.includes('ROLE_MEMBERSHIP_FORBIDDEN:'+roles[0]));
  }
});
test('v24 missing membership observation cannot prove the backup role is isolated',()=>{
  for(const memberships of [undefined,null,'none']){
    const obs=validObservation();obs.role.roleMemberships=memberships;
    const report=classifyBackupRoleVerification({candidateSha:SHA,observation:obs,now:NOW});
    assert.equal(report.status,'FAIL');
    assert.ok(report.findings.includes('ROLE_MEMBERSHIPS_NOT_VERIFIED'));
  }
});
test('v24 catalogue queries inspect PUBLIC/column effective grants and all direct memberships',async()=>{
  const source=await read('scripts/hipico-backup-role-verify-v24.mjs');
  assert.match(source,/has_table_privilege\('hipico_backup',c\.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'\)/);
  assert.match(source,/has_any_column_privilege\('hipico_backup',c\.oid,'SELECT,INSERT,UPDATE,REFERENCES'\)/);
  assert.match(source,/has_any_column_privilege\('hipico_backup',c\.oid,candidate\.privilege\)/);
  assert.match(source,/array_agg\(granted\.rolname::text order by granted\.rolname\)/);
  assert.doesNotMatch(source,/from information_schema\.role_table_grants g/);
});

test('v24 manual SQL preflight and Node both reject non-service memberships and effective write privileges',async()=>{
  const sql=await read('ops/database/verify-hipico-backup-role.sql');
  const node=await read('scripts/hipico-backup-role-verify-v24.mjs');
  // SQL remains a manual preflight, not permission for GitHub Actions to
  // provision a role or mutate production data.
  assert.match(sql,/ROLE_MEMBERSHIP_FORBIDDEN:/);
  assert.match(sql,/FROM pg_auth_members m/);
  assert.match(sql,/member\.rolname='hipico_backup'/);
  assert.match(sql,/has_table_privilege\('hipico_backup',c\.oid,candidate\.privilege\)/);
  assert.match(sql,/has_any_column_privilege\('hipico_backup',c\.oid,candidate\.privilege\)/);
  assert.match(sql,/has_table_privilege\('hipico_backup',c\.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'\)/);
  assert.match(sql,/has_any_column_privilege\('hipico_backup',c\.oid,'SELECT,INSERT,UPDATE,REFERENCES'\)/);
  assert.doesNotMatch(sql,/FROM information_schema\.role_table_grants g/i);
  assert.match(node,/has_any_column_privilege\('hipico_backup',c\.oid,candidate\.privilege\)/);
  assert.match(node,/roleMemberships/);
  assert.doesNotMatch(sql,/\b(?:ALTER ROLE|CREATE ROLE|GRANT CONNECT|REVOKE ALL PRIVILEGES)\b/i);
});
