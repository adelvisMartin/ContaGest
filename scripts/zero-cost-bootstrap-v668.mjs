#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const VALID_PROFILES = new Set(['database', 'financial']);
const SIGNALS = ['SIGINT', 'SIGTERM'];

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

function assertLoopbackHttpUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('ZERO_COST_INVALID_HTTP_SMOKE_URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`ZERO_COST_UNSAFE_HTTP_SMOKE_URL:${url.hostname || 'missing'}`);
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
  const configuredAdminUrl = String(env.LOCAL_VERIFY_DATABASE_ADMIN_URL || '').trim();
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

export function verifyNativePostgres17({ adminUrl, adapter = { run: defaultAdapterRun } }) {
  assertLoopbackPostgresUrl(adminUrl);
  const result = adapter.run('psql', ['--dbname', adminUrl, '-Atqc', 'SHOW server_version_num']);
  if (result.status !== 0) throw new Error(`ZERO_COST_NATIVE_SERVER_PROBE_FAILED:${result.stderr || 'unknown'}`);
  const serverVersionNum = Number(String(result.stdout || '').trim());
  if (!Number.isInteger(serverVersionNum) || serverVersionNum <= 0) {
    throw new Error(`ZERO_COST_NATIVE_SERVER_VERSION_INVALID:${String(result.stdout || '').trim() || 'missing'}`);
  }
  const major = Math.trunc(serverVersionNum / 10000);
  if (major !== 17) throw new Error(`ZERO_COST_NATIVE_SERVER_MAJOR_NOT_17:${major}`);
  return { major, serverVersionNum };
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

function defaultSignalTerminate(signal) {
  if (process.platform === 'win32') {
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    process.exit();
  }
  process.kill(process.pid, signal);
}

export function createSignalCleanupRegistry({ target = process, terminate = defaultSignalTerminate } = {}) {
  const cleanups = [];
  const handlers = new Map();
  let handling = false;

  const detach = () => {
    for (const [signal, handler] of handlers) target.removeListener(signal, handler);
    handlers.clear();
  };

  const handle = (signal) => {
    if (handling) return;
    handling = true;
    detach();
    for (let index = cleanups.length - 1; index >= 0; index -= 1) {
      try { cleanups[index](); } catch {}
    }
    terminate(signal);
  };

  for (const signal of SIGNALS) {
    const handler = () => handle(signal);
    handlers.set(signal, handler);
    target.on(signal, handler);
  }

  return {
    register(cleanup) {
      if (typeof cleanup !== 'function') throw new Error('ZERO_COST_SIGNAL_CLEANUP_INVALID');
      cleanups.push(cleanup);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const index = cleanups.indexOf(cleanup);
        if (index >= 0) cleanups.splice(index, 1);
      };
    },
    dispose() {
      detach();
      cleanups.splice(0);
    },
  };
}

export async function waitForHttpReadiness({
  url,
  attempts = 40,
  intervalMs = 250,
  requestTimeoutMs = 1_500,
  fetchImpl = globalThis.fetch,
  pause = defaultPause,
  validate = async (response) => response.ok,
} = {}) {
  const target = assertLoopbackHttpUrl(url);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 200) throw new Error('ZERO_COST_HTTP_ATTEMPTS_INVALID');
  if (!Number.isFinite(intervalMs) || intervalMs < 0 || intervalMs > 5_000) throw new Error('ZERO_COST_HTTP_INTERVAL_INVALID');
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs < 50 || requestTimeoutMs > 10_000) throw new Error('ZERO_COST_HTTP_TIMEOUT_INVALID');
  if (typeof fetchImpl !== 'function') throw new Error('ZERO_COST_HTTP_FETCH_UNAVAILABLE');

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(target, { signal: AbortSignal.timeout(requestTimeoutMs), redirect: 'error' });
      if (await validate(response)) return response;
    } catch {}
    if (attempt < attempts) await pause(intervalMs);
  }
  throw new Error(`ZERO_COST_HTTP_NOT_READY:attempts=${attempts}:target=${target.origin}${target.pathname}`);
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
  cleanupRegistry,
} = {}, fn) {
  if (!['docker', 'podman'].includes(engine)) throw new Error(`ZERO_COST_CONTAINER_ENGINE_INVALID:${engine}`);
  const ownedRegistry = cleanupRegistry || createSignalCleanupRegistry();
  const disposeOwnedRegistry = cleanupRegistry ? () => {} : () => ownedRegistry.dispose();
  let started = false;
  let unregisterSignalCleanup = () => {};
  const cleanupContainer = () => {
    if (!started) return;
    started = false;
    adapter.run(engine, ['rm', '-f', name]);
  };

  try {
    const runResult = adapter.run(engine, buildContainerRunArgs({ name, user, password, database }));
    if (runResult.status !== 0) throw new Error(`ZERO_COST_CONTAINER_START_FAILED:${sanitizeScalar('stderr', runResult.stderr)}`);
    started = true;
    unregisterSignalCleanup = ownedRegistry.register(cleanupContainer);

    const portResult = adapter.run(engine, ['port', name, '5432/tcp']);
    if (portResult.status !== 0) throw new Error(`ZERO_COST_CONTAINER_PORT_FAILED:${sanitizeScalar('stderr', portResult.stderr)}`);
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
    unregisterSignalCleanup();
    cleanupContainer();
    disposeOwnedRegistry();
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

function runVerificationProfiles({ adminUrl, expectedSha, financial, cwd = process.cwd(), env = process.env }) {
  assertLoopbackPostgresUrl(adminUrl);
  const localEnv = { ...env, LOCAL_VERIFY_DATABASE_ADMIN_URL: adminUrl };
  for (const profile of financial ? ['database', 'financial'] : ['database']) {
    const exitCode = runNpm(buildVerifyLocalCommand({ profile, expectedSha }), { cwd, env: localEnv });
    if (exitCode !== 0) throw new Error(`ZERO_COST_VERIFY_FAILED:${profile}:exit=${exitCode}`);
  }
}

async function reserveLoopbackPort() {
  const server = net.createServer();
  server.unref();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('ZERO_COST_LOOPBACK_PORT_UNAVAILABLE');
  }
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function startBackendRuntime({ cwd, env, adminUrl, port, frontendUrl }) {
  const entry = path.join(cwd, 'backend', 'dist', 'src', 'server.js');
  const child = spawn(process.execPath, [entry], {
    cwd,
    env: {
      ...env,
      NODE_ENV: 'development',
      VERCEL: '',
      VERCEL_ENV: '',
      PORT: String(port),
      APP_URL: frontendUrl,
      CORS_ORIGIN: frontendUrl,
      DATABASE_RUNTIME_URL: '',
      DATABASE_URL: adminUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });
  child.stdout?.resume();
  child.stderr?.resume();
  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    defaultPause(2_000).then(() => false),
  ]);
  if (!exited && child.exitCode === null && !child.signalCode) {
    child.kill('SIGKILL');
    await once(child, 'exit').catch(() => {});
  }
}

async function startFrontendArtifactServer({ cwd, port }) {
  const indexPath = path.join(cwd, 'frontend', 'dist', 'index.html');
  const indexHtml = await readFile(indexPath);
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', `http://127.0.0.1:${port}`);
    if (requestUrl.pathname !== '/' && requestUrl.pathname !== '/index.html') {
      response.statusCode = 404;
      response.end('not found');
      return;
    }
    response.statusCode = 200;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(indexHtml);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(() => resolve()));
}

