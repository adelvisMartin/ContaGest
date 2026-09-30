import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const connectionString = String(process.env.DATABASE_URL || '').trim();
const migrationPath = path.resolve(
  process.cwd(),
  'prisma/migrations/20260930020500_issue_844_coordinate_challenge_bootstrap/migration.sql'
);

if (!connectionString) throw new Error('V844_DATABASE_URL_REQUIRED');
const databaseName = new URL(connectionString).pathname.replace(/^\//, '');
if (!/v844|ephemeral|test/i.test(databaseName)) {
  throw new Error(`V844_EPHEMERAL_DATABASE_REQUIRED:${databaseName || 'unknown'}`);
}

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
    CREATE TABLE public."CoordinateChallenge" (
      "id" text PRIMARY KEY,
      "tenantId" text NOT NULL,
      "userId" text NOT NULL
    );
  `);
}

async function applyMigration() {
  let sql;
  try {
    sql = await readFile(migrationPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`V844_MFA_MIGRATION_MISSING:${migrationPath}`);
    throw error;
  }
  await exec(sql);
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
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('private.contagest_bootstrap_coordinate_challenge_identity(text)')
  `);
  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].security_definer, true);
  assert.equal(result.rows[0].owner, 'postgres');
  assert.deepEqual(result.rows[0].proconfig, ['search_path=pg_catalog']);
  assert.equal(result.rows[0].public_exec, false);
  assert.equal(result.rows[0].anon_exec, false);
  assert.equal(result.rows[0].authenticated_exec, false);
  assert.equal(result.rows[0].runtime_exec, true);

  const runtime = await exec(`SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname='contagest_runtime'`);
  assert.deepEqual(runtime.rows[0], { rolsuper:false, rolcreatedb:false, rolcreaterole:false, rolbypassrls:false });
}

async function assertChallengeResolution() {
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB = '22222222-2222-4222-8222-222222222222';
  const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const challengeA = '12345678-1234-4234-8234-123456789abc';
  const challengeB = '87654321-4321-4321-8321-cba987654321';

  await exec(`
    INSERT INTO public."CoordinateChallenge" ("id","tenantId","userId") VALUES
      ($1,$2,$3),
      ($4,$5,$6)
  `, [challengeA,tenantA,userA,challengeB,tenantB,userB]);

  const own = await asRuntime(
    'SELECT * FROM private.contagest_bootstrap_coordinate_challenge_identity($1)',
    [challengeA]
  );
  assert.deepEqual(own.rows, [{ tenant_id:tenantA, user_profile_id:userA }]);
  assert.deepEqual(Object.keys(own.rows[0]).sort(), ['tenant_id','user_profile_id']);

  const other = await asRuntime(
    'SELECT * FROM private.contagest_bootstrap_coordinate_challenge_identity($1)',
    [challengeB]
  );
  assert.deepEqual(other.rows, [{ tenant_id:tenantB, user_profile_id:userB }]);

  const missing = await asRuntime(
    'SELECT * FROM private.contagest_bootstrap_coordinate_challenge_identity($1)',
    ['00000000-0000-4000-8000-000000000000']
  );
  assert.equal(missing.rowCount, 0);

  await assert.rejects(
    asRuntime('SELECT "tenantId" FROM public."CoordinateChallenge" LIMIT 1'),
    /permission denied/i,
    'runtime must resolve only through the narrow SECURITY DEFINER function in this fixture'
  );
}

try {
  await client.connect();
  await resetFixture();
  await applyMigration();
  await assertFunctionSecurity();
  await assertChallengeResolution();
  console.log('AUTH_BOOTSTRAP_COORDINATE_V844_PASS');
} finally {
  await client.end();
}
