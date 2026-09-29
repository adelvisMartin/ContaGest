#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const VALID_PROFILES = new Set(['database', 'financial']);

function executableFor(command) {
  if (process.platform === 'win32' && command === 'npm') return 'npm.cmd';
  return command;
}

export function parsePostgresMajor(text) {
  const match = String(text || '').match(/PostgreSQL\)?\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function assertLoopbackPostgresUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('ZERO_COST_INVALID_POSTGRES_URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('ZERO_COST_INVALID_POSTGRES_URL');
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`ZERO_COST_UNSAFE_REMOTE_POSTGRES:${url.hostname}`);
  }
  return url;
}

export function parsePublishedPostgresPort(text) {
  const line = String(text || '').trim().split(/\r?\n/).find(Boolean) || '';
  let match = line.match(/^(?:127\.0\.0\.1|localhost):(\d+)$/i);
  if (!match) match = line.match(/^\[?::1\]?:(\d+)$/);
  if (!match) throw new Error(`ZERO_COST_UNSAFE_CONTAINER_BINDING:${line || 'missing'}`);
  const port = Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`ZERO_COST_INVALID_CONTAINER_PORT:${match[1]}`);
  }
  return port;
}

function defaultProbe(command) {
  const result = spawnSync(executableFor(command), ['--version'], { encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0) {
    return { available: false, output: result.error?.message || result.stderr || result.stdout || '' };
  }
  return { available: true, output: String(result.stdout || result.stderr || '').trim() };
}

export function selectPostgresRuntime({ env = process.env, probe = defaultProbe } = {}) {
  const configuredAdminUrl = String(env.LOCAL_VERIFY_DATABASE_ADMIN_URL || env.DATABASE_URL || '').trim();
  if (configuredAdminUrl) assertLoopbackPostgresUrl(configuredAdminUrl);

  const psql = probe('psql');
  const major = psql.available ? parsePostgresMajor(psql.output) : null;
  if (configuredAdminUrl && psql.available && major === 17) {
    return { kind: 'native', major, adminUrl: configuredAdminUrl };
  }

  for (const engine of ['docker', 'podman']) {
    const result = probe(engine);
    if (result.available) {
      return {
        kind: 'container',
        engine,
        reason: configuredAdminUrl && major !== 17 ? `NATIVE_POSTGRES_MAJOR_${major ?? 'UNKNOWN'}_NOT_17` : undefined,
      };
    }
  }

  return {
    kind: 'blocked',
    reason: configuredAdminUrl && psql.available && major !== 17
      ? `POSTGRES17_OR_CONTAINER_RUNTIME_REQUIRED:native-major=${major ?? 'unknown'}`
      : 'POSTGRES17_OR_CONTAINER_RUNTIME_REQUIRED',
  };
}

export function buildContainerRunArgs({ name, user, password, database = 'postgres' }) {
  return [
    'run', '-d', '--rm', '--name', name,
    '-e', `POSTGRES_USER=${user}`,
    '-e', `POSTGRES_PASSWORD=${password}`,
    '-e', `POSTGRES_DB=${database}`,
    '-p', '127.0.0.1::5432',
    'postgres:17',
  ];
}

export function buildVerifyLocalCommand({ profile, expectedSha }) {
  if (!VALID_PROFILES.has(profile)) throw new Error(`ZERO_COST_PROFILE_INVALID:${profile}`);
  if (!/^[0-9a-f]{40}$/i.test(String(expectedSha || ''))) throw new Error('ZERO_COST_EXPECTED_SHA_INVALID');
  return ['run', 'verify:local', '--', '--profile', profile, '--expected-sha', expectedSha];
}

function sanitizeScalar(key, value) {
  if (/password|secret|token|key/i.test(key)) return '[REDACTED]';
  if (typeof value !== 'string') return value;
  if (/bearer\s+\S+/i.test(value) || /eyJ[A-Za-z0-9_-]{8,}\./.test(value)) return '[REDACTED]';
  try {
    const url = new URL(value);
    if (['postgres:', 'postgresql:'].includes(url.protocol)) {
      url.username = '';
      url.password = '';
      return url.toString().replace('://@', '://');
    }
  } catch {}
  return value;
}

export function sanitizeBootstrapSummary(value) {
  if (Array.isArray(value)) return value.map(sanitizeBootstrapSummary);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      item && typeof item === 'object' ? sanitizeBootstrapSummary(item) : sanitizeScalar(key, item),
    ]));
  }
  return value;
}

function defaultAdapterRun(command, args, { env = process.env, cwd = process.cwd() } = {}) {
  const result = spawnSync(executableFor(command), args, { cwd, env, encoding: 'utf8', shell: false });
  return {
    status: result.status ?? (result.error ? 1 : 0),
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || result.error?.message || ''),
  };
}

