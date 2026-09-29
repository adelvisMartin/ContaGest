import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

test('database and financial profiles include PostgreSQL migration authority rather than ad-hoc SQL', () => {
  const database = buildProfilePlan('database').map((gate) => gate.command);
  const financial = buildProfilePlan('financial').map((gate) => gate.command);
  assert.ok(database.includes('npm run migration:test:from-zero'));
  assert.ok(database.includes('npm run migration:test:upgrade'));
  assert.ok(database.includes('npm run audit:database-authority'));
  assert.ok(financial.includes('npm run test:backend:fiscal:authority:real'));
  assert.ok(financial.includes('npm run test:backend:idempotency:real'));
});

test('full profile de-duplicates commands from authoritative profiles', () => {
  const commands = buildProfilePlan('full').map((gate) => gate.command);
  assert.equal(new Set(commands).size, commands.length);
  assert.ok(commands.includes('npm run qa:ui'));
  assert.ok(commands.includes('npm run migration:test:from-zero'));
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
    remote: { ci: 'BLOCKED', deploy: 'NOT_EXECUTED' },
  });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.remote, { ci: 'BLOCKED', deploy: 'NOT_EXECUTED' });
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

test('manifest hash is deterministic and excludes its own hash field', () => {
  const a = { candidateSha: 'a', profile: 'backend', gates: [{ id: 'x', status: 'PASS' }] };
  const b = { profile: 'backend', gates: [{ status: 'PASS', id: 'x' }], candidateSha: 'a', manifestSha256: 'ignored' };
  assert.equal(computeManifestHash(a), computeManifestHash(b));
});

test('sanitization redacts credential-bearing URLs and token-like values', () => {
  assert.equal(sanitizeEnvironmentValue('postgresql://user:secret@localhost:5432/db'), 'postgresql://localhost:5432/db');
  assert.equal(sanitizeEnvironmentValue('Bearer abc.def.ghi'), '[REDACTED]');
});
