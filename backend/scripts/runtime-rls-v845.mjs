#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const SCRIPT_DIR=path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT=path.resolve(SCRIPT_DIR,'..');
const REPO_ROOT=path.resolve(BACKEND_ROOT,'..');
const SIDECAR=path.join(REPO_ROOT,'ops/database/runtime-rls-policy-v845.sql');
const ADMIN_URL=process.env.DIRECT_DATABASE_URL||process.env.DATABASE_URL||'';
const RUNTIME_PASSWORD=`v845_${crypto.randomBytes(18).toString('base64url')}`;

function fail(message){throw new Error(message);}
function dbName(url){try{return decodeURIComponent(new URL(url).pathname.replace(/^\//,''));}catch{return '';}}
function safeDatabase(url){return /(?:v845|ephemeral|test)/i.test(dbName(url));}
function quoteLiteral(value){return `'${String(value).replaceAll("'","''")}'`;}
function runtimeUrl(adminUrl){const url=new URL(adminUrl);url.username='contagest_runtime';url.password=RUNTIME_PASSWORD;return url.toString();}
async function expectRejected(operation,label){let rejected=false;try{await operation();}catch{rejected=true;}if(!rejected)fail(`EXPECTED_REJECTION:${label}`);}
async function scalar(client,sql,params=[]){const {rows}=await client.query(sql,params);return rows[0]||null;}

if(!ADMIN_URL)fail('DATABASE_URL_OR_DIRECT_DATABASE_URL_REQUIRED');
if(!safeDatabase(ADMIN_URL))fail(`V845_ISOLATED_DATABASE_REQUIRED:${dbName(ADMIN_URL)||'unknown'}`);

const admin=new Client({connectionString:ADMIN_URL});
const tenantA=crypto.randomUUID();
const tenantB=crypto.randomUUID();
const clientA=crypto.randomUUID();
const clientB=crypto.randomUUID();
const invoiceA=crypto.randomUUID();
const invoiceB=crypto.randomUUID();
const lineA=crypto.randomUUID();
const lineB=crypto.randomUUID();
const report={ticket:845,candidateSha:process.env.CG_CANDIDATE_SHA||'UNKNOWN',database:dbName(ADMIN_URL),checks:[]};

try{
  await admin.connect();
  const version=await scalar(admin,"SELECT current_setting('server_version_num')::int AS n,current_user AS u");
  if(Math.floor(Number(version?.n||0)/10000)!==17)fail(`POSTGRES_17_REQUIRED:${version?.n||'unknown'}`);
  if(String(version?.u||'')!=='postgres')fail(`POSTGRES_OWNER_CONNECTION_REQUIRED:${version?.u||'unknown'}`);
  report.checks.push('postgres17');

  const required=['Tenant','Client','SalesInvoice','SalesInvoiceLine'];
  for(const table of required){
    const row=await scalar(admin,'SELECT to_regclass($1) IS NOT NULL AS ok',[`public."${table}"`]);
    if(!row?.ok)fail(`MIGRATED_SCHEMA_REQUIRED:${table}`);
  }

  await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_runtime') THEN CREATE ROLE contagest_runtime; END IF; END $$;`);
  await admin.query(`ALTER ROLE contagest_runtime WITH LOGIN PASSWORD ${quoteLiteral(RUNTIME_PASSWORD)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT`);
  await admin.query('GRANT CONNECT ON DATABASE '+JSON.stringify(dbName(ADMIN_URL)).replaceAll('"','"')+' TO contagest_runtime').catch(async()=>{
    await admin.query(`GRANT CONNECT ON DATABASE ${quoteLiteral(dbName(ADMIN_URL))} TO contagest_runtime`);
  });
  await admin.query('GRANT USAGE ON SCHEMA public TO contagest_runtime');
  await admin.query('REVOKE CREATE ON SCHEMA public FROM contagest_runtime');

  const sidecar=await fs.readFile(SIDECAR,'utf8');
  await admin.query(sidecar);
  const tables=await admin.query(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname ~ '^[A-Z]' AND c.relrowsecurity
  `);
  for(const {relname} of tables.rows){
    await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public."${String(relname).replaceAll('"','""')}" TO contagest_runtime`);
  }
  report.checks.push('sidecar-applied');

  await admin.query(`INSERT INTO public."Tenant"("id","rif","name","status") VALUES ($1,$2,$3,'active'),($4,$5,$6,'active')`,[
    tenantA,`V845-A-${tenantA.slice(0,8)}`,'V845 Tenant A',tenantB,`V845-B-${tenantB.slice(0,8)}`,'V845 Tenant B'
  ]);
  await admin.query(`INSERT INTO public."Client"("id","tenantId","rif","name") VALUES ($1,$2,$3,$4),($5,$6,$7,$8)`,[
    clientA,tenantA,`A-${clientA.slice(0,8)}`,'Client A',clientB,tenantB,`B-${clientB.slice(0,8)}`,'Client B'
  ]);
  await admin.query(`INSERT INTO public."SalesInvoice"("id","tenantId","clientId","number","fiscalPeriod") VALUES ($1,$2,$3,$4,'2026-09'),($5,$6,$7,$8,'2026-09')`,[
    invoiceA,tenantA,clientA,`A-${invoiceA.slice(0,8)}`,invoiceB,tenantB,clientB,`B-${invoiceB.slice(0,8)}`
  ]);
  await admin.query(`INSERT INTO public."SalesInvoiceLine"("id","invoiceId","description","quantity","unitPrice","total") VALUES ($1,$2,'Line A',1,10,10),($3,$4,'Line B',1,20,20)`,[
    lineA,invoiceA,lineB,invoiceB
  ]);

  const runtime=new Client({connectionString:runtimeUrl(ADMIN_URL)});
  try{
    await runtime.connect();
    const role=await scalar(runtime,"SELECT current_user AS u, current_setting('contagest.tenant_id',true) AS tenant");
    if(role?.u!=='contagest_runtime')fail(`RUNTIME_ROLE_EXPECTED:${role?.u}`);

    const noContext=await scalar(runtime,'SELECT count(*)::int AS n FROM public."Client"');
    if(Number(noContext?.n)!==0)fail('NO_CONTEXT_MUST_DENY_SELECT');
    await expectRejected(()=>runtime.query(`INSERT INTO public."Client"("id","tenantId","rif","name") VALUES ($1,$2,'NOCTX','No context')`,[crypto.randomUUID(),tenantA]),'no-context-insert');

    await runtime.query('BEGIN');
    await runtime.query("SELECT set_config('contagest.tenant_id','not-a-uuid',true)");
    const invalid=await scalar(runtime,'SELECT count(*)::int AS n FROM public."Client"');
    if(Number(invalid?.n)!==0)fail('INVALID_CONTEXT_MUST_DENY');
    await runtime.query('ROLLBACK');

    await runtime.query('BEGIN');
    await runtime.query("SELECT set_config('contagest.tenant_id',$1,true)",[crypto.randomUUID()]);
    const stale=await scalar(runtime,'SELECT count(*)::int AS n FROM public."Client"');
    if(Number(stale?.n)!==0)fail('STALE_CONTEXT_MUST_DENY');
    await runtime.query('ROLLBACK');

    await runtime.query('BEGIN');
    await runtime.query("SELECT set_config('contagest.tenant_id',$1,true)",[tenantA]);
    const aRows=await runtime.query('SELECT "id" FROM public."Client" ORDER BY "id"');
    if(aRows.rows.length!==1||aRows.rows[0].id!==clientA)fail('TENANT_A_SELECT_SCOPE_FAILED');
    const insertedA=crypto.randomUUID();
    await runtime.query(`INSERT INTO public."Client"("id","tenantId","rif","name") VALUES ($1,$2,$3,'A inserted')`,[insertedA,tenantA,`A-${insertedA.slice(0,8)}`]);
    await expectRejected(()=>runtime.query(`INSERT INTO public."Client"("id","tenantId","rif","name") VALUES ($1,$2,$3,'B forbidden')`,[crypto.randomUUID(),tenantB,`B-X-${Date.now()}`]),'A-to-B-insert');
    const updateB=await runtime.query('UPDATE public."Client" SET "name"=$1 WHERE "id"=$2',['blocked',clientB]);
    if(updateB.rowCount!==0)fail('A_TO_B_UPDATE_MUST_BE_ZERO');
    const deleteB=await runtime.query('DELETE FROM public."Client" WHERE "id"=$1',[clientB]);
    if(deleteB.rowCount!==0)fail('A_TO_B_DELETE_MUST_BE_ZERO');
    const lineRows=await runtime.query('SELECT "id" FROM public."SalesInvoiceLine" ORDER BY "id"');
    if(lineRows.rows.length!==1||lineRows.rows[0].id!==lineA)fail('CHILD_PARENT_SCOPE_FAILED');
    await expectRejected(()=>runtime.query(`INSERT INTO public."SalesInvoiceLine"("id","invoiceId","description","quantity","unitPrice","total") VALUES ($1,$2,'cross',1,1,1)`,[crypto.randomUUID(),invoiceB]),'child-cross-tenant-insert');
    await runtime.query('COMMIT');

    const afterCommit=await scalar(runtime,'SELECT count(*)::int AS n FROM public."Client"');
    if(Number(afterCommit?.n)!==0)fail('TRANSACTION_CONTEXT_LEAK_AFTER_COMMIT');

    await runtime.query('BEGIN');
    await runtime.query("SELECT set_config('contagest.tenant_id',$1,true)",[tenantB]);
    const bRows=await runtime.query('SELECT "id" FROM public."Client" ORDER BY "id"');
    if(bRows.rows.length!==1||bRows.rows[0].id!==clientB)fail('TENANT_B_SELECT_SCOPE_FAILED');
    await runtime.query('ROLLBACK');
    const afterRollback=await scalar(runtime,'SELECT count(*)::int AS n FROM public."Client"');
    if(Number(afterRollback?.n)!==0)fail('TRANSACTION_CONTEXT_LEAK_AFTER_ROLLBACK');
    report.checks.push('tenant-crud','child-scope','fail-closed-context','transaction-local');
  }finally{
    await runtime.end().catch(()=>{});
  }

  const oldPolicy=await scalar(admin,`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public' AND policyname='contagest_runtime_backend_all'`);
  if(Number(oldPolicy?.n)!==0)fail('RUNTIME_ALL_TENANT_POLICY_PRESENT');
  const attrs=await scalar(admin,`SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname='contagest_runtime'`);
  if(attrs?.rolsuper||attrs?.rolcreatedb||attrs?.rolcreaterole||attrs?.rolbypassrls)fail('RUNTIME_ROLE_ESCALATED');
  report.checks.push('no-runtime-all-tenant','least-privilege');

  process.stdout.write(`${JSON.stringify({...report,verdict:'PASS'})}\n`);
}finally{
  try{
    if(admin._connected){
      await admin.query('DELETE FROM public."Tenant" WHERE "id" = ANY($1::text[])',[[tenantA,tenantB]]).catch(()=>{});
    }
  }finally{
    await admin.end().catch(()=>{});
  }
}
