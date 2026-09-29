#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT=fileURLToPath(import.meta.url);
const BACKEND_ROOT=path.resolve(path.dirname(SCRIPT),'..');
const REPO_ROOT=path.resolve(BACKEND_ROOT,'..');
const RUNTIME_ROLE='contagest_runtime';
const TENANT_PRINCIPAL_ROLES=new Set(['authenticated','anon']);
const PRIVILEGED_ROLES=new Set(['service_role','postgres','supabase_admin','pg_database_owner','pg_write_all_data']);
const SAFE_DEFINER_SCHEMAS=new Set(['pg_catalog','private','public','auth']);

function normalizeBoolean(value){return value===true||value==='t'||value==='true'||value===1;}
function normalizeExpression(value){return String(value??'').trim().replace(/^\(+|\)+$/g,'').trim().toLowerCase();}
function isTrueExpression(value){return normalizeExpression(value)==='true';}
function normalizedRoles(value){return Array.isArray(value)?value.map(String):[];}
function finding(code,severity,object,detail){return {code,severity,object,detail};}
function searchPathIsSafe(value){
  const parts=String(value??'').split(',').map((item)=>item.trim().replace(/^"|"$/g,'')).filter(Boolean);
  return parts.length>0&&parts[0]==='pg_catalog'&&parts.every((item)=>SAFE_DEFINER_SCHEMAS.has(item));
}

export function classifySecurityManifest(input){
  const roles=[...(input.roles||[])];
  const tables=[...(input.tables||[])];
  const policies=[...(input.policies||[])];
  const functions=[...(input.functions||[])];
  const views=[...(input.views||[])];
  const roleMemberships=[...(input.roleMemberships||[])];
  const findings=[];
  const tableByKey=new Map(tables.map((table)=>[`${table.schema}.${table.name}`,table]));

  for(const table of tables){
    if(table.classification==='PRISMA_APPLICATION'&&normalizeBoolean(table.hasTenantId)&&!normalizeBoolean(table.rlsEnabled)){
      findings.push(finding('TENANT_RLS_DISABLED','P1',`${table.schema}.${table.name}`,'tenantId table has RLS disabled'));
    }
    if(table.owner===RUNTIME_ROLE){
      findings.push(finding('RUNTIME_OBJECT_OWNERSHIP','P0',`${table.schema}.${table.name}`,'runtime role owns an application table'));
    }
  }

  for(const policy of policies){
    const table=tableByKey.get(`${policy.schema}.${policy.table}`);
    if(!table||!normalizeBoolean(table.hasTenantId))continue;
    const tenantPrincipal=normalizedRoles(policy.roles).some((role)=>TENANT_PRINCIPAL_ROLES.has(role));
    if(tenantPrincipal&&(isTrueExpression(policy.qual)||isTrueExpression(policy.withCheck))){
      findings.push(finding('PERMISSIVE_TENANT_POLICY','P0',`${policy.schema}.${policy.table}.${policy.name}`,'tenant-principal policy contains unconditional true tenant access'));
    }
  }

  for(const fn of functions){
    if(fn.owner===RUNTIME_ROLE){
      findings.push(finding('RUNTIME_OBJECT_OWNERSHIP','P0',`${fn.schema}.${fn.name}(${fn.identityArguments||''})`,'runtime role owns an application function'));
    }
    if(!normalizeBoolean(fn.securityDefiner)||normalizeBoolean(fn.extensionOwned))continue;
    const object=`${fn.schema}.${fn.name}(${fn.identityArguments||''})`;
    if(!searchPathIsSafe(fn.searchPath)){
      findings.push(finding('UNSAFE_DEFINER_SEARCH_PATH','P0',object,`unsafe search_path: ${fn.searchPath||'(unset)'}`));
    }
    if(normalizeBoolean(fn.publicExecute)){
      findings.push(finding('PUBLIC_DEFINER_EXECUTE','P0',object,'PUBLIC can execute SECURITY DEFINER'));
    }
    if(normalizeBoolean(fn.anonExecute)){
      findings.push(finding('ANON_DEFINER_EXECUTE','P0',object,'anon can execute SECURITY DEFINER'));
    }
  }

  for(const view of views){
    if(view.owner===RUNTIME_ROLE){
      findings.push(finding('RUNTIME_OBJECT_OWNERSHIP','P0',`${view.schema}.${view.name}`,'runtime role owns an application view'));
    }
  }

  const runtime=roles.find((role)=>role.role===RUNTIME_ROLE);
  if(runtime&&(normalizeBoolean(runtime.superuser)||normalizeBoolean(runtime.createDb)||normalizeBoolean(runtime.createRole)||normalizeBoolean(runtime.bypassRls))){
    findings.push(finding('RUNTIME_ROLE_ESCALATION','P0',RUNTIME_ROLE,'runtime has superuser/create-db/create-role/bypass-rls capability'));
  }
  if(normalizeBoolean(input.runtimeSchemaCreate)){
    findings.push(finding('RUNTIME_DDL_PRIVILEGE','P0',RUNTIME_ROLE,'runtime can CREATE in public schema'));
  }
  for(const membership of roleMemberships){
    if(membership.member===RUNTIME_ROLE&&PRIVILEGED_ROLES.has(membership.role)){
      findings.push(finding('RUNTIME_PRIVILEGED_MEMBERSHIP','P0',`${membership.member}->${membership.role}`,'runtime inherits a privileged PostgreSQL/Supabase role'));
    }
  }

  findings.sort((a,b)=>`${a.code}:${a.object}`.localeCompare(`${b.code}:${b.object}`));
  return {verdict:findings.length?'FAIL':'PASS',findings};
}

