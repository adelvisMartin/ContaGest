import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildProfilePlan,
  computeManifestHash,
  ephemeralDatabaseConfig,
  profilesForRouterDomains,
  resolveGitContext,
  runPlan,
  sanitizeEnvironmentValue,
} from '../scripts/local-verification-runner-v630.mjs';
import {
  CATEGORY,
  assertDestructiveDatabaseSafe,
  classifyMigrationHistoryChanges,
  classifyStepFailure,
  deterministicManifestHash,
  sanitizeText,
  tenantIsolationSmokeSql,
} from '../scripts/canonical-database-gate-v632.mjs';

function initRepo() {
  const root = execFileSync('mktemp', ['-d'], { encoding: 'utf8' }).trim();
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'qa@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'QA'], { cwd: root });
  execFileSync('git', ['checkout', '-b', 'main'], { cwd: root });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'base'], { cwd: root });
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  execFileSync('git', ['checkout', '-b', 'feature'], { cwd: root });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'candidate'], { cwd: root });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  return { root, base, head };
}

test('backend profile reuses authoritative commands and does not duplicate test logic', () => {
  const plan = buildProfilePlan('backend');
  assert.deepEqual(plan.map((gate) => gate.command), [
    'npm run typecheck',
    'npm test',
    'npm run build:backend',
  ]);
  assert.equal(plan.every((gate) => gate.required), true);
});

test('database and financial profiles consume one canonical database contract', () => {
  const canonical = 'node scripts/canonical-database-gate-v632.mjs';
  const database = buildProfilePlan('database').map((gate) => gate.command);
  const financial = buildProfilePlan('financial').map((gate) => gate.command);
  assert.deepEqual(database, ['npm run typecheck', canonical]);
  assert.ok(financial.includes(canonical));
  assert.ok(!database.includes('npm run migration:test:from-zero'));
  assert.ok(!database.includes('npm run migration:test:upgrade'));
  assert.ok(!database.includes('npm run audit:database-authority'));
  assert.ok(financial.includes('npm run test:backend:fiscal:authority:real'));
  assert.ok(financial.includes('npm run test:backend:idempotency:real'));
});

test('full profile de-duplicates the canonical database gate', () => {
  const canonical = 'node scripts/canonical-database-gate-v632.mjs';
  const commands = buildProfilePlan('full').map((gate) => gate.command);
  assert.equal(new Set(commands).size, commands.length);
  assert.equal(commands.filter((command) => command === canonical).length, 1);
  assert.ok(commands.includes('npm run qa:ui:58'));
});

test('router domains map changed scope to the minimum material profiles', () => {
  assert.deepEqual(profilesForRouterDomains(['database-migration']), ['database']);
  assert.deepEqual(profilesForRouterDomains(['accounting-financial']), ['financial']);
  assert.deepEqual(profilesForRouterDomains(['frontend-shell-design']), ['ui']);
});

test('exact candidate SHA mismatch is rejected', () => {
  const { root, head } = initRepo();
  assert.throws(
    () => resolveGitContext({ cwd: root, expectedSha: '0'.repeat(40), baseRef: 'main' }),
    /EVIDENCE_SHA_MISMATCH/
  );
  const context = resolveGitContext({ cwd: root, expectedSha: head, baseRef: 'main' });
  assert.equal(context.candidateSha, head);
  assert.equal(context.baseRef, 'main');
  assert.match(context.baseSha, /^[0-9a-f]{40}$/);
});

test('required gate failure fails profile while optional NOT_APPLICABLE does not', async () => {
  const result = await runPlan({
    plan: [
      { id: 'required-pass', command: 'pass', required: true },
      { id: 'optional-na', command: 'na', required: false },
      { id: 'required-fail', command: 'fail', required: true },
    ],
    execute: async (gate) => gate.command === 'fail'
      ? { status: 'FAIL', exitCode: 7 }
      : gate.command === 'na'
        ? { status: 'NOT_APPLICABLE', exitCode: null }
        : { status: 'PASS', exitCode: 0 },
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 7);
});

test('blocked remote metadata never changes local PASS', async () => {
  const result = await runPlan({
    plan: [{ id: 'local', command: 'pass', required: true }],
    execute: async () => ({ status: 'PASS', exitCode: 0 }),
    remote: { ci: 'BLOCKED_INFRASTRUCTURE', deploy: 'NOT_EXECUTED' },
  });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.remote, { ci: 'BLOCKED_INFRASTRUCTURE', deploy: 'NOT_EXECUTED' });
});

test('ephemeral database config is unique, local-only and secret-safe by construction', () => {
  const config = ephemeralDatabaseConfig({
    candidateSha: 'a'.repeat(40),
    env: { LOCAL_VERIFY_DATABASE_ADMIN_URL: 'postgresql://postgres:secret@127.0.0.1:5432/postgres' },
  });
  assert.match(config.databaseName, /^contagest_verify_[a-z0-9_]+_e2e$/);
  assert.match(config.databaseUrl, new RegExp(`/${config.databaseName}$`));
  assert.throws(() => ephemeralDatabaseConfig({
    candidateSha: 'a'.repeat(40),
    env: { LOCAL_VERIFY_DATABASE_ADMIN_URL: 'postgresql://postgres:secret@db.example.com:5432/postgres' },
  }), /LOCAL_POSTGRES_BLOCKED:NON_LOCAL_HOST/);
});

