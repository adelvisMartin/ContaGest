import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const { Client }=pg;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const inventoryPath=path.join(root,'ops/backup/hipico-public-tables.txt');
const SHA40=/^[a-f0-9]{40}$/i;
const MODES=new Set(['PRE_ROLLOUT','STEADY_STATE']);

function normalizeSha(value){
  const sha=String(value||'').trim().toLowerCase();
  return SHA40.test(sha)?sha:null;
}

export function classifyBackupRoleVerification({
  candidateSha,
  observation,
  mode='STEADY_STATE',
  now=new Date()
}={}){
  const sha=normalizeSha(candidateSha);
  const normalizedMode=String(mode||'').trim().toUpperCase();
  const report={
    schema:'hipico-backup-role-verification.v24',
    candidateSha:sha,
    mode:normalizedMode,
    checkedAt:now.toISOString(),
    status:'NOT_EXECUTED',
    reason:null,
    findings:[],
    deferredTables:[],
    expectedTableCount:Array.isArray(observation?.expectedTables)?observation.expectedTables.length:0,
    observedTableCount:Array.isArray(observation?.observedTables)?observation.observedTables.length:0,
    role:observation?.role??null
  };

  if(!sha){
    report.reason='CANDIDATE_SHA_REQUIRED';
    return report;
  }
  if(!MODES.has(normalizedMode)){
    report.reason='BACKUP_ROLE_MODE_INVALID';
    return report;
  }
  if(!observation||typeof observation!=='object'){
    report.reason='OBSERVATION_REQUIRED';
    return report;
  }

  const findings=[];
  const deferredTables=[];
  const role=observation.role||{};
  if(role.exists!==true)findings.push('ROLE_MISSING');
  if(role.exists===true){
    if(role.login!==true)findings.push('ROLE_LOGIN_REQUIRED');
    if(role.superuser===true)findings.push('ROLE_SUPERUSER_FORBIDDEN');
    if(role.createdb===true)findings.push('ROLE_CREATEDB_FORBIDDEN');
    if(role.createrole===true)findings.push('ROLE_CREATEROLE_FORBIDDEN');
    if(role.inherit!==false)findings.push('ROLE_INHERIT_FORBIDDEN');
    if(role.replication===true)findings.push('ROLE_REPLICATION_FORBIDDEN');
    if(role.bypassrls===true)findings.push('ROLE_BYPASSRLS_FORBIDDEN');
    if(role.serviceRoleMember===true)findings.push('SERVICE_ROLE_MEMBERSHIP_FORBIDDEN');
    if(role.schemaUsage!==true)findings.push('PUBLIC_SCHEMA_USAGE_REQUIRED');
    if(role.schemaCreate===true)findings.push('PUBLIC_SCHEMA_CREATE_FORBIDDEN');
    if(role.databaseConnect!==true)findings.push('DATABASE_CONNECT_REQUIRED');
  }

  const expected=Array.isArray(observation.expectedTables)?observation.expectedTables:[];
  const observed=Array.isArray(observation.observedTables)?observation.observedTables:[];
  if(expected.length!==25)findings.push(`INVENTORY_COUNT_INVALID:${expected.length}`);
  if(observed.length!==expected.length)findings.push(`OBSERVED_TABLE_COUNT_MISMATCH:${observed.length}:${expected.length}`);

  const observedByTable=new Map(observed.map((item)=>[item.table,item]));
  for(const table of expected){
    const item=observedByTable.get(table);
    if(!item){
      findings.push(`TABLE_OBSERVATION_MISSING:${table}`);
      continue;
    }
    if(item.exists!==true){
      deferredTables.push(table);
      if(normalizedMode==='STEADY_STATE')findings.push(`TABLE_MISSING:${table}`);
      continue;
    }
    if(item.select!==true)findings.push(`SELECT_REQUIRED:${table}`);
    for(const privilege of Array.isArray(item.mutablePrivileges)?item.mutablePrivileges:[]){
      findings.push(`MUTABLE_PRIVILEGE:${table}:${privilege}`);
    }
    if(item.rls===true&&item.backupPolicy!==true)findings.push(`RLS_POLICY_MISSING:${table}`);
  }

  for(const crossScopeGrant of Array.isArray(observation.crossScopeGrants)?observation.crossScopeGrants:[]){
    findings.push(`CROSS_SCOPE_GRANT:${crossScopeGrant}`);
  }
  for(const authAccess of Array.isArray(observation.authScopeAccess)?observation.authScopeAccess:[]){
    findings.push(`AUTH_SCHEMA_ACCESS:${authAccess}`);
  }
  for(const defaultPrivilege of Array.isArray(observation.defaultPrivileges)?observation.defaultPrivileges:[]){
    findings.push(`DEFAULT_PRIVILEGE_FORBIDDEN:${defaultPrivilege}`);
  }

  report.findings=findings;
  report.deferredTables=deferredTables;
  if(findings.length){
    report.status='FAIL';
    report.reason=findings[0];
    return report;
  }

  report.status='PASS';
  report.reason=null;
  return report;
}