function defaultPause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withOwnedPostgresContainer({
  engine,
  adapter = { run: defaultAdapterRun, pause: defaultPause },
  readinessAttempts = 40,
  readinessIntervalMs = 250,
  name = `contagest-pg17-${process.pid}-${Date.now()}`,
  user = `cg${crypto.randomBytes(4).toString('hex')}`,
  password = crypto.randomBytes(24).toString('base64url'),
  database = 'postgres',
} = {}, fn) {
  if (!['docker', 'podman'].includes(engine)) throw new Error(`ZERO_COST_CONTAINER_ENGINE_INVALID:${engine}`);
  let started = false;
  try {
    const runResult = adapter.run(engine, buildContainerRunArgs({ name, user, password, database }));
    if (runResult.status !== 0) throw new Error(`ZERO_COST_CONTAINER_START_FAILED:${runResult.stderr || 'unknown'}`);
    started = true;

    const portResult = adapter.run(engine, ['port', name, '5432/tcp']);
    if (portResult.status !== 0) throw new Error(`ZERO_COST_CONTAINER_PORT_FAILED:${portResult.stderr || 'unknown'}`);
    const port = parsePublishedPostgresPort(portResult.stdout);

    let ready = false;
    for (let attempt = 1; attempt <= readinessAttempts; attempt += 1) {
      const result = adapter.run(engine, ['exec', name, 'pg_isready', '-U', user, '-d', database]);
      if (result.status === 0) {
        ready = true;
        break;
      }
      if (attempt < readinessAttempts) await adapter.pause(readinessIntervalMs);
    }
    if (!ready) throw new Error(`ZERO_COST_POSTGRES17_NOT_READY:attempts=${readinessAttempts}`);

    const adminUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;
    assertLoopbackPostgresUrl(adminUrl);
    return await fn({ adminUrl, name, engine, port, user, password, database, major: 17 });
  } finally {
    if (started) adapter.run(engine, ['rm', '-f', name]);
  }
}

function gitHead(cwd = process.cwd()) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
}

function parseCliArgs(argv) {
  const out = { financial: false, smoke: false, expectedSha: '', help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--financial') out.financial = true;
    else if (arg === '--smoke') out.smoke = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--expected-sha') out.expectedSha = argv[++index] || '';
    else if (arg.startsWith('--expected-sha=')) out.expectedSha = arg.slice('--expected-sha='.length);
    else throw new Error(`ZERO_COST_ARGUMENT_UNKNOWN:${arg}`);
  }
  return out;
}

function runNpm(args, { cwd = process.cwd(), env = process.env } = {}) {
  const result = spawnSync(executableFor('npm'), args, { cwd, env, encoding: 'utf8', shell: false, stdio: 'inherit' });
  if (result.error) throw new Error(`ZERO_COST_COMMAND_BLOCKED:${result.error.message}`);
  return result.status ?? 1;
}

function runVerificationProfiles({ adminUrl, expectedSha, financial, smoke, cwd = process.cwd(), env = process.env }) {
  assertLoopbackPostgresUrl(adminUrl);
  const localEnv = { ...env, LOCAL_VERIFY_DATABASE_ADMIN_URL: adminUrl };
  for (const profile of financial ? ['database', 'financial'] : ['database']) {
    const exitCode = runNpm(buildVerifyLocalCommand({ profile, expectedSha }), { cwd, env: localEnv });
    if (exitCode !== 0) throw new Error(`ZERO_COST_VERIFY_FAILED:${profile}:exit=${exitCode}`);
  }
  if (smoke) {
    for (const script of ['build:backend', 'build:frontend']) {
      const exitCode = runNpm(['run', script], { cwd, env: localEnv });
      if (exitCode !== 0) throw new Error(`ZERO_COST_SMOKE_FAILED:${script}:exit=${exitCode}`);
    }
  }
}

function printHelp() {
  console.log(`ContaGest #668 zero-cost bootstrap\n\nUsage:\n  node scripts/zero-cost-bootstrap-v668.mjs [--financial] [--smoke] [--expected-sha <40-hex>]\n\nRuntime order:\n  1. LOCAL_VERIFY_DATABASE_ADMIN_URL/DATABASE_URL on loopback + psql 17\n  2. Docker postgres:17\n  3. Podman postgres:17\n  4. BLOCKED with actionable prerequisite message\n`);
}

async function cli() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const expectedSha = args.expectedSha || gitHead();
  if (!/^[0-9a-f]{40}$/i.test(expectedSha)) throw new Error('ZERO_COST_EXPECTED_SHA_INVALID');

  const runtime = selectPostgresRuntime();
  if (runtime.kind === 'blocked') {
    console.error(JSON.stringify({ status: 'BLOCKED', issue: 668, reason: runtime.reason, required: 'PostgreSQL 17 loopback OR Docker/Podman' }, null, 2));
    process.exitCode = 2;
    return;
  }

  const execute = async (adminUrl) => {
    runVerificationProfiles({ adminUrl, expectedSha, financial: args.financial, smoke: args.smoke });
    const summary = sanitizeBootstrapSummary({
      status: 'PASS',
      issue: 668,
      expectedSha,
      runtime: runtime.kind === 'native' ? 'native-postgres17' : `${runtime.engine}-postgres17`,
      adminUrl,
      profiles: args.financial ? ['database', 'financial'] : ['database'],
      smoke: args.smoke ? 'PASS' : 'NOT_EXECUTED',
      providers: { supabase: 'NOT_REQUIRED', vercel: 'NOT_REQUIRED', githubActions: 'NOT_REQUIRED' },
    });
    console.log(JSON.stringify(summary, null, 2));
  };

  if (runtime.kind === 'native') {
    await execute(runtime.adminUrl);
    return;
  }

  await withOwnedPostgresContainer({ engine: runtime.engine }, async ({ adminUrl }) => execute(adminUrl));
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  cli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'FAIL', issue: 668, error: sanitizeScalar('error', message) }, null, 2));
    process.exitCode = 1;
  });
}
