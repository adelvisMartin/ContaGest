import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const connectionString = String(process.env.DATABASE_URL || '').trim();
if (!connectionString) throw new Error('V851_DATABASE_URL_REQUIRED');
const databaseName = new URL(connectionString).pathname.replace(/^\//, '');
if (!/v851|ephemeral|test/i.test(databaseName)) throw new Error(`V851_EPHEMERAL_DATABASE_REQUIRED:${databaseName || 'unknown'}`);

const client = new Client({ connectionString });
const exec = (sql, values = []) => client.query(sql, values);
const migrationPath = path.resolve(process.cwd(), 'prisma/migrations/20260930170000_issue_851_session_surface_hardening/migration.sql');
const tenantA='11111111-1111-4111-8111-111111111111';
const tenantB='22222222-2222-4222-8222-222222222222';
const sessionId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function resetFixture(){
  await exec('DROP SCHEMA IF EXISTS private CASCADE');
  await exec('DROP SCHEMA IF EXISTS public CASCADE');
  await exec('CREATE SCHEMA public');
  await exec('CREATE SCHEMA private');
  await exec(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_runtime') THEN
      CREATE ROLE contagest_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
  END $$`);
  await exec(`
    CREATE TABLE public."Tenant" (
      "id" text PRIMARY KEY, "status" text NOT NULL DEFAULT 'active'
    );
    CREATE TABLE public."UserProfile" (
      "id" text PRIMARY KEY, "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE
    );
    CREATE TABLE public."UserSession" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL REFERENCES public."UserProfile"("id") ON DELETE CASCADE,
      "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
      "refreshHash" text NOT NULL UNIQUE,
      "csrfHash" text NOT NULL,
      "status" text NOT NULL DEFAULT 'active',
      "rotationCounter" integer NOT NULL DEFAULT 0,
      "expiresAt" timestamptz NOT NULL,
      "revokedAt" timestamptz,
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public."Tenant" ("id","status") VALUES ($1,'active'),($2,'active');
    INSERT INTO public."UserProfile" ("id","tenantId") VALUES ('user-a',$1);
    INSERT INTO public."UserSession"
      ("id","userId","tenantId","refreshHash","csrfHash","status","rotationCounter","expiresAt")
    VALUES ($3,'user-a',$1,'refresh-current','csrf-current','active',0,now()+interval '30 days');
  `,[tenantA,tenantB,sessionId]);
}

async function applyMigration(){
  const sql=await readFile(migrationPath,'utf8');
  await exec(sql);
}

async function asRuntime(tenantId,sql,values=[]){
  await exec('BEGIN');
  try{
    await exec('SET LOCAL ROLE contagest_runtime');
    await exec(`SELECT set_config('contagest.tenant_id',$1,true)`,[tenantId]);
    const result=await exec(sql,values);
    await exec('ROLLBACK');
    return result;
  }catch(error){
    await exec('ROLLBACK');
    throw error;
  }
}

async function assertSecurity(){
  const fn=await exec(`
    SELECT p.prosecdef AS security_definer,
           pg_get_userbyid(p.proowner) AS owner,
           has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_exec,
           has_function_privilege('contagest_runtime',p.oid,'EXECUTE') AS runtime_exec
    FROM pg_proc p WHERE p.oid=to_regprocedure('private.contagest_runtime_refresh_session_identity(text)')
  `);
  assert.deepEqual(fn.rows[0],{security_definer:true,owner:'postgres',anon_exec:false,authenticated_exec:false,runtime_exec:true});
  const grants=await exec(`SELECT
    has_table_privilege('anon','public."UserSessionRefreshReuse"','SELECT') AS anon_select,
    has_table_privilege('authenticated','public."UserSessionRefreshReuse"','SELECT') AS authenticated_select,
    has_table_privilege('contagest_runtime','public."UserSessionRefreshReuse"','SELECT') AS runtime_select`);
  assert.deepEqual(grants.rows[0],{anon_select:false,authenticated_select:false,runtime_select:true});
}

async function assertRotationLineage(){
  const current=await asRuntime(tenantA,'SELECT * FROM private.contagest_runtime_refresh_session_identity($1)',['refresh-current']);
  assert.equal(current.rowCount,1);
  assert.equal(current.rows[0].refresh_state,'current');
  assert.equal(current.rows[0].csrf_hash,'csrf-current');

  await exec('BEGIN');
  try{
    await exec(`INSERT INTO public."UserSessionRefreshReuse"
      ("sessionId","tenantId","refreshHash","csrfHash","rotationCounter","expiresAt")
      VALUES ($1,$2,'refresh-current','csrf-current',0,now()+interval '30 days')`,[sessionId,tenantA]);
    const changed=await exec(`UPDATE public."UserSession"
      SET "refreshHash"='refresh-next',"csrfHash"='csrf-next',"rotationCounter"=1,"updatedAt"=now()
      WHERE "id"=$1 AND "refreshHash"='refresh-current' AND "csrfHash"='csrf-current' AND "status"='active'`,[sessionId]);
    assert.equal(changed.rowCount,1);
    await exec('COMMIT');
  }catch(error){await exec('ROLLBACK');throw error;}

  const currentNext=await asRuntime(tenantA,'SELECT * FROM private.contagest_runtime_refresh_session_identity($1)',['refresh-next']);
  assert.equal(currentNext.rows[0].refresh_state,'current');
  const reused=await asRuntime(tenantA,'SELECT * FROM private.contagest_runtime_refresh_session_identity($1)',['refresh-current']);
  assert.equal(reused.rowCount,1);
  assert.equal(reused.rows[0].refresh_state,'reused');
  assert.equal(reused.rows[0].csrf_hash,'csrf-current');

  const crossTenant=await asRuntime(tenantB,'SELECT * FROM public."UserSessionRefreshReuse"');
  assert.equal(crossTenant.rowCount,0,'runtime RLS must hide another tenant refresh lineage');

  await exec(`UPDATE public."UserSession" SET "status"='revoked',"revokedAt"=now() WHERE "id"=$1`,[sessionId]);
  const afterRevoke=await asRuntime(tenantA,'SELECT * FROM private.contagest_runtime_refresh_session_identity($1)',['refresh-current']);
  assert.equal(afterRevoke.rowCount,0,'revoked family must not resolve a consumed refresh credential');
}

try{
  await client.connect();
  await resetFixture();
  await applyMigration();
  await assertSecurity();
  await assertRotationLineage();
  console.log('SESSION_SURFACE_V851_PASS');
}finally{
  await client.end();
}