export async function runRuntimeSmoke({
  adminUrl,
  cwd = process.cwd(),
  env = process.env,
  cleanupRegistry,
  readinessAttempts = 40,
  readinessIntervalMs = 250,
} = {}) {
  assertLoopbackPostgresUrl(adminUrl);
  const ownedRegistry = cleanupRegistry || createSignalCleanupRegistry();
  const disposeOwnedRegistry = cleanupRegistry ? () => {} : () => ownedRegistry.dispose();
  const localEnv = { ...env, LOCAL_VERIFY_DATABASE_ADMIN_URL: adminUrl };

  for (const script of ['build:backend', 'build:frontend']) {
    const exitCode = runNpm(['run', script], { cwd, env: localEnv });
    if (exitCode !== 0) throw new Error(`ZERO_COST_SMOKE_BUILD_FAILED:${script}:exit=${exitCode}`);
  }

  const [backendPort, frontendPort] = await Promise.all([reserveLoopbackPort(), reserveLoopbackPort()]);
  const backendUrl = `http://127.0.0.1:${backendPort}/health/ready`;
  const frontendUrl = `http://127.0.0.1:${frontendPort}/`;
  let backend;
  let frontend;
  let unregisterBackend = () => {};
  let unregisterFrontend = () => {};

  try {
    backend = startBackendRuntime({ cwd, env: localEnv, adminUrl, port: backendPort, frontendUrl });
    unregisterBackend = ownedRegistry.register(() => {
      if (backend?.exitCode === null && !backend?.signalCode) backend.kill('SIGTERM');
    });

    await waitForHttpReadiness({
      url: backendUrl,
      attempts: readinessAttempts,
      intervalMs: readinessIntervalMs,
      validate: async (response) => {
        if (!response.ok) return false;
        const payload = await response.json();
        return payload?.ok === true && payload?.status === 'ready' && payload?.checks?.database === 'ok';
      },
    });

    frontend = await startFrontendArtifactServer({ cwd, port: frontendPort });
    unregisterFrontend = ownedRegistry.register(() => frontend?.close());
    await waitForHttpReadiness({
      url: frontendUrl,
      attempts: readinessAttempts,
      intervalMs: readinessIntervalMs,
      validate: async (response) => {
        if (!response.ok) return false;
        const body = await response.text();
        return /<!doctype html|<html/i.test(body);
      },
    });

    return {
      status: 'PASS',
      backend: { status: 'ready', url: backendUrl },
      frontend: { status: 'served', url: frontendUrl },
      scope: 'bootstrap-health-only; functional operational smoke remains #664',
    };
  } finally {
    unregisterFrontend();
    unregisterBackend();
    await closeServer(frontend);
    await stopChild(backend);
    disposeOwnedRegistry();
  }
}

