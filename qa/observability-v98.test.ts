import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'qa98_jwt_secret_abcdefghijklmnopqrstuvwxyz';
process.env.LICENSE_HASH_SECRET = process.env.LICENSE_HASH_SECRET || 'qa98_license_secret_abcdefghijklmnopqrstuv';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public';
process.env.GIT_COMMIT_SHA = process.env.GIT_COMMIT_SHA || 'qa98candidate0123456789abcdef0123456789ab';

const {
  createLogger,
  deploymentMetadata
} = await import('../backend/src/shared/observability/logger.ts');
const {
  evaluateReadinessConfiguration,
  runReadinessCheck
} = await import('../backend/src/shared/observability/health.ts');
const {
  metricsSnapshot,
  recordAuthEvent,
  recordImportBatchDuration,
  recordRateLimit,
  renderPrometheusMetrics,
  resetMetricsForTests
} = await import('../backend/src/shared/observability/metrics.ts');
const { createApp } = await import('../backend/src/app.ts');

test('issue #98 logger redacts secrets and named PII fields as structured JSON', async () => {
  let output = '';
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    }
  });

  process.env.LOG_LEVEL = 'info';
  const qaLogger = createLogger(sink as any);
  process.env.LOG_LEVEL = 'silent';

  qaLogger.info({
    event: 'qa.redaction',
    authorization: 'Bearer top-secret-token',
    cookie: 'session=super-secret-cookie',
    password: 'super-secret-password',
    email: 'person@example.test',
    rif: 'J-12345678-9',
    headers: {
      authorization: 'Bearer nested-secret',
      cookie: 'cg_access=nested-cookie'
    },
    body: {
      password: 'nested-password',
      token: 'nested-token'
    },
    harmless: 'line1\nline2'
  }, 'redaction contract');

  await new Promise<void>((resolve) => setImmediate(resolve));
  const line = output.trim();
  assert.ok(line, 'logger must emit one structured line');
  const payload = JSON.parse(line);

  assert.equal(payload.authorization, '[REDACTED]');
  assert.equal(payload.cookie, '[REDACTED]');
  assert.equal(payload.password, '[REDACTED]');
  assert.equal(payload.email, '[REDACTED]');
  assert.equal(payload.rif, '[REDACTED]');
  assert.equal(payload.headers.authorization, '[REDACTED]');
  assert.equal(payload.headers.cookie, '[REDACTED]');
  assert.equal(payload.body.password, '[REDACTED]');
  assert.equal(payload.body.token, '[REDACTED]');
  assert.equal(payload.service, 'contagest-api');
  assert.ok(payload.version);
  assert.ok(payload.commitSha);
  assert.ok(payload.timestamp);
  assert.doesNotMatch(line, /top-secret|super-secret|person@example|J-12345678-9|nested-password|nested-token/);
  assert.equal(line.split('\n').length, 1, 'untrusted values must not inject extra log records');
});

test('issue #98 metric dimensions are low-cardinality allowlists', () => {
  resetMetricsForTests();
  recordRateLimit('global');
  recordRateLimit('person@example.test');
  recordAuthEvent('auth.login.failed');
  recordAuthEvent('J-12345678-9');
  recordImportBatchDuration(25);

  const text = renderPrometheusMetrics();
  assert.match(text, /limiter="global"/);
  assert.match(text, /limiter="unknown"/);
  assert.match(text, /event="auth.login.failed"/);
  assert.match(text, /event="unknown"/);
  assert.doesNotMatch(text, /person@example|J-12345678-9/);
});

test('issue #98 readiness configuration fails closed for production-like missing secrets', async () => {
  const missing = evaluateReadinessConfiguration({
    NODE_ENV: 'production',
    DATABASE_RUNTIME_URL: 'postgresql://runtime:placeholder@db.invalid:6543/postgres'
  } as NodeJS.ProcessEnv, true);

  assert.equal(missing.ok, false);
  assert.equal(missing.checks.database, true);
  assert.equal(missing.checks.jwt, false);
  assert.equal(missing.checks.license, false);

  const source = {
    NODE_ENV: 'production',
    DATABASE_RUNTIME_URL: 'postgresql://runtime:placeholder@db.invalid:6543/postgres',
    JWT_SECRET: 'j'.repeat(40),
    LICENSE_HASH_SECRET: 'l'.repeat(40)
  } as NodeJS.ProcessEnv;

  const dbDown = await runReadinessCheck({
    source,
    productionLike: true,
    dbProbe: async () => ({ outcome: 'error', durationMs: 4 })
  });
  assert.deepEqual(dbDown, {
    ready: false,
    configuration: 'ok',
    database: 'failed'
  });

  const dbUp = await runReadinessCheck({
    source,
    productionLike: true,
    dbProbe: async () => ({ outcome: 'ok', durationMs: 3 })
  });
  assert.deepEqual(dbUp, {
    ready: true,
    configuration: 'ok',
    database: 'ok'
  });
});

