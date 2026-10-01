import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'qa650_jwt_secret_abcdefghijklmnopqrstuvwxyz';
process.env.LICENSE_HASH_SECRET = process.env.LICENSE_HASH_SECRET || 'qa650_license_secret_abcdefghijklmnopqrstuv';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/postgres?schema=public';

const { createApp } = await import('../backend/src/app.ts');
const { HttpError } = await import('../backend/src/shared/http.ts');
const { errorHandler } = await import('../backend/src/shared/middleware/error.ts');
const { observeJob } = await import('../backend/src/shared/observability/job.ts');

test('issue #650 404 response propagates correlation without reflecting request URL data', async (t) => {
  const app = createApp({
    readinessCheck: async () => ({ ready: true, configuration: 'ok', database: 'ok' })
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(async () => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  const response = await fetch(
    `http://127.0.0.1:${address.port}/missing/private-value?password=SENSITIVE_SENTINEL_650`,
    {
      headers: {
        'x-request-id': 'qa-request-650-not-found',
        'x-correlation-id': 'qa-correlation-650'
      }
    }
  );
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('x-correlation-id'), 'qa-correlation-650');

  const payload = await response.json() as any;
  assert.equal(payload.requestId, 'qa-request-650-not-found');
  assert.equal(payload.correlationId, 'qa-correlation-650');
  assert.equal(payload.message, 'Ruta no encontrada.');
  assert.doesNotMatch(JSON.stringify(payload), /private-value|SENSITIVE_SENTINEL_650|password=/i);
});

test('issue #650 expected errors expose bounded details and correlation', () => {
  let statusCode = 0;
  let body: any = null;
  let logged: any = null;
  const req: any = {
    method: 'POST',
    path: '/api/v1/example',
    originalUrl: '/api/v1/example?password=SENSITIVE_SENTINEL_650',
    requestId: 'qa-request-650-http-error',
    correlationId: 'qa-correlation-650-http-error',
    log: {
      error(fields: any) { logged = fields; },
      warn(fields: any) { logged = fields; }
    }
  };
  const res: any = {
    status(code: number) { statusCode = code; return this; },
    json(payload: any) { body = payload; return this; }
  };

  errorHandler(
    new HttpError(409, 'Conflicto de negocio.', {
      code: 'BUSINESS_CONFLICT',
      field: 'documentNumber',
      password: 'SENSITIVE_SENTINEL_650'
    }),
    req,
    res,
    (() => undefined) as any
  );

  assert.equal(statusCode, 409);
  assert.equal(body.code, 'BUSINESS_CONFLICT');
  assert.equal(body.requestId, 'qa-request-650-http-error');
  assert.equal(body.correlationId, 'qa-correlation-650-http-error');
  assert.deepEqual(body.details, { code: 'BUSINESS_CONFLICT', field: 'documentNumber' });
  assert.equal(logged.correlationId, 'qa-correlation-650-http-error');
  assert.doesNotMatch(JSON.stringify({ body, logged }), /SENSITIVE_SENTINEL_650|password=/i);
});

test('issue #650 observed jobs share correlation and never serialize thrown error messages', async () => {
  const records: Array<{ level: string; fields: Record<string, unknown> }> = [];
  const log: any = {
    debug(fields: Record<string, unknown>) { records.push({ level: 'debug', fields }); },
    info(fields: Record<string, unknown>) { records.push({ level: 'info', fields }); },
    warn(fields: Record<string, unknown>) { records.push({ level: 'warn', fields }); },
    error(fields: Record<string, unknown>) { records.push({ level: 'error', fields }); }
  };

  const result = await observeJob('qa650.job', async () => ({ processed: 3, reason: 'complete', password: 'SENSITIVE_SENTINEL_650' }), {
    log,
    completionLevel: 'info',
    summarize: (value) => value
  });
  assert.equal(result.processed, 3);
  assert.equal(records[0].fields.event, 'job.started');
  assert.equal(records[1].fields.event, 'job.completed');
  assert.equal(records[0].fields.correlationId, records[1].fields.correlationId);
  assert.equal(records[1].fields.processed, 3);
  assert.equal('password' in records[1].fields, false);

  records.length = 0;
  await assert.rejects(observeJob('qa650.job.failure', async () => {
    throw new Error('failure SENSITIVE_SENTINEL_650');
  }, { log }));
  assert.equal(records.at(-1)?.fields.event, 'job.failed');
  assert.equal(records.at(-1)?.fields.errorType, 'Error');
  assert.doesNotMatch(JSON.stringify(records), /SENSITIVE_SENTINEL_650/);
});
