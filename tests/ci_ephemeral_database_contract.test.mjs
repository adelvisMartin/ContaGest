import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/import-transactional-v95.yml', 'utf8');
const guard = readFileSync('ops/database/prepare-supabase-ephemeral.sql', 'utf8');

test('Imports #95 usa una base PostgreSQL marcada explícitamente como efímera', () => {
  assert.match(workflow, /POSTGRES_DB:\s*contagest_import_v95_e2e/);
  assert.match(workflow, /contagest_import_v95_e2e\?schema=public/);
  assert.doesNotMatch(workflow, /contagest_import_v95(?!_e2e)/);
});

test('el guard de compatibilidad Supabase mantiene fail-closed fuera de bases efímeras', () => {
  assert.match(guard, /\(_e2e\|_drill\|_restore\)\$/);
  assert.match(guard, /Refusing Supabase compatibility stubs in non-ephemeral database/);
});

test('la preparación efímera recrea el baseline canónico antes del historial Prisma', () => {
  assert.match(guard, /contagest_full_bootstrap_v8_5\.sql/);
  const guardIndex=guard.indexOf('Refusing Supabase compatibility stubs');
  const baselineIndex=guard.indexOf('contagest_full_bootstrap_v8_5.sql');
  assert.ok(guardIndex>=0&&baselineIndex>guardIndex,'baseline SQL must remain behind the ephemeral database-name guard');
});

test('Prisma deploy records only the known baseline migration on guarded ephemeral databases', () => {
  const script = readFileSync('backend/scripts/prepare-ephemeral-prisma-baseline.mjs', 'utf8');
  const backendPackage = JSON.parse(readFileSync('backend/package.json', 'utf8'));

  assert.match(script, /\(_e2e\|_drill\|_restore\)\$/);
  assert.match(script, /0001_init/);
  assert.match(script, /REQUIRED_BASELINE_TABLES/);
  assert.match(script, /EPHEMERAL_BASELINE_INCOMPLETE/);
  assert.match(script, /migrate','resolve','--applied'/);
  assert.doesNotMatch(script, /--rolled-back/);
  assert.equal(
    backendPackage.scripts['prisma:deploy'],
    'npm run prisma:sync-schema && npm run prisma:baseline:ephemeral && prisma migrate deploy',
  );
});

test('ephemeral baseline resolver is a no-op for non-ephemeral database names', () => {
  const script = readFileSync('backend/scripts/prepare-ephemeral-prisma-baseline.mjs', 'utf8');
  const guardIndex = script.indexOf('EPHEMERAL_DB_PATTERN.test(dbName)');
  const resolveIndex = script.indexOf("'migrate','resolve'");
  assert.ok(guardIndex >= 0 && resolveIndex > guardIndex);
  assert.match(script, /is not ephemeral; no baseline mutation performed/);
});