async function loadInventory(){
  const text=await fs.readFile(inventoryPath,'utf8');
  const tables=text.split(/\r?\n/)
    .map((line)=>line.trim())
    .filter((line)=>line&&!line.startsWith('#'));
  if(tables.length!==25)throw new Error(`HIPICO_BACKUP_INVENTORY_COUNT_INVALID:${tables.length}`);
  for(const table of tables){
    if(!/^hipico_[a-z0-9_]+$/.test(table))throw new Error(`HIPICO_BACKUP_INVENTORY_NAME_INVALID:${table}`);
  }
  if(new Set(tables).size!==tables.length)throw new Error('HIPICO_BACKUP_INVENTORY_DUPLICATE');
  return tables;
}

export async function observeBackupRole({
  env=process.env,
  connect=(config)=>new Client(config)
}={}){
  const databaseUrl=String(env.HIPICO_BACKUP_DATABASE_URL||'').trim();
  const expectedTables=await loadInventory();
  if(!databaseUrl){
    return {executed:false,reason:'DATABASE_URL_REQUIRED',expectedTables,observedTables:[],crossScopeGrants:[],role:null};
  }

  const client=connect({connectionString:databaseUrl,application_name:'hipico-backup-role-verify-v24'});
  await client.connect();
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const roleResult=await client.query(`
      select
        rolcanlogin as login,
        rolsuper as superuser,
        rolcreatedb as createdb,
        rolcreaterole as createrole,
        rolinherit as inherit,
        rolreplication as replication,
        rolbypassrls as bypassrls
      from pg_roles
      where rolname='hipico_backup'
    `);

    if(roleResult.rows.length===0){
      return {
        executed:true,
        reason:null,
        expectedTables,
        observedTables:[],
        crossScopeGrants:[],
        role:{
          exists:false,
          login:false,
          superuser:false,
          createdb:false,
          createrole:false,
          inherit:false,
          replication:false,
          bypassrls:false,
          serviceRoleMember:false,
          schemaUsage:false,
          schemaCreate:false,
          databaseConnect:false
        }
      };
    }

    const rolePrivileges=await client.query(`
      select
        exists(
          select 1
          from pg_auth_members m
          join pg_roles member on member.oid=m.member
          join pg_roles granted on granted.oid=m.roleid
          where member.rolname='hipico_backup' and granted.rolname='service_role'
        ) as service_role_member,
        has_database_privilege('hipico_backup',current_database(),'CONNECT') as database_connect,
        has_schema_privilege('hipico_backup','public','USAGE') as schema_usage,
        has_schema_privilege('hipico_backup','public','CREATE') as schema_create
    `);

    const tableResult=await client.query(`
      with expected(table_name) as (
        select unnest($1::text[])
      )
      select
        e.table_name,
        (to_regclass(format('public.%I',e.table_name)) is not null) as exists,
        case
          when to_regclass(format('public.%I',e.table_name)) is null then false
          else has_table_privilege('hipico_backup',format('public.%I',e.table_name),'SELECT')
        end as can_select,
        coalesce(c.relrowsecurity,false) as rls,
        exists(
          select 1
          from pg_policies p
          where p.schemaname='public'
            and p.tablename=e.table_name
            and p.policyname='hipico_backup_read_all'
            and 'hipico_backup'=any(p.roles)
            and lower(p.cmd)='select'
        ) as backup_policy,
        coalesce((
          select array_agg(g.privilege_type order by g.privilege_type)
          from information_schema.role_table_grants g
          where g.grantee='hipico_backup'
            and g.table_schema='public'
            and g.table_name=e.table_name
            and g.privilege_type<>'SELECT'
        ),array[]::text[]) as mutable_privileges
      from expected e
      left join pg_class c
        on c.oid=to_regclass(format('public.%I',e.table_name))
      order by e.table_name
    `,[expectedTables]);

    const crossScopeResult=await client.query(`
      select distinct format('%I.%I',g.table_schema,g.table_name) as qualified_name
      from information_schema.role_table_grants g
      where g.grantee='hipico_backup'
        and g.table_schema='public'
        and not (g.table_name=any($1::text[]))
      order by qualified_name
    `,[expectedTables]);

    const authScopeResult=await client.query(`
      select access_path
      from (
        select 'SCHEMA:auth'::text as access_path
        where case
          when exists(select 1 from pg_namespace where nspname='auth')
            then has_schema_privilege('hipico_backup','auth','USAGE')
          else false
        end
        union all
        select 'TABLE:'||c.relname
        from pg_class c
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='auth'
          and c.relkind in ('r','p','v','m')
          and (
            has_table_privilege('hipico_backup',c.oid,'SELECT')
            or has_table_privilege('hipico_backup',c.oid,'INSERT')
            or has_table_privilege('hipico_backup',c.oid,'UPDATE')
            or has_table_privilege('hipico_backup',c.oid,'DELETE')
            or has_table_privilege('hipico_backup',c.oid,'TRUNCATE')
            or has_table_privilege('hipico_backup',c.oid,'REFERENCES')
            or has_table_privilege('hipico_backup',c.oid,'TRIGGER')
          )
        union all
        select 'FUNCTION:'||p.proname
        from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='auth'
          and has_function_privilege('hipico_backup',p.oid,'EXECUTE')
      ) access
      order by access_path
    `);

    const defaultPrivilegeResult=await client.query(`
      select distinct d.defaclobjtype::text as object_type
      from pg_default_acl d
      where exists (
        select 1
        from unnest(coalesce(d.defaclacl,'{}'::aclitem[])) item
        where item::text like 'hipico_backup=%'
      )
      order by object_type
    `);

    const roleRow=roleResult.rows[0];
    const privilegeRow=rolePrivileges.rows[0]||{};
    return {
      executed:true,
      reason:null,
      expectedTables,
      observedTables:tableResult.rows.map((row)=>({
        table:row.table_name,
        exists:row.exists===true,
        select:row.can_select===true,
        mutablePrivileges:Array.isArray(row.mutable_privileges)?row.mutable_privileges:[],
        rls:row.rls===true,
        backupPolicy:row.backup_policy===true
      })),
      crossScopeGrants:crossScopeResult.rows.map((row)=>row.qualified_name),
      authScopeAccess:authScopeResult.rows.map((row)=>row.access_path),
      defaultPrivileges:defaultPrivilegeResult.rows.map((row)=>row.object_type),
      role:{
        exists:true,
        login:roleRow.login===true,
        superuser:roleRow.superuser===true,
        createdb:roleRow.createdb===true,
        createrole:roleRow.createrole===true,
        inherit:roleRow.inherit===true,
        replication:roleRow.replication===true,
        bypassrls:roleRow.bypassrls===true,
        serviceRoleMember:privilegeRow.service_role_member===true,
        schemaUsage:privilegeRow.schema_usage===true,
        schemaCreate:privilegeRow.schema_create===true,
        databaseConnect:privilegeRow.database_connect===true
      }
    };
  }finally{
    try{await client.query('ROLLBACK');}catch{}
    await client.end();
  }
}

