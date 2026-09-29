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
const CONTAGEST_DEFINERS=new Set([
  'current_tenant_id',
  'current_profile_id',
  'enforce_subscription_tenant_limit',
  'enforce_license_subscription_tenant',
  'enforce_subscription_user_limit',
  'sync_license_permissions',
]);

function normalizeBoolean(value){return value===true||value==='t'||value==='true'||value===1;}
function normalizeExpression(value){return String(value??'').trim().replace(/^\(+|\)+$/g,'').trim().toLowerCase();}
function isTrueExpression(value){return normalizeExpression(value)==='true';}
function normalizedRoles(value){return Array.isArray(value)?value.map(String):[];}
function finding(code,severity,object,detail,classification='CONTAGEST_APPLICATION'){return {code,severity,object,detail,classification};}
function searchPathIsSafe(value){
  const parts=String(value??'').split(',').map((item)=>item.trim().replace(/^"|"$/g,'')).filter(Boolean);
  return parts.length>0&&parts[0]==='pg_catalog'&&parts.every((item)=>SAFE_DEFINER_SCHEMAS.has(item));
}
function isSharedProductName(name){return /^(?:budgetwallet_|hipico_)/i.test(String(name||''));}
function classifyFunction(fn){
  if(normalizeBoolean(fn.extensionOwned))return 'EXTENSION_OWNED';
  if(isSharedProductName(fn.name))return 'SHARED_PRODUCT_OUT_OF_SCOPE';
  if(fn.name==='rls_auto_enable')return 'PLATFORM_MANAGED_REVIEW';
  if(CONTAGEST_DEFINERS.has(fn.name)||String(fn.name||'').startsWith('contagest_'))return 'CONTAGEST_APPLICATION';
  return 'UNCLASSIFIED_REVIEW';
}
function classifyView(view){
  if(isSharedProductName(view.name))return 'SHARED_PRODUCT_OUT_OF_SCOPE';
  if(String(view.name||'').startsWith('contagest_'))return 'CONTAGEST_APPLICATION';
  return 'UNCLASSIFIED_REVIEW';
}
function securityObject(fn){return `${fn.schema}.${fn.name}(${fn.identityArguments||''})`;}