function prismaModelNames(){
  const schema=fs.readFileSync(path.join(BACKEND_ROOT,'prisma/schema.prisma'),'utf8');
  return new Set([...schema.matchAll(/^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm)].map((match)=>match[1]));
}

function candidateSha(){
  if(process.env.CG_CANDIDATE_SHA)return String(process.env.CG_CANDIDATE_SHA).trim();
  try{return execFileSync('git',['rev-parse','HEAD'],{cwd:REPO_ROOT,encoding:'utf8'}).trim();}
  catch{return 'UNKNOWN';}
}

async function readCatalog(client){
  const models=prismaModelNames();
  const {rows:roles}=await client.query(`
    SELECT rolname AS "role", rolsuper AS superuser, rolcreatedb AS "createDb",
           rolcreaterole AS "createRole", rolbypassrls AS "bypassRls", rolcanlogin AS "canLogin"
    FROM pg_roles
    WHERE rolname = ANY($1::text[])
    ORDER BY rolname
  `,[[RUNTIME_ROLE,'contagest_backup','contagest_monitor','anon','authenticated','service_role']]);

  const {rows:tables}=await client.query(`
    SELECT n.nspname AS schema, c.relname AS name, pg_get_userbyid(c.relowner) AS owner,
           c.relrowsecurity AS "rlsEnabled", c.relforcerowsecurity AS "rlsForced",
           EXISTS (
             SELECT 1 FROM pg_attribute a
             WHERE a.attrelid=c.oid AND a.attname='tenantId' AND a.attnum>0 AND NOT a.attisdropped
           ) AS "hasTenantId"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
    ORDER BY c.relname
  `);
  for(const table of tables){
    table.classification=models.has(table.name)?'PRISMA_APPLICATION':'PUBLIC_AUXILIARY_OR_MANAGED';
  }

  const {rows:policies}=await client.query(`
    SELECT schemaname AS schema, tablename AS table, policyname AS name,
           cmd AS command, roles, qual, with_check AS "withCheck"
    FROM pg_policies
    WHERE schemaname='public'
    ORDER BY tablename, policyname
  `);

  const {rows:functions}=await client.query(`
    SELECT n.nspname AS schema, p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS "identityArguments",
           pg_get_userbyid(p.proowner) AS owner,
           p.prosecdef AS "securityDefiner",
           (
             SELECT replace(setting,'search_path=','')
             FROM unnest(COALESCE(p.proconfig,ARRAY[]::text[])) AS setting
             WHERE setting LIKE 'search_path=%'
             LIMIT 1
           ) AS "searchPath",
           EXISTS (
             SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
             WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
           ) AS "publicExecute",
           EXISTS (
             SELECT 1
             FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
             JOIN pg_roles r ON r.oid=acl.grantee
             WHERE r.rolname='anon' AND acl.privilege_type='EXECUTE'
           ) AS "anonExecute",
           EXISTS (
             SELECT 1 FROM pg_depend d
             WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e'
           ) AS "extensionOwned"
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','private')
    ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  `);

  const {rows:views}=await client.query(`
    SELECT n.nspname AS schema, c.relname AS name, pg_get_userbyid(c.relowner) AS owner,
           CASE c.relkind WHEN 'm' THEN 'materialized' ELSE 'view' END AS kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('v','m')
    ORDER BY c.relname
  `);

  const {rows:roleMemberships}=await client.query(`
    SELECT member.rolname AS member, parent.rolname AS role
    FROM pg_auth_members m
    JOIN pg_roles member ON member.oid=m.member
    JOIN pg_roles parent ON parent.oid=m.roleid
    WHERE member.rolname = $1
    ORDER BY parent.rolname
  `,[RUNTIME_ROLE]);

  const {rows:[schemaPrivilege]}=await client.query(`
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname=$1)
      THEN has_schema_privilege($1,'public','CREATE')
      ELSE false
    END AS allowed
  `,[RUNTIME_ROLE]);

  return {roles,tables,policies,functions,views,roleMemberships,runtimeSchemaCreate:Boolean(schemaPrivilege?.allowed)};
}