export async function runBackupRoleVerification({env=process.env,now=new Date()}={}){
  const candidateSha=String(env.HIPICO_CANDIDATE_SHA||env.GITHUB_SHA||'').trim();
  const mode=String(env.HIPICO_BACKUP_ROLE_MODE||'STEADY_STATE').trim().toUpperCase();
  if(!normalizeSha(candidateSha)){
    return classifyBackupRoleVerification({candidateSha,observation:null,mode,now});
  }

  let observation;
  try{
    observation=await observeBackupRole({env});
  }catch(error){
    return {
      schema:'hipico-backup-role-verification.v24',
      candidateSha:normalizeSha(candidateSha),
      checkedAt:now.toISOString(),
      status:'NOT_EXECUTED',
      reason:String(error?.code||'BACKUP_ROLE_VERIFY_FAILED').slice(0,120),
      findings:[],
      expectedTableCount:0,
      observedTableCount:0,
      role:null
    };
  }

  if(observation.executed!==true){
    return {
      schema:'hipico-backup-role-verification.v24',
      candidateSha:normalizeSha(candidateSha),
      checkedAt:now.toISOString(),
      status:'NOT_EXECUTED',
      reason:String(observation.reason||'BACKUP_ROLE_VERIFY_NOT_EXECUTED'),
      findings:[],
      expectedTableCount:observation.expectedTables?.length||0,
      observedTableCount:0,
      role:observation.role||null
    };
  }

  return classifyBackupRoleVerification({candidateSha,observation,mode,now});
}

async function main(){
  const report=await runBackupRoleVerification();
  const output=String(process.env.HIPICO_BACKUP_ROLE_REPORT||'').trim()
    ||path.join(root,'artifacts','qa','hipico-backup-role',`${report.candidateSha||'unknown'}.json`);
  await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});
  await fs.writeFile(path.resolve(output),`${JSON.stringify(report,null,2)}\n`,'utf8');
  console.log(JSON.stringify(report));
  if(report.status==='FAIL')process.exitCode=2;
  else if(report.status==='NOT_EXECUTED')process.exitCode=3;
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(isMain)await main();

export const __test__={normalizeSha,loadInventory,MODES};
