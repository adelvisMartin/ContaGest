import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertLoopbackPostgresUrl,
  buildContainerRunArgs,
  buildVerifyLocalCommand,
  parsePostgresMajor,
  parsePublishedPostgresPort,
  sanitizeBootstrapSummary,
  selectPostgresRuntime,
  withOwnedPostgresContainer,
} from '../scripts/zero-cost-bootstrap-v668.mjs';

test('parsePostgresMajor accepts PostgreSQL 17 and identifies other majors', () => {
  assert.equal(parsePostgresMajor('psql (PostgreSQL) 17.6'), 17);
  assert.equal(parsePostgresMajor('psql (PostgreSQL) 16.9'), 16);
  assert.equal(parsePostgresMajor('postgres (PostgreSQL) 18beta1'), 18);
  assert.equal(parsePostgresMajor('UNAVAILABLE'), null);
});

test('assertLoopbackPostgresUrl accepts loopback and rejects remote/provider URLs', () => {
  assert.doesNotThrow(() => assertLoopbackPostgresUrl('postgresql://u:p@127.0.0.1:5432/postgres'));
  assert.doesNotThrow(() => assertLoopbackPostgresUrl('postgres://u:p@localhost:5432/postgres'));
  assert.throws(() => assertLoopbackPostgresUrl('postgresql://u:p@db.example.com:5432/postgres'), /ZERO_COST_UNSAFE_REMOTE_POSTGRES/);
  assert.throws(() => assertLoopbackPostgresUrl('https://localhost/db'), /ZERO_COST_INVALID_POSTGRES_URL/);
});

test('selectPostgresRuntime prefers configured native PostgreSQL 17', () => {
  const runtime = selectPostgresRuntime({
    env: { LOCAL_VERIFY_DATABASE_ADMIN_URL: 'postgresql://u:p@127.0.0.1:5432/postgres' },
    probe: (command) => command === 'psql' ? { available: true, output: 'psql (PostgreSQL) 17.6' } : { available: false, output: '' },
  });
  assert.equal(runtime.kind, 'native');
  assert.equal(runtime.major, 17);
});

test('selectPostgresRuntime refuses non-17 native PostgreSQL and falls back to docker', () => {
  const runtime = selectPostgresRuntime({
    env: { LOCAL_VERIFY_DATABASE_ADMIN_URL: 'postgresql://u:p@127.0.0.1:5432/postgres' },
    probe: (command) => {
      if (command === 'psql') return { available: true, output: 'psql (PostgreSQL) 16.9' };
      if (command === 'docker') return { available: true, output: 'Docker version 28.0.0' };
      return { available: false, output: '' };
    },
  });
  assert.equal(runtime.kind, 'container');
  assert.equal(runtime.engine, 'docker');
});

test('selectPostgresRuntime falls back to podman and otherwise returns BLOCKED', () => {
  const podman = selectPostgresRuntime({
    env: {},
    probe: (command) => command === 'podman' ? { available: true, output: 'podman version 5.0.0' } : { available: false, output: '' },
  });
  assert.equal(podman.kind, 'container');
  assert.equal(podman.engine, 'podman');

  const blocked = selectPostgresRuntime({ env: {}, probe: () => ({ available: false, output: '' }) });
  assert.equal(blocked.kind, 'blocked');
  assert.match(blocked.reason, /POSTGRES17_OR_CONTAINER_RUNTIME_REQUIRED/);
});

test('parsePublishedPostgresPort accepts loopback dynamic ports and rejects remote bindings', () => {
  assert.equal(parsePublishedPostgresPort('127.0.0.1:49153'), 49153);
  assert.equal(parsePublishedPostgresPort('::1:49154'), 49154);
  assert.throws(() => parsePublishedPostgresPort('0.0.0.0:49155'), /ZERO_COST_UNSAFE_CONTAINER_BINDING/);
  assert.throws(() => parsePublishedPostgresPort('192.168.1.2:49155'), /ZERO_COST_UNSAFE_CONTAINER_BINDING/);
});

test('container args use postgres:17, loopback dynamic publish and synthetic env only', () => {
  const args = buildContainerRunArgs({ name: 'cg668-test', user: 'cg', password: 'secret', database: 'postgres' });
  assert.ok(args.includes('postgres:17'));
  assert.ok(args.includes('127.0.0.1::5432'));
  assert.ok(args.includes('POSTGRES_USER=cg'));
  assert.ok(args.includes('POSTGRES_PASSWORD=secret'));
  assert.ok(!args.some((value) => /supabase/i.test(value)));
});

test('buildVerifyLocalCommand binds exact SHA and requested profile', () => {
  const command = buildVerifyLocalCommand({ profile: 'database', expectedSha: 'a'.repeat(40) });
  assert.deepEqual(command, ['run', 'verify:local', '--', '--profile', 'database', '--expected-sha', 'a'.repeat(40)]);
});

test('sanitizeBootstrapSummary removes credential-bearing URLs and passwords', () => {
  const summary = sanitizeBootstrapSummary({
    adminUrl: 'postgresql://cg:supersecret@127.0.0.1:49153/postgres',
    password: 'supersecret',
    status: 'PASS',
  });
  const serialized = JSON.stringify(summary);
  assert.ok(!serialized.includes('supersecret'));
  assert.equal(summary.adminUrl, 'postgresql://127.0.0.1:49153/postgres');
  assert.equal(summary.password, '[REDACTED]');
});

test('withOwnedPostgresContainer always removes owned container after delegated failure', async () => {
  const calls = [];
  const adapter = {
    run(engine, args) {
      calls.push([engine, ...args]);
      if (args[0] === 'run') return { status: 0, stdout: 'container-id\n', stderr: '' };
      if (args[0] === 'port') return { status: 0, stdout: '127.0.0.1:49153\n', stderr: '' };
      if (args[0] === 'exec') return { status: 0, stdout: 'ready\n', stderr: '' };
      if (args[0] === 'rm') return { status: 0, stdout: '', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    },
    async pause() {},
  };

  await assert.rejects(
    withOwnedPostgresContainer({ engine: 'docker', adapter, readinessAttempts: 2 }, async () => {
      throw new Error('delegated failure');
    }),
    /delegated failure/
  );
  assert.ok(calls.some((call) => call[1] === 'rm' && call.includes('-f')));
});