function parseArgs(argv){
  const strict=argv.includes('--strict');
  const outputArg=argv.find((arg)=>arg.startsWith('--output='));
  return {strict,output:outputArg?outputArg.slice('--output='.length):null};
}

export async function runSecurityAudit({connectionString,strict=false,output=null}={}){
  if(!connectionString)throw new Error('DATABASE_URL_OR_DIRECT_DATABASE_URL_REQUIRED');
  const pg=await import('pg');
  const Client=pg.default?.Client||pg.Client;
  const client=new Client({connectionString,ssl:connectionString.includes('supabase.co')?{rejectUnauthorized:false}:undefined});
  await client.connect();
  let catalog;
  let serverVersion='UNKNOWN';
  try{
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    const {rows:[version]}=await client.query('SHOW server_version_num');
    serverVersion=String(version?.server_version_num||'UNKNOWN');
    catalog=await readCatalog(client);
    await client.query('COMMIT');
  }catch(error){
    try{await client.query('ROLLBACK');}catch{}
    throw error;
  }finally{
    await client.end();
  }

  const classified=classifySecurityManifest(catalog);
  const manifest={
    schemaVersion:635,
    candidateSha:candidateSha(),
    source:'postgresql-catalog-read-only',
    serverVersion,
    roles:catalog.roles,
    tables:catalog.tables,
    policies:catalog.policies,
    functions:catalog.functions,
    views:catalog.views,
    roleMemberships:catalog.roleMemberships,
    runtimeSchemaCreate:catalog.runtimeSchemaCreate,
    findings:classified.findings,
    verdict:classified.verdict,
  };
  const serialized=`${JSON.stringify(manifest,null,2)}\n`;
  if(output){
    const target=path.resolve(REPO_ROOT,output);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,serialized,'utf8');
  }
  process.stdout.write(serialized);
  if(strict&&classified.verdict!=='PASS')process.exitCode=1;
  return manifest;
}

if(process.argv[1]&&path.resolve(process.argv[1])===SCRIPT){
  const args=parseArgs(process.argv.slice(2));
  const connectionString=process.env.DIRECT_DATABASE_URL||process.env.DATABASE_URL;
  runSecurityAudit({connectionString,strict:args.strict,output:args.output}).catch((error)=>{
    console.error(`[db-security-v635][FAIL] ${error instanceof Error?error.message:String(error)}`);
    process.exitCode=2;
  });
}
