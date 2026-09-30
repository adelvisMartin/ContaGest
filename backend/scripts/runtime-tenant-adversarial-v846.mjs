#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client, Pool } = pg;
const SCRIPT_DIR=path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT=path.resolve(SCRIPT_DIR,'..');
const REPO_ROOT=path.resolve(BACKEND_ROOT,'..');
const SIDECAR=path.join(REPO_ROOT,'ops/database/runtime-rls-policy-v845.sql');
const ADMIN_URL=String(process.env.DIRECT_DATABASE_URL||process.env.DATABASE_URL||'').trim();
const CANDIDATE_SHA=String(process.env.CG_CANDIDATE_SHA||'').trim().toLowerCase();
const RUNTIME_PASSWORD=`v846_${crypto.randomBytes(24).toString('base64url')}`;
const ARTIFACT_DIR=path.join(REPO_ROOT,'artifacts','qa','db-security-v846');

function fail(message){throw new Error(message);}
function dbName(raw){try{return decodeURIComponent(new URL(raw).pathname.replace(/^\//,''));}catch{return '';}}
function isolatedDatabase(raw){return /(?:v846|ephemeral|test)/i.test(dbName(raw));}
function quoteIdentifier(value){return `"${String(value).replaceAll('"','""')}"`;}
function quoteLiteral(value){return `'${String(value).replaceAll("'","''")}'`;}
function runtimeUrl(adminUrl){const url=new URL(adminUrl);url.username='contagest_runtime';url.password=RUNTIME_PASSWORD;url.searchParams.delete('pgbouncer');return url.toString();}
function delay(ms){return new Promise((resolve)=>setTimeout(resolve,ms));}
async function scalar(client,sql,params=[]){const {rows}=await client.query(sql,params);return rows[0]||null;}
async function expectRejected(operation,marker){try{await operation();}catch{return;}fail(marker);}
async function assertNoContext(client,marker){const row=await scalar(client,'SELECT count(*)::int AS n FROM public."Client"');if(Number(row?.n)!==0)fail(marker);}

if(!ADMIN_URL)fail('DATABASE_URL_OR_DIRECT_DATABASE_URL_REQUIRED');
if(!isolatedDatabase(ADMIN_URL))fail(`V846_ISOLATED_DATABASE_REQUIRED:${dbName(ADMIN_URL)||'unknown'}`);
if(!/^[0-9a-f]{40}$/.test(CANDIDATE_SHA))fail('CG_CANDIDATE_SHA_40_HEX_REQUIRED');

const admin=new Client({connectionString:ADMIN_URL});
const tenantA=crypto.randomUUID();
const tenantB=crypto.randomUUID();
const clientA=crypto.randomUUID();
const clientB=crypto.randomUUID();
const invoiceA=crypto.randomUUID();
const invoiceB=crypto.randomUUID();
const lineA=crypto.randomUUID();
const lineB=crypto.randomUUID();
const report={ticket:846,candidateSha:CANDIDATE_SHA,postgresMajor:17,checks:[],classification:'VERIFIED_LOCAL'};
let expectedBackendPid=null;

async function waitForActiveSleep(pid){
  for(let attempt=0;attempt<40;attempt+=1){
    const row=await scalar(admin,`SELECT state,query FROM pg_catalog.pg_stat_activity WHERE pid=$1`,[pid]);
    if(row?.state==='active'&&String(row?.query||'').includes('pg_sleep'))return;
    await delay(10);
  }
  fail('CANCEL_PROBE_QUERY_NOT_ACTIVE');
}

async function runPrismaProbe(runtimeConnectionString){
  const npm=process.platform==='win32'?'npm.cmd':'npm';
  const args=['exec','--','tsx','scripts/runtime-tenant-prisma-v846.ts'];
  const child=spawn(npm,args,{
    cwd:BACKEND_ROOT,
    stdio:'inherit',
    env:{
      ...process.env,
      NODE_ENV:'test',
      DATABASE_URL:runtimeConnectionString,
      DATABASE_RUNTIME_URL:runtimeConnectionString,
      V846_TENANT_A:tenantA,
      V846_TENANT_B:tenantB,
      V846_CLIENT_A:clientA,
      V846_CLIENT_B:clientB
    }
  });
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(value)=>resolve(value??1));});
  if(code!==0)fail(`PRISMA_ADVERSARIAL_PROBE_FAILED:${code}`);
}

async function withReusedRuntime(pool,operation){
  const client=await pool.connect();
  try{
    const pid=Number((await scalar(client,'SELECT pg_backend_pid() AS pid'))?.pid||0);
    if(!expectedBackendPid)expectedBackendPid=pid;
    else if(pid!==expectedBackendPid)fail(`POOL_CONNECTION_NOT_REUSED:${expectedBackendPid}:${pid}`);
    return await operation(client,pid);
  }finally{client.release();}
}

try{
  await admin.connect();
  const version=await scalar(admin,"SELECT current_setting('server_version_num')::int AS n,current_user AS u");
  if(Math.floor(Number(version?.n||0)/10000)!==17)fail(`POSTGRES_17_REQUIRED:${version?.n||'unknown'}`);
  if(String(version?.u||'')!=='postgres')fail(`POSTGRES_OWNER_CONNECTION_REQUIRED:${version?.u||'unknown'}`);
  report.checks.push('postgres17-owner');

  for(const table of ['Tenant','Client','SalesInvoice','SalesInvoiceLine','UserProfile','UserSession']){
    if(!(await scalar(admin,'SELECT pg_catalog.to_regclass($1) IS NOT NULL AS ok',[`public."${table}"`]))?.ok)fail(`MIGRATED_SCHEMA_REQUIRED:${table}`);
  }

  await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='contagest_runtime') THEN CREATE ROLE contagest_runtime; END IF; END $$;`);
  await admin.query(`ALTER ROLE contagest_runtime WITH LOGIN PASSWORD ${quoteLiteral(RUNTIME_PASSWORD)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT`);
  await admin.query(`GRANT CONNECT ON DATABASE ${quoteIdentifier(dbName(ADMIN_URL))} TO contagest_runtime`);
  await admin.query('GRANT USAGE ON SCHEMA public TO contagest_runtime');
  await admin.query('REVOKE CREATE ON SCHEMA public FROM contagest_runtime');
  await admin.query(await fs.readFile(SIDECAR,'utf8'));
  const rlsTables=await admin.query(`SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname ~ '^[A-Z]' AND c.relrowsecurity`);
  for(const {relname} of rlsTables.rows)await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.${quoteIdentifier(relname)} TO contagest_runtime`);
  report.checks.push('v845-sidecar-provisioned');

  for(const signature of [
    'private.contagest_bootstrap_login_identity(text,text)',
    'private.contagest_bootstrap_supabase_identity(text)',
    'private.contagest_bootstrap_register_tenant(text,text,text,text,text,text,text)',
    'private.contagest_runtime_refresh_session_identity(text)'
  ]){
    const proc=await scalar(admin,'SELECT pg_catalog.to_regprocedure($1) IS NOT NULL AS exists',[signature]);
    if(!proc?.exists)fail(`BOOTSTRAP_AUTHORITY_MISSING:${signature}`);
    const allowed=await scalar(admin,'SELECT pg_catalog.has_function_privilege($1,$2,$3) AS ok',['contagest_runtime',signature,'EXECUTE']);
    if(!allowed?.ok)fail(`BOOTSTRAP_EXECUTE_MISSING:${signature}`);
  }
  report.checks.push('bootstrap-authority');

  await admin.query(`INSERT INTO public."Tenant"("id","rif","name","status") VALUES ($1,$2,$3,'active'),($4,$5,$6,'active')`,[tenantA,`V846-A-${tenantA.slice(0,8)}`,'V846 Tenant A',tenantB,`V846-B-${tenantB.slice(0,8)}`,'V846 Tenant B']);
  await admin.query(`INSERT INTO public."Client"("id","tenantId","rif","name") VALUES ($1,$2,$3,'Client A'),($4,$5,$6,'Client B')`,[clientA,tenantA,`A-${clientA.slice(0,8)}`,clientB,tenantB,`B-${clientB.slice(0,8)}`]);
  await admin.query(`INSERT INTO public."SalesInvoice"("id","tenantId","clientId","number","fiscalPeriod") VALUES ($1,$2,$3,$4,'2026-09'),($5,$6,$7,$8,'2026-09')`,[invoiceA,tenantA,clientA,`A-${invoiceA.slice(0,8)}`,invoiceB,tenantB,clientB,`B-${invoiceB.slice(0,8)}`]);
  await admin.query(`INSERT INTO public."SalesInvoiceLine"("id","invoiceId","description","quantity","unitPrice","total") VALUES ($1,$2,'Line A',1,10,10),($3,$4,'Line B',1,20,20)`,[lineA,invoiceA,lineB,invoiceB]);

  const connectionString=runtimeUrl(ADMIN_URL);
  const pool=new Pool({connectionString,max:1,idleTimeoutMillis:30_000,connectionTimeoutMillis:5_000});
  try{
    await withReusedRuntime(pool,async(client)=>{
      await assertNoContext(client,'NO_CONTEXT_MUST_DENY_SELECT');
      await expectRejected(()=>client.query(`INSERT INTO public."Client"("id","tenantId","rif","name") VALUES ($1,$2,'NOCTX','No context')`,[crypto.randomUUID(),tenantA]),'NO_CONTEXT_INSERT_MUST_REJECT');
    });

    await withReusedRuntime(pool,async(client)=>{
      await client.query('BEGIN');
      await client.query("SELECT set_config('contagest.tenant_id','not-a-uuid',true)");
      await assertNoContext(client,'INVALID_CONTEXT_MUST_DENY');
      await client.query('ROLLBACK');
    });
    await withReusedRuntime(pool,async(client)=>{
      await client.query('BEGIN');
      await client.query("SELECT set_config('contagest.tenant_id',$1,true)",[crypto.randomUUID()]);
      await assertNoContext(client,'STALE_CONTEXT_MUST_DENY');
      await client.query('ROLLBACK');
    });

    await withReusedRuntime(pool,async(client)=>{
      await client.query('BEGIN');
      await client.query("SELECT set_config('contagest.tenant_id',$1,true)",[tenantA]);
      const visible=await client.query('SELECT "id" FROM public."Client" ORDER BY "id"');
      if(visible.rows.length!==1||visible.rows[0].id!==clientA)fail('TENANT_A_SELECT_SCOPE_FAILED');
      const inserted=crypto.randomUUID();
      await client.query(`INSERT INTO public."Client"("id","tenantId","rif","name") VALUES ($1,$2,$3,'A inserted')`,[inserted,tenantA,`A-I-${inserted.slice(0,8)}`]);
      await client.query('SAVEPOINT cross_insert');
      await expectRejected(()=>client.query(`INSERT INTO public."Client"("id","tenantId","rif","name") VALUES ($1,$2,$3,'B forbidden')`,[crypto.randomUUID(),tenantB,`B-X-${crypto.randomBytes(4).toString('hex')}`]),'A_TO_B_INSERT_MUST_REJECT');
      await client.query('ROLLBACK TO SAVEPOINT cross_insert');
      if((await client.query('UPDATE public."Client" SET "name"=$1 WHERE "id"=$2',['blocked',clientB])).rowCount!==0)fail('A_TO_B_UPDATE_MUST_BE_ZERO');
      if((await client.query('DELETE FROM public."Client" WHERE "id"=$1',[clientB])).rowCount!==0)fail('A_TO_B_DELETE_MUST_BE_ZERO');
      await client.query('SAVEPOINT child_cross');
      await expectRejected(()=>client.query(`INSERT INTO public."SalesInvoiceLine"("id","invoiceId","description","quantity","unitPrice","total") VALUES ($1,$2,'cross',1,1,1)`,[crypto.randomUUID(),invoiceB]),'CHILD_CROSS_TENANT_INSERT_MUST_REJECT');
      await client.query('ROLLBACK TO SAVEPOINT child_cross');
      await client.query('COMMIT');
    });
    await withReusedRuntime(pool,(client)=>assertNoContext(client,'TRANSACTION_CONTEXT_LEAK_AFTER_COMMIT'));

    await withReusedRuntime(pool,async(client)=>{
      await client.query('BEGIN');
      await client.query("SELECT set_config('contagest.tenant_id',$1,true)",[tenantB]);
      const visible=await client.query('SELECT "id" FROM public."Client" ORDER BY "id"');
      if(visible.rows.length!==1||visible.rows[0].id!==clientB)fail('TENANT_B_SELECT_SCOPE_FAILED');
      if((await client.query('UPDATE public."Client" SET "name"=$1 WHERE "id"=$2',['blocked',clientA])).rowCount!==0)fail('B_TO_A_UPDATE_MUST_BE_ZERO');
      await client.query('ROLLBACK');
    });
    await withReusedRuntime(pool,(client)=>assertNoContext(client,'TRANSACTION_CONTEXT_LEAK_AFTER_ROLLBACK'));

    await withReusedRuntime(pool,async(client)=>{
      await client.query('BEGIN');
      await client.query("SELECT set_config('contagest.tenant_id',$1,true)",[tenantA]);
      await expectRejected(()=>client.query('SELECT 1/0'),'ERROR_TRANSACTION_MUST_REJECT');
      await client.query('ROLLBACK');
    });
    await withReusedRuntime(pool,(client)=>assertNoContext(client,'TRANSACTION_CONTEXT_LEAK_AFTER_ERROR'));

    await withReusedRuntime(pool,async(client)=>{
      await client.query('BEGIN');
      await client.query("SELECT set_config('contagest.tenant_id',$1,true)",[tenantA]);
      await client.query("SET LOCAL statement_timeout='50ms'");
      await expectRejected(()=>client.query('SELECT pg_sleep(0.20)'),'TIMEOUT_MUST_CANCEL_QUERY');
      await client.query('ROLLBACK');
    });
    await withReusedRuntime(pool,(client)=>assertNoContext(client,'TRANSACTION_CONTEXT_LEAK_AFTER_TIMEOUT'));

    await withReusedRuntime(pool,async(client,pid)=>{
      await client.query('BEGIN');
      await client.query("SELECT set_config('contagest.tenant_id',$1,true)",[tenantA]);
      const pending=client.query('SELECT pg_sleep(5)');
      await waitForActiveSleep(pid);
      const cancelled=await scalar(admin,'SELECT pg_catalog.pg_cancel_backend($1) AS ok',[pid]);
      if(!cancelled?.ok)fail('PG_CANCEL_BACKEND_FAILED');
      await expectRejected(()=>pending,'CANCEL_MUST_REJECT_QUERY');
      await client.query('ROLLBACK');
    });
    await withReusedRuntime(pool,(client)=>assertNoContext(client,'TRANSACTION_CONTEXT_LEAK_AFTER_CANCEL'));
    report.checks.push('two-tenant-crud','child-scope','pool-reuse','commit-rollback-error-timeout-cancel');

    await runPrismaProbe(connectionString);
    report.checks.push('prisma-interactive-transaction');
  }finally{await pool.end();}

  const legacy=await scalar(admin,`SELECT count(*)::int AS n FROM pg_catalog.pg_policies WHERE schemaname='public' AND policyname='contagest_runtime_backend_all'`);
  if(Number(legacy?.n)!==0)fail('RUNTIME_ALL_TENANT_POLICY');
  const attrs=await scalar(admin,`SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname='contagest_runtime'`);
  if(attrs?.rolsuper||attrs?.rolcreatedb||attrs?.rolcreaterole||attrs?.rolreplication||attrs?.rolbypassrls)fail('RUNTIME_ROLE_ESCALATED');
  const owns=await scalar(admin,`SELECT count(*)::int AS n FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND r.rolname='contagest_runtime'`);
  if(Number(owns?.n)!==0)fail('RUNTIME_OWNS_APPLICATION_OBJECTS');
  report.checks.push('no-runtime-all-tenant','least-privilege-no-ownership');

  await fs.mkdir(ARTIFACT_DIR,{recursive:true});
  const artifact=path.join(ARTIFACT_DIR,`${CANDIDATE_SHA}.json`);
  await fs.writeFile(artifact,`${JSON.stringify({...report,verdict:'PASS'},null,2)}\n`,'utf8');
  process.stdout.write(`${JSON.stringify({...report,verdict:'PASS',artifact:path.relative(REPO_ROOT,artifact).replaceAll('\\','/')})}\n`);
}finally{
  try{
    if(admin._connected)await admin.query('DELETE FROM public."Tenant" WHERE "id" = ANY($1::text[])',[[tenantA,tenantB]]).catch(()=>{});
  }finally{await admin.end().catch(()=>{});}
}