function printHelp() {
  console.log(`ContaGest #668 zero-cost bootstrap\n\nUsage:\n  npm run bootstrap:zero-cost -- [--financial] [--smoke] [--expected-sha <40-hex>]\n\nRuntime order:\n  1. LOCAL_VERIFY_DATABASE_ADMIN_URL on loopback + PostgreSQL server 17\n  2. Docker postgres:17\n  3. Podman postgres:17\n  4. BLOCKED with actionable prerequisite message\n\n--smoke builds both workspaces, checks backend /health/ready and serves/probes the built frontend artifact over loopback HTTP.\n`);
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

  const cleanupRegistry = createSignalCleanupRegistry();
  try {
    const execute = async (adminUrl) => {
      runVerificationProfiles({ adminUrl, expectedSha, financial: args.financial });
      const runtimeSmoke = args.smoke
        ? await runRuntimeSmoke({ adminUrl, cleanupRegistry })
        : { status: 'NOT_EXECUTED' };
      const summary = sanitizeBootstrapSummary({
        status: 'PASS',
        issue: 668,
        expectedSha,
        runtime: runtime.kind === 'native' ? 'native-postgres17' : `${runtime.engine}-postgres17`,
        adminUrl,
        profiles: args.financial ? ['database', 'financial'] : ['database'],
        smoke: args.smoke ? 'PASS' : 'NOT_EXECUTED',
        runtimeSmoke,
        providers: { supabase: 'NOT_REQUIRED', vercel: 'NOT_REQUIRED', githubActions: 'NOT_REQUIRED' },
      });
      console.log(JSON.stringify(summary, null, 2));
    };

    if (runtime.kind === 'native') {
      verifyNativePostgres17({ adminUrl: runtime.adminUrl });
      await execute(runtime.adminUrl);
      return;
    }

    await withOwnedPostgresContainer({ engine: runtime.engine, cleanupRegistry }, async ({ adminUrl }) => execute(adminUrl));
  } finally {
    cleanupRegistry.dispose();
  }
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  cli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'FAIL', issue: 668, error: sanitizeScalar('error', message) }, null, 2));
    process.exitCode = 1;
  });
}
