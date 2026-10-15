#!/usr/bin/env node
/**
 * Destructive fixture preparation is permitted ONLY in a fresh, loopback
 * PostgreSQL 17 database explicitly named hipico_share_test_*.
 *
 * No production credentials, no Supabase remote and no customer data.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ledgerSql=path.join(root,'prisma/migrations/20260827212500_hipico_money_ledger/migration.sql');
const capabilitySql=path.join(root,'prisma/migrations/20261015035000_hipico_report_share_links/migration.sql');
const consent='ephemeral-local-postgres17-hipico-share-rls';
const recorded=[];

export function validateIsolatedDatabaseUrl(value,approval){
  if(approval!==consent) throw new Error('HIPICO_SHARE_RLS_EXPLICIT_ISOLATED_CONSENT_REQUIRED');
  let url;
  try{url=new URL(value);}catch{throw new Error('HIPICO_SHARE_RLS_INVALID_URL');}
  if(!['postgresql:','postgres:'].includes(url.protocol)||
     !['localhost','127.0.0.1','[::1]'].includes(url.hostname) ||
     !/^\/hipico_share_test_[a-z0-9_]{1,45}$/.test(url.pathname) ||
     url.username!=='postgres'||url.search||url.hash)
    throw new Error('HIPICO_SHARE_RLS_REQUIRES_FRESH_LOCAL_TEST_DB_AND_POSTGRES');
  return url.toString();
}
function pass(name,ok){if(!ok)throw new Error('HIPICO_SHARE_RLS_FAILED_'+name);recorded.push(name);}
async function scalar(client,sql,params=[]){const result=await client.query(sql,params);return result.rows[0];}
async function withRole(client,owner,run){
  await client.query('BEGIN');
  try{
    await client.query('SET LOCAL ROLE contagest_runtime');
    if(owner)await client.query("SELECT set_config('hipico.report_owner_id',$1,true)",[owner]);
    await run();
  }finally{await client.query('ROLLBACK');}
}
export async function runIsolatedRlsSuite(env=process.env){
  const url=validateIsolatedDatabaseUrl(env.HIPICO_SHARE_RLS_DATABASE_URL||'',env.HIPICO_SHARE_RLS_CONSENT);
  const admin=new Client({connectionString:url});
  const runtime=new Client({connectionString:url});
  try{
    await admin.connect();
    const server=await scalar(admin,`SELECT current_setting('server_version_num')::int AS version,
       current_user AS username,
       (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser`);
    pass('PG17_SUPERUSER',Math.floor(Number(server.version)/10000)===17 && server.username==='postgres' && server.superuser===true);
    const empty=await scalar(admin,`SELECT to_regclass('public.hipico_money_ledger_entries') IS NULL AS ledger_empty,
      to_regclass('public.hipico_report_share_links') IS NULL AS links_empty`);
    pass('FRESH_ISOLATED_SCHEMA',empty.ledger_empty&&empty.links_empty);
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='contagest_runtime')
      THEN CREATE ROLE contagest_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      END IF;
    END $$;`);
    const role=await scalar(admin,`SELECT rolsuper,rolbypassrls,rolcreatedb
      FROM pg_roles WHERE rolname='contagest_runtime'`);
    pass('UNPRIVILEGED_RUNTIME_ROLE',!role.rolsuper&&!role.rolbypassrls&&!role.rolcreatedb);
    await admin.query('GRANT USAGE ON SCHEMA public TO contagest_runtime');
    await admin.query(await fs.readFile(ledgerSql,'utf8'));
    await admin.query(await fs.readFile(capabilitySql,'utf8'));
    const rls=await scalar(admin,`SELECT relrowsecurity AS enabled,relforcerowsecurity AS forced
      FROM pg_class WHERE oid='public.hipico_report_share_links'::regclass`);
    pass('FORCED_RLS',rls.enabled===true&&rls.forced===true);
    const otherOwner=crypto.randomUUID(),owner=crypto.randomUUID();
    const shares=[
      {id:crypto.randomUUID(),owner,group:'triple-c',token:'a'.repeat(64)},
      {id:crypto.randomUUID(),owner,group:'other-group',token:'b'.repeat(64)},
      {id:crypto.randomUUID(),owner:otherOwner,group:'triple-c',token:'c'.repeat(64)}
    ];
    for(const s of shares){
      await admin.query(`INSERT INTO public.hipico_report_share_links
        (id,owner_id,group_key,audience,token_hash,expires_at)
        VALUES ($1,$2,$3,'group',$4,now()+interval '1 day')`,
      [s.id,s.owner,s.group,s.token]);
    }
    await admin.query(`INSERT INTO public.hipico_money_ledger_entries
      (id,owner_id,group_key,participant_code,currency,entry_type,amount_minor,idempotency_key)
      VALUES
      ($1,$2,'triple-c','A','USD','settlement',1000,$1),
      ($3,$2,'other-group','B','USD','settlement',9000,$3),
      ($4,$5,'triple-c','C','USD','settlement',8000,$4)`,
      [crypto.randomUUID(),owner,crypto.randomUUID(),crypto.randomUUID(),otherOwner]);
    await runtime.connect();
    await withRole(runtime,null,async()=>{
      const rows=await runtime.query('SELECT id FROM public.hipico_report_share_links');
      pass('NO_OWNER_GUC_NO_ACCESS',rows.rowCount===0);
    });
    await withRole(runtime,owner,async()=>{
      const count=await scalar(runtime,'SELECT count(*)::int AS n FROM public.hipico_report_share_links');
      pass('OWNER_A_ONLY_SEES_OWN_LINKS',count.n===2);
      const token=await scalar(runtime,`SELECT count(*)::int AS n FROM public.hipico_report_share_links
        WHERE token_hash=$1 AND group_key='triple-c'`,[shares[0].token]);
      pass('GROUP_SCOPE_FROM_AUTHORIZED_CAPABILITY',token.n===1);
      const money=await scalar(runtime,`SELECT coalesce(sum(amount_minor),0)::text AS minor
        FROM public.hipico_money_ledger_entries WHERE owner_id=$1 AND group_key='triple-c'`,[owner]);
      pass('LEDGER_OWNER_AND_GROUP_SCOPE',money.minor==='1000');
      const attempted=await runtime.query(
        'UPDATE public.hipico_report_share_links SET revoked_at=now() WHERE id=$1',[shares[2].id]);
      pass('FOREIGN_OWNER_REVOKE_DENIED',attempted.rowCount===0);
      await runtime.query('SAVEPOINT block_foreign_insert');
      let blocked=false;
      try{
        await runtime.query(`INSERT INTO public.hipico_report_share_links
          (id,owner_id,group_key,audience,token_hash,expires_at)
          VALUES($1,$2,'triple-c','group',$3,now()+interval '1 day')`,
          [crypto.randomUUID(),otherOwner,'d'.repeat(64)]);
      }catch(e){blocked=String(e.code)==='42501';}
      await runtime.query('ROLLBACK TO SAVEPOINT block_foreign_insert');
      pass('FOREIGN_OWNER_INSERT_DENIED',blocked);
    });
    await withRole(runtime,otherOwner,async()=>{
      const rows=await runtime.query('SELECT id FROM public.hipico_report_share_links');
      pass('OWNER_B_CANNOT_SEE_OWNER_A',rows.rowCount===1 && rows.rows[0].id===shares[2].id);
    });
    const guc=await scalar(runtime,"SELECT nullif(current_setting('hipico.report_owner_id',true),'') AS owner");
    pass('TRANSACTION_LOCAL_OWNER_RESET',guc.owner===null);
    return {status:'PASS',checks:recorded,checksPassed:recorded.length,
      scope:'fresh-ephemeral-loopback-postgres17',candidateSha:String(env.CG_CANDIDATE_SHA||'UNSET').slice(0,40)};
  }finally{
    await runtime.end().catch(()=>{});
    await admin.end().catch(()=>{});
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  runIsolatedRlsSuite().then(v=>process.stdout.write(JSON.stringify(v,null,2)+'\n'))
    .catch(e=>{console.error('HIPICO_SHARE_RLS_NOT_VERIFIED: '+String(e?.message||'error'));process.exitCode=1;});
}
