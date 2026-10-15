import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSmokeEnvironment, buildSmokeSteps, isolatedSmokeEnvironment, runOperationalSmoke
} from '../scripts/erp-operational-smoke-v664.mjs';

const SHA = 'a'.repeat(40);
const ADMIN = 'postgresql://local:password@127.0.0.1:5432/postgres';

test('#664 refuses production and any remote/shared PostgreSQL configuration', () => {
  assert.equal(assertSmokeEnvironment({ LOCAL_VERIFY_DATABASE_ADMIN_URL: ADMIN }, SHA).hostname, '127.0.0.1');
  for (const [env, sha] of [
    [{ LOCAL_VERIFY_DATABASE_ADMIN_URL: 'postgresql://x:y@db.company.invalid/postgres' }, SHA],
    [{ LOCAL_VERIFY_DATABASE_ADMIN_URL: 'postgresql://x:y@localhost:5432/shared_dev' }, SHA],
    [{ LOCAL_VERIFY_DATABASE_ADMIN_URL: ADMIN, NODE_ENV: 'production' }, SHA],
    [{ LOCAL_VERIFY_DATABASE_ADMIN_URL: ADMIN, VERCEL_ENV: 'preview' }, SHA],
    [{ LOCAL_VERIFY_DATABASE_ADMIN_URL: ADMIN }, 'stale'],
    [{ LOCAL_VERIFY_DATABASE_ADMIN_URL: ADMIN + '?options=-c%20search_path%3Dpublic' }, SHA],
    [{}, SHA]
  ]) {
    assert.throws(() => assertSmokeEnvironment(env, sha));
  }
});

test('#664 plan is short and delegates to actual repository owners; no skipped tests or mocks', () => {
  const steps = buildSmokeSteps();
  assert.deepEqual(steps.map(x => x.id), [
    'schema', 'migrations', 'seed', 'rls', 'api-finance', 'chromium-erp'
  ]);
  const serialized = JSON.stringify(steps);
  assert.match(serialized, /erp-operational-financial-v664\.test\.ts/);
  assert.match(serialized, /migration:test:from-zero/);
  assert.match(serialized, /erp-real-browser-postgres-v5875\.mjs/);
  assert.doesNotMatch(serialized, /--force|--skip|waitForTimeout|--project=webkit/);
});

test('#664 child environment uses only disposable DB and removes remote provider credentials', () => {
  const original = {
    NODE_ENV: 'development', VERCEL_ENV: 'preview',
    DATABASE_URL: 'postgresql://user:real@production.invalid/production',
    DIRECT_DATABASE_URL: 'postgresql://user:real@production.invalid/production',
    DATABASE_RUNTIME_URL: 'postgresql://user:real@production.invalid/production',
    POSTGRES_PRISMA_URL: 'postgresql://user:real@production.invalid/production',
    SUPABASE_SERVICE_ROLE_KEY: 'SECRET', OPENAI_API_KEY: 'SECRET',
    WHATSAPP_CLOUD_TOKEN: 'SECRET', ALLOW_DEV_TENANT_HEADER: 'true'
  };
  const isolated = 'postgresql://test:local@127.0.0.1:5432/contagest_smoke_abc_e2e';
  const child = isolatedSmokeEnvironment(original, isolated);
  assert.equal(child.DATABASE_URL, isolated);
  assert.equal(child.DIRECT_DATABASE_URL, isolated);
  assert.equal(child.DATABASE_RUNTIME_URL, isolated);
  assert.equal(child.NODE_ENV, 'test');
  assert.equal(child.VERCEL_ENV, '');
  assert.equal(child.ALLOW_DEV_TENANT_HEADER, 'false');
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'WHATSAPP_CLOUD_TOKEN', 'POSTGRES_PRISMA_URL']) {
    assert.equal(child[key], undefined, key);
  }
  assert.match(child.JWT_SECRET, /^[0-9a-f]{64}$/);
  assert.match(child.LICENSE_HASH_SECRET, /^[0-9a-f]{64}$/);
  assert.notEqual(child.JWT_SECRET, child.LICENSE_HASH_SECRET);
  assert.equal(original.DATABASE_URL.includes('production.invalid'), true, 'source config must not be mutated');
});

test('#664 missing local PostgreSQL or Hípico URL cannot yield fake PASS', async () => {
  const absentPg = await runOperationalSmoke({ env: {}, candidateSha: SHA, erpOnly: true });
  assert.equal(absentPg.status, 'BLOCKED');
  assert.deepEqual(absentPg.stages.map(x => x.status), ['BLOCKED']);
  assert.equal(absentPg.stages[0].code, 'SMOKE_LOCAL_POSTGRES_ADMIN_REQUIRED');

  const absentHipico = await runOperationalSmoke({
    env: { LOCAL_VERIFY_DATABASE_ADMIN_URL: ADMIN }, candidateSha: SHA
  });
  assert.equal(absentHipico.status, 'BLOCKED');
  assert.equal(absentHipico.stages[0].code, 'SMOKE_HIPICO_BASE_URL_REQUIRED');
});