test('ephemeral database cleanup remains in finally so failures still drop the owned DB', () => {
  const source = readFileSync(new URL('../scripts/local-verification-runner-v630.mjs', import.meta.url), 'utf8');
  assert.match(source, /try\{return await fn/);
  assert.match(source, /finally\{runPsql/);
  assert.match(source, /DROP DATABASE IF EXISTS/);
});

test('manifest hash is deterministic and excludes its own hash field', () => {
  const a = { candidateSha: 'a', profile: 'backend', gates: [{ id: 'x', status: 'PASS' }] };
  const b = { profile: 'backend', gates: [{ status: 'PASS', id: 'x' }], candidateSha: 'a', manifestSha256: 'ignored' };
  assert.equal(computeManifestHash(a), computeManifestHash(b));
});

test('sanitization redacts credential-bearing URLs and token-like values', () => {
  assert.equal(sanitizeEnvironmentValue('postgresql://user:secret@localhost:5432/db'), 'postgresql://localhost:5432/db');
  assert.equal(sanitizeEnvironmentValue('Bearer abc.def.ghi'), '[REDACTED]');
});

test('#632 stable result categories are contract-locked', () => {
  assert.deepEqual(Object.values(CATEGORY), [
    'AUTHORITY_CONFLICT',
    'MIGRATION_HISTORY_MUTATED',
    'FROM_ZERO_FAILED',
    'UPGRADE_DIVERGENCE',
    'TYPE_MISMATCH',
    'CONSTRAINT_MISMATCH',
    'TENANT_ISOLATION_RISK',
    'DRIFT_DETECTED',
    'PASS',
  ]);
});

test('#632 allows a new migration but rejects mutation of approved migration history', () => {
  const basePaths = new Set([
    'backend/prisma/migrations/20260101000000_base/migration.sql',
    'backend/prisma/migrations/20260202000000_existing/migration.sql',
  ]);
  assert.equal(classifyMigrationHistoryChanges(basePaths, [
    { status: 'A', path: 'backend/prisma/migrations/20260303000000_new/migration.sql' },
  ]).category, CATEGORY.PASS);
  const mutation = classifyMigrationHistoryChanges(basePaths, [
    { status: 'M', path: 'backend/prisma/migrations/20260202000000_existing/migration.sql' },
  ]);
  assert.equal(mutation.category, CATEGORY.MIGRATION_HISTORY_MUTATED);
  assert.match(mutation.detail, /20260202000000_existing/);
});

test('#632 maps duplicate authority and divergent upgrades to stable failures', () => {
  assert.equal(classifyStepFailure('authority', 'MIGRATION_DUPLICATE_AUTHORITY').category, CATEGORY.AUTHORITY_CONFLICT);
  assert.equal(classifyStepFailure('upgrade', 'UPGRADE_DIVERGENCE:snapshot').category, CATEGORY.UPGRADE_DIVERGENCE);
  assert.equal(classifyStepFailure('from-zero', 'MIGRATION_APPLY_FAILED').category, CATEGORY.FROM_ZERO_FAILED);
});

test('#632 refuses destructive production/non-loopback URLs', () => {
  assert.doesNotThrow(() => assertDestructiveDatabaseSafe('postgresql://u:p@127.0.0.1:5432/contagest_abc_e2e'));
  assert.throws(() => assertDestructiveDatabaseSafe('postgresql://u:p@db.prod.example:5432/contagest_e2e'), /DESTRUCTIVE_DATABASE_UNSAFE/);
  assert.throws(() => assertDestructiveDatabaseSafe('postgresql://u:p@127.0.0.1:5432/contagest'), /DESTRUCTIVE_DATABASE_UNSAFE/);
});

test('#632 deterministic manifest ignores temporal metadata but remains SHA-sensitive', () => {
  const a = { candidateSha: 'a'.repeat(40), status: 'PASS', startedAt: 'x', finishedAt: 'y', checks: [{ id: 'x', status: 'PASS' }] };
  const b = { checks: [{ status: 'PASS', id: 'x' }], status: 'PASS', candidateSha: 'a'.repeat(40), startedAt: 'later', finishedAt: 'later' };
  const c = { ...b, candidateSha: 'b'.repeat(40) };
  assert.equal(deterministicManifestHash(a), deterministicManifestHash(b));
  assert.notEqual(deterministicManifestHash(a), deterministicManifestHash(c));
});

test('#632 sanitizes database credentials and bearer tokens from evidence text', () => {
  const text = sanitizeText('target=postgresql://user:secret@db.example.com:5432/prod Bearer abc.def.ghi');
  assert.ok(!text.includes('secret'));
  assert.ok(!text.includes('abc.def.ghi'));
  assert.match(text, /postgresql:\/\/db\.example\.com:5432\/prod/);
});

test('#632 two-tenant smoke is negative, transactional and rollback-safe', () => {
  const sql = tenantIsolationSmokeSql();
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /ROLLBACK;/);
  assert.match(sql, /unique_violation/);
  assert.match(sql, /foreign_key_violation/);
  assert.match(sql, /cg632-tenant-a/);
  assert.match(sql, /cg632-tenant-b/);
});