test('issue #98 5xx errors preserve correlation without leaking stack in non-development responses', async () => {
  const { errorHandler } = await import('../backend/src/shared/middleware/error.ts');
  let statusCode = 0;
  let body: any = null;
  let logged: any = null;
  const req: any = {
    method: 'GET',
    path: '/qa/error',
    originalUrl: '/qa/error?email=person@example.test',
    requestId: 'qa-request-98-500',
    log: {
      error(fields: any) { logged = fields; },
      warn(fields: any) { logged = fields; }
    }
  };
  const res: any = {
    status(code: number) { statusCode = code; return this; },
    json(payload: any) { body = payload; return this; }
  };

  errorHandler(new Error('synthetic internal failure'), req, res, (() => undefined) as any);

  assert.equal(statusCode, 500);
  assert.equal(body.requestId, 'qa-request-98-500');
  assert.equal(body.stack, undefined);
  assert.equal(logged.requestId, 'qa-request-98-500');
  assert.equal(logged.status, 500);
  assert.doesNotMatch(JSON.stringify(logged), /person@example|synthetic internal failure/);
});

test('issue #98 live/ready semantics, request correlation and metrics contract', async (t) => {
  resetMetricsForTests();
  let readinessCalls = 0;
  const app = createApp({
    readinessCheck: async () => {
      readinessCalls += 1;
      return { ready: false, configuration: 'ok', database: 'failed' };
    }
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(async () => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  const requestId = 'qa-request-98-valid';

  const live = await fetch(`${base}/health/live`, {
    headers: { 'x-request-id': requestId }
  });
  assert.equal(live.status, 200);
  assert.equal(live.headers.get('x-request-id'), requestId);
  const livePayload = await live.json() as any;
  assert.equal(livePayload.ok, true);
  assert.equal(livePayload.status, 'live');
  assert.equal(livePayload.buildCommit, deploymentMetadata.commitSha);
  assert.ok(livePayload.version);
  assert.equal(readinessCalls, 0, 'liveness must never invoke readiness/DB');

  const invalidIncoming = await fetch(`${base}/health/live`, {
    headers: { 'x-request-id': 'short' }
  });
  assert.equal(invalidIncoming.status, 200);
  const generated = String(invalidIncoming.headers.get('x-request-id') || '');
  assert.notEqual(generated, 'short');
  assert.match(generated, /^[0-9a-f-]{36}$/i);

  const ready = await fetch(`${base}/health/ready`, {
    headers: { 'x-request-id': 'qa-request-98-ready' }
  });
  assert.equal(ready.status, 503);
  const readyPayload = await ready.json() as any;
  assert.equal(readyPayload.ok, false);
  assert.equal(readyPayload.status, 'not_ready');
  assert.deepEqual(readyPayload.checks, { configuration: 'ok', database: 'failed' });
  assert.equal(readinessCalls, 1);
  assert.doesNotMatch(JSON.stringify(readyPayload), /postgresql:|DATABASE_|JWT_SECRET|LICENSE_HASH_SECRET|stack/i);

  const missing = await fetch(`${base}/not-found/customer@example.test?rif=J-12345678-9`, {
    headers: { 'x-request-id': 'qa-request-98-404' }
  });
  assert.equal(missing.status, 404);
  const missingPayload = await missing.json() as any;
  assert.equal(missingPayload.requestId, 'qa-request-98-404');

  const loadStarted = performance.now();
  const loadResponses = await Promise.all(
    Array.from({ length: 64 }, (_value, index) => fetch(`${base}/health/live`, {
      headers: { 'x-request-id': `qa-request-98-load-${String(index).padStart(3, '0')}` }
    }))
  );
  assert.ok(loadResponses.every((response) => response.status === 200));
  assert.ok(performance.now() - loadStarted < 15_000, 'basic in-process load should complete without pathological logging overhead');

  await new Promise<void>((resolve) => setImmediate(resolve));
  const metrics = await fetch(`${base}/metrics`, {
    headers: { 'x-request-id': 'qa-request-98-metrics' }
  });
  assert.equal(metrics.status, 200);
  const text = await metrics.text();
  assert.match(text, /contagest_build_info/);
  assert.match(text, /contagest_http_requests_total/);
  assert.match(text, /contagest_http_request_duration_ms/);
  assert.match(text, /contagest_db_probe_total/);
  assert.match(text, /contagest_rate_limit_activations_total/);
  assert.match(text, /contagest_auth_events_total/);
  assert.match(text, /contagest_import_batch_duration_ms/);
  assert.doesNotMatch(text, /customer@example|J-12345678-9|password|authorization|cookie/i);

  const snapshot = metricsSnapshot();
  assert.ok(snapshot.http.total >= 68);
  assert.ok(snapshot.http.latencies.some((entry: any) => entry.route === '/health/live'));
});
