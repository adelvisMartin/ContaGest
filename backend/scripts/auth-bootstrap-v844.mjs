import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const connectionString = String(process.env.DATABASE_URL || '').trim();
const migrationPath = path.resolve(process.cwd(), 'prisma/migrations/20260930010500_issue_844_auth_bootstrap_authority/migration.sql');

if (!connectionString) throw new Error('V844_DATABASE_URL_REQUIRED');
const databaseName = new URL(connectionString).pathname.replace(/^\//, '');
if (!/v844|ephemeral|test/i.test(databaseName)) throw new Error(`V844_EPHEMERAL_DATABASE_REQUIRED:${databaseName || 'unknown'}`);

const client = new Client({ connectionString });
const exec = (sql, values = []) => client.query(sql, values);

async function resetFixture() {
  await exec('DROP SCHEMA IF EXISTS private CASCADE');
  await exec('DROP SCHEMA IF EXISTS public CASCADE');
  await exec('CREATE SCHEMA public');
  await exec('CREATE SCHEMA private');
  await exec(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_runtime') THEN
      CREATE ROLE contagest_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
  END $$`);
  await exec(`
    CREATE TABLE public."Tenant" (
      "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "rif" text NOT NULL UNIQUE,
      "name" text NOT NULL,
      "legalName" text,
      "plan" text NOT NULL DEFAULT 'enterprise',
      "status" text NOT NULL DEFAULT 'active',
      "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public."UserProfile" (
      "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
      "authUserId" text UNIQUE,
      "email" text NOT NULL,
      "fullName" text NOT NULL,
      "passwordHash" text,
      "status" text NOT NULL DEFAULT 'active',
      "accessExpiresAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("tenantId", "email")
    );
    CREATE TABLE public."Permission" ("id" text PRIMARY KEY DEFAULT gen_random_uuid()::text, "key" text NOT NULL UNIQUE, "description" text);
    CREATE TABLE public."Role" (
      "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
      "name" text NOT NULL,
      "description" text,
      "system" boolean NOT NULL DEFAULT false,
      "scope" text NOT NULL DEFAULT 'tenant',
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("tenantId", "name")
    );
    CREATE TABLE public."RolePermission" (
      "roleId" text NOT NULL REFERENCES public."Role"("id") ON DELETE CASCADE,
      "permissionId" text NOT NULL REFERENCES public."Permission"("id") ON DELETE CASCADE,
      PRIMARY KEY ("roleId", "permissionId")
    );
    CREATE TABLE public."UserRole" (
      "userId" text NOT NULL REFERENCES public."UserProfile"("id") ON DELETE CASCADE,
      "roleId" text NOT NULL REFERENCES public."Role"("id") ON DELETE CASCADE,
      PRIMARY KEY ("userId", "roleId")
    );
    CREATE TABLE public."AccountUser" (
      "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "email" text NOT NULL,
      "fullName" text,
      "status" text NOT NULL DEFAULT 'active',
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public."TenantMembership" (
      "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "accountUserId" text NOT NULL REFERENCES public."AccountUser"("id") ON DELETE CASCADE,
      "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
      "userProfileId" text NOT NULL UNIQUE REFERENCES public."UserProfile"("id") ON DELETE CASCADE,
      "roleLabel" text,
      "status" text NOT NULL DEFAULT 'active',
      "isDefault" boolean NOT NULL DEFAULT false,
      "linkSource" text NOT NULL DEFAULT 'self',
      "linkedAt" timestamptz NOT NULL DEFAULT now(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("accountUserId", "tenantId")
    );
  `);
}

async function applyMigration() {
  let sql;
  try { sql = await readFile(migrationPath, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`V844_MIGRATION_MISSING:${migrationPath}`);
    throw error;
  }
  await exec(sql);
}

async function seedTenants() {
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB = '22222222-2222-4222-8222-222222222222';
  await exec(`
    INSERT INTO public."Tenant" ("id","rif","name","status") VALUES
      ($1,'J-10000000-1','Tenant A','active'),
      ($2,'J-20000000-2','Tenant B','active');
    INSERT INTO public."UserProfile" ("id","tenantId","authUserId","email","fullName","passwordHash","status") VALUES
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',$1,'supabase-a','owner@example.test','Owner A','hash-a','active'),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',$2,'supabase-b','owner@example.test','Owner B','hash-b','active'),
      ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',$2,'supabase-disabled','disabled@example.test','Disabled B','hash-disabled','disabled');
  `, [tenantA, tenantB]);
  return { tenantA, tenantB };
}

async function asRuntime(sql, values = []) {
  await exec('BEGIN');
  try {
    await exec('SET LOCAL ROLE contagest_runtime');
    const result = await exec(sql, values);
    await exec('ROLLBACK');
    return result;
  } catch (error) {
    await exec('ROLLBACK');
    throw error;
  }
}

async function assertFunctionSecurity() {
  const signatures = [
    'private.contagest_bootstrap_login_identity(text,text)',
    'private.contagest_bootstrap_supabase_identity(text)',
    'private.contagest_bootstrap_register_tenant(text,text,text,text,text,text,text)'
  ];
  for (const signature of signatures) {
    const result = await exec(`
      SELECT p.prosecdef AS security_definer,
             pg_get_userbyid(p.proowner) AS owner,
             p.proconfig,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec,
             has_function_privilege('contagest_runtime', p.oid, 'EXECUTE') AS runtime_exec,
             EXISTS (
               SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
               WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
             ) AS public_exec
      FROM pg_proc p WHERE p.oid = to_regprocedure($1)
    `, [signature]);
    assert.equal(result.rowCount, 1, `${signature} must exist`);
    const row = result.rows[0];
    assert.equal(row.security_definer, true);
    assert.equal(row.owner, 'postgres');
    assert.deepEqual(row.proconfig, ['search_path=pg_catalog']);
    assert.equal(row.public_exec, false);
    assert.equal(row.anon_exec, false);
    assert.equal(row.authenticated_exec, false);
    assert.equal(row.runtime_exec, true);
  }
  const schemaUsage = await exec(`SELECT has_schema_privilege('contagest_runtime','private','USAGE') AS runtime_usage`);
  assert.equal(schemaUsage.rows[0].runtime_usage, true);
  const runtime = await exec(`SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname='contagest_runtime'`);
  assert.deepEqual(runtime.rows[0], { rolsuper:false, rolcreatedb:false, rolcreaterole:false, rolbypassrls:false });
}

async function assertLoginResolution({ tenantA, tenantB }) {
  const own = await asRuntime('SELECT * FROM private.contagest_bootstrap_login_identity($1,$2)', [' j-10000000-1 ', ' OWNER@EXAMPLE.TEST ']);
  assert.equal(own.rowCount, 1);
  assert.deepEqual(own.rows[0], {
    tenant_id: tenantA,
    user_profile_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    password_hash: 'hash-a'
  });
  assert.deepEqual(Object.keys(own.rows[0]).sort(), ['password_hash','tenant_id','user_profile_id']);

  const other = await asRuntime('SELECT * FROM private.contagest_bootstrap_login_identity($1,$2)', ['J-20000000-2', 'owner@example.test']);
  assert.equal(other.rows[0].tenant_id, tenantB);

  const crossPair = await asRuntime('SELECT * FROM private.contagest_bootstrap_login_identity($1,$2)', ['J-10000000-1', 'disabled@example.test']);
  assert.equal(crossPair.rowCount, 0);

  const arbitraryTenant = await asRuntime('SELECT * FROM private.contagest_bootstrap_login_identity($1,$2)', [tenantB, 'owner@example.test']);
  assert.equal(arbitraryTenant.rowCount, 0, 'tenant id must never be accepted as login authority');
}

async function assertSupabaseResolution({ tenantA, tenantB }) {
  const own = await asRuntime('SELECT * FROM private.contagest_bootstrap_supabase_identity($1)', ['supabase-a']);
  assert.deepEqual(own.rows[0], { tenant_id: tenantA, user_profile_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });

  const other = await asRuntime('SELECT * FROM private.contagest_bootstrap_supabase_identity($1)', ['supabase-b']);
  assert.equal(other.rows[0].tenant_id, tenantB);

  const disabled = await asRuntime('SELECT * FROM private.contagest_bootstrap_supabase_identity($1)', ['supabase-disabled']);
  assert.equal(disabled.rowCount, 0);

  await exec(`UPDATE public."Tenant" SET "status"='suspended' WHERE "id"=$1`, [tenantB]);
  const suspended = await asRuntime('SELECT * FROM private.contagest_bootstrap_supabase_identity($1)', ['supabase-b']);
  assert.equal(suspended.rowCount, 0);
  await exec(`UPDATE public."Tenant" SET "status"='active' WHERE "id"=$1`, [tenantB]);
}

async function assertRegistration() {
  const input = ['J-30000000-3','Tenant C','Tenant C Legal','enterprise','ADMIN@TENANT-C.TEST','Admin C','bcrypt-hash-c'];
  const created = await asRuntime('SELECT * FROM private.contagest_bootstrap_register_tenant($1,$2,$3,$4,$5,$6,$7)', input);
  assert.equal(created.rowCount, 1);
  const { tenant_id:tenantId, user_profile_id:userId } = created.rows[0];
  assert.match(tenantId, /^[0-9a-f-]{36}$/i);
  assert.match(userId, /^[0-9a-f-]{36}$/i);

  const graph = await exec(`
    SELECT
      (SELECT count(*)::int FROM public."Tenant" WHERE "id"=$1) AS tenants,
      (SELECT count(*)::int FROM public."UserProfile" WHERE "id"=$2 AND "tenantId"=$1 AND "status"='active') AS profiles,
      (SELECT count(*)::int FROM public."Role" WHERE "tenantId"=$1 AND "name"='Administrador' AND "system" AND "scope"='tenant') AS admin_roles,
      (SELECT count(*)::int FROM public."UserRole" ur JOIN public."Role" r ON r."id"=ur."roleId" WHERE ur."userId"=$2 AND r."tenantId"=$1) AS user_roles,
      (SELECT count(*)::int FROM public."TenantMembership" WHERE "tenantId"=$1 AND "userProfileId"=$2 AND "status"='active' AND "linkSource"='self') AS memberships
  `, [tenantId, userId]);
  assert.deepEqual(graph.rows[0], { tenants:1, profiles:1, admin_roles:1, user_roles:1, memberships:1 });

  await assert.rejects(
    asRuntime('SELECT * FROM private.contagest_bootstrap_register_tenant($1,$2,$3,$4,$5,$6,$7)', input),
    /CONTAGEST_BOOTSTRAP_REGISTRATION_CONFLICT/
  );
  const duplicateCount = await exec(`SELECT count(*)::int AS count FROM public."Tenant" WHERE upper(btrim("rif"))='J-30000000-3'`);
  assert.equal(duplicateCount.rows[0].count, 1);

  const secondTenant = await asRuntime(
    'SELECT * FROM private.contagest_bootstrap_register_tenant($1,$2,$3,$4,$5,$6,$7)',
    ['J-40000000-4','Tenant D','Tenant D Legal','enterprise','admin@tenant-c.test','Admin D','bcrypt-hash-d']
  );
  assert.equal(secondTenant.rowCount, 1, 'equal email text in another tenant must not imply the same AccountUser identity');
  assert.notEqual(secondTenant.rows[0].tenant_id, tenantId);
  const accountUsers = await exec(`SELECT count(*)::int AS count FROM public."AccountUser" WHERE lower("email")='admin@tenant-c.test'`);
  assert.equal(accountUsers.rows[0].count, 2, 'bootstrap registration must preserve distinct cross-tenant identity records');
}

try {
  await client.connect();
  await resetFixture();
  await applyMigration();
  const tenants = await seedTenants();
  await assertFunctionSecurity();
  await assertLoginResolution(tenants);
  await assertSupabaseResolution(tenants);
  await assertRegistration();
  console.log('AUTH_BOOTSTRAP_V844_PASS');
} finally {
  await client.end();
}