export function classifySecurityManifest(input){
  const roles=[...(input.roles||[])];
  const tables=[...(input.tables||[])];
  const policies=[...(input.policies||[])];
  const functions=[...(input.functions||[])];
  const views=[...(input.views||[])];
  const roleMemberships=[...(input.roleMemberships||[])];
  const findings=[];
  const outOfScope=[];
  const tableByKey=new Map(tables.map((table)=>[`${table.schema}.${table.name}`,table]));

  for(const table of tables){
    if(table.classification==='PRISMA_APPLICATION'&&normalizeBoolean(table.hasTenantId)&&!normalizeBoolean(table.rlsEnabled)){
      findings.push(finding('TENANT_RLS_DISABLED','P1',`${table.schema}.${table.name}`,'tenantId table has RLS disabled'));
    }
    if(table.classification==='PRISMA_APPLICATION'&&normalizeBoolean(table.hasTenantId)
      &&(normalizeBoolean(table.anonAnyDml)||normalizeBoolean(table.authenticatedAnyDml))){
      findings.push(finding(
        'DIRECT_BROWSER_DML_GRANT','P1',`${table.schema}.${table.name}`,
        `backend-only tenant table exposes browser DML: anon=${normalizeBoolean(table.anonAnyDml)} authenticated=${normalizeBoolean(table.authenticatedAnyDml)}`
      ));
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
    const classification=classifyFunction(fn);
    fn.classification=classification;
    const object=securityObject(fn);
    if(fn.owner===RUNTIME_ROLE&&classification==='CONTAGEST_APPLICATION'){
      findings.push(finding('RUNTIME_OBJECT_OWNERSHIP','P0',object,'runtime role owns an application function',classification));
    }
    if(!normalizeBoolean(fn.securityDefiner)||classification==='EXTENSION_OWNED')continue;

    const unsafePath=!searchPathIsSafe(fn.searchPath);
    const publicExecute=normalizeBoolean(fn.publicExecute);
    const anonExecute=normalizeBoolean(fn.anonExecute);
    if(classification==='SHARED_PRODUCT_OUT_OF_SCOPE'||classification==='PLATFORM_MANAGED_REVIEW'){
      if(unsafePath||publicExecute||anonExecute){
        outOfScope.push(finding(
          'OUT_OF_SCOPE_SECURITY_DEFINER_REVIEW','OUT_OF_SCOPE',object,
          `shared/platform authority: search_path=${fn.searchPath||'(unset)'} publicExecute=${publicExecute} anonExecute=${anonExecute}`,
          classification
        ));
      }
      continue;
    }
    if(classification==='UNCLASSIFIED_REVIEW'){
      findings.push(finding('UNCLASSIFIED_SECURITY_DEFINER','P1',object,'SECURITY DEFINER must be assigned to a known application/platform authority',classification));
      continue;
    }
    if(unsafePath){
      findings.push(finding('UNSAFE_DEFINER_SEARCH_PATH','P0',object,`unsafe search_path: ${fn.searchPath||'(unset)'}`,classification));
    }
    if(publicExecute){
      findings.push(finding('PUBLIC_DEFINER_EXECUTE','P0',object,'PUBLIC can execute SECURITY DEFINER',classification));
    }
    if(anonExecute){
      findings.push(finding('ANON_DEFINER_EXECUTE','P0',object,'anon can execute SECURITY DEFINER',classification));
    }
  }

  for(const view of views){
    const classification=classifyView(view);
    view.classification=classification;
    const object=`${view.schema}.${view.name}`;
    if(view.owner===RUNTIME_ROLE&&classification!=='SHARED_PRODUCT_OUT_OF_SCOPE'){
      findings.push(finding('RUNTIME_OBJECT_OWNERSHIP','P0',object,'runtime role owns an application view',classification));
    }
    const exposed=normalizeBoolean(view.anonSelect)||normalizeBoolean(view.authenticatedSelect);
    if(!exposed||normalizeBoolean(view.securityInvoker))continue;
    if(classification==='SHARED_PRODUCT_OUT_OF_SCOPE'){
      outOfScope.push(finding('OUT_OF_SCOPE_EXPOSED_VIEW','OUT_OF_SCOPE',object,'shared product view is exposed without security_invoker',classification));
      continue;
    }
    findings.push(finding('EXPOSED_DEFINER_VIEW','P0',object,'request-facing SELECT on view/materialized view without security_invoker',classification));
  }

  const runtime=roles.find((role)=>role.role===RUNTIME_ROLE);
  if(!runtime){
    findings.push(finding('RUNTIME_ROLE_MISSING','P1',RUNTIME_ROLE,'dedicated backend runtime role is not provisioned'));
  }else if(normalizeBoolean(runtime.superuser)||normalizeBoolean(runtime.createDb)||normalizeBoolean(runtime.createRole)||normalizeBoolean(runtime.bypassRls)){
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
  outOfScope.sort((a,b)=>`${a.code}:${a.object}`.localeCompare(`${b.code}:${b.object}`));
  return {verdict:findings.length?'FAIL':'PASS',findings,outOfScope};
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

function anyDmlExpression(role){
  return ['SELECT','INSERT','UPDATE','DELETE']
    .map((privilege)=>`has_table_privilege('${role}',format('%I.%I',n.nspname,c.relname),'${privilege}')`)
    .join(' OR ');
}

async function readCatalog(client){
  const models=prismaModelNames();
  const anonAnyDml=anyDmlExpression('anon');
  const authenticatedAnyDml=anyDmlExpression('authenticated');
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
           ) AS "hasTenantId",
           (${anonAnyDml}) AS "anonAnyDml",
           (${authenticatedAnyDml}) AS "authenticatedAnyDml"
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
           CASE c.relkind WHEN 'm' THEN 'materialized' ELSE 'view' END AS kind,
           COALESCE(c.reloptions,ARRAY[]::text[]) @> ARRAY['security_invoker=true'] AS "securityInvoker",
           has_table_privilege('anon',format('%I.%I',n.nspname,c.relname),'SELECT') AS "anonSelect",
           has_table_privilege('authenticated',format('%I.%I',n.nspname,c.relname),'SELECT') AS "authenticatedSelect"
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
    outOfScope:classified.outOfScope,
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
