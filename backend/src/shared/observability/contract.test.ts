import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError } from '../http.js';
import * as contextModule from './context.js';
import * as loggerModule from './logger.js';

const contractModule = await import('./contract.js').catch(() => null as any);

function requireFunction(source: any, name: string) {
  assert.equal(typeof source?.[name], 'function', `#650 missing ${name}`);
  return source[name] as (...args: any[]) => any;
}

test('#650 exposes one authoritative observability contract', () => {
  assert.ok(contractModule, '#650 missing authoritative observability contract module');
  assert.equal(contractModule.OBSERVABILITY_CONTRACT?.version, 1);
  assert.equal(contractModule.OBSERVABILITY_CONTRACT?.correlationHeader, 'x-correlation-id');
  assert.equal(contractModule.OBSERVABILITY_CONTRACT?.sensitivePayloadRetention, 'forbidden');
});

test('#650 correlation survives API -> service -> repository async boundaries', async () => {
  const runWithTelemetryContext = requireFunction(contextModule, 'runWithTelemetryContext');
  const currentTelemetryContext = requireFunction(contextModule, 'currentTelemetryContext');
  const root = contextModule.createTelemetryContext({ correlationId: 'corr-650-propagation' });

  const repository = async () => {
    await Promise.resolve();
    return currentTelemetryContext();
  };
  const service = async () => repository();

  const observed = await runWithTelemetryContext(root, service);
  assert.equal(observed?.correlationId, root.correlationId);
  assert.equal(observed?.traceId, root.traceId);
  assert.equal(currentTelemetryContext(), null, 'context must not leak after request scope');
});

test('#650 recursively redacts nested secrets, DSNs and signed URLs', () => {
  const redactTelemetryValue = requireFunction(loggerModule, 'redactTelemetryValue');
  const redacted = redactTelemetryValue({
    harmless: 'ok',
    nested: {
      password: 'db-super-secret',
      connection: 'postgresql://runtime:db-super-secret@db.example.test:6543/postgres',
      signedUrl: 'https://files.example.test/report.pdf?X-Amz-Signature=signed-secret&token=url-secret',
      authorization: 'Bearer bearer-secret'
    },
    list: [{ apiKey: 'api-secret' }]
  });
  const serialized = JSON.stringify(redacted);

  assert.equal((redacted as any).harmless, 'ok');
  assert.doesNotMatch(serialized, /db-super-secret|signed-secret|url-secret|bearer-secret|api-secret/);
  assert.match(serialized, /\[REDACTED\]/);
  assert.doesNotThrow(() => JSON.parse(serialized));
});

test('#650 normalizes 4xx, dependency and unhandled errors into stable safe envelopes', () => {
  assert.ok(contractModule, '#650 missing contract module');
  const normalizeOperationalError = requireFunction(contractModule, 'normalizeOperationalError');
  const buildErrorEnvelope = requireFunction(contractModule, 'buildErrorEnvelope');

  const notFound = normalizeOperationalError(new HttpError(404, 'Documento no encontrado.', { code: 'DOCUMENT_NOT_FOUND' }));
  assert.equal(notFound.status, 404);
  assert.equal(notFound.code, 'DOCUMENT_NOT_FOUND');
  assert.equal(notFound.errorClass, 'not_found');

  const dependency = normalizeOperationalError(Object.assign(
    new Error('P1001 Cannot reach postgresql://runtime:super-secret@db.example.test/postgres'),
    { code: 'P1001' }
  ));
  assert.equal(dependency.status, 503);
  assert.equal(dependency.code, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(dependency.retryable, true);
  assert.doesNotMatch(JSON.stringify(dependency), /super-secret|postgresql:\/\//);

  const internal = normalizeOperationalError(new Error('password=super-secret internal crash'));
  assert.equal(internal.status, 500);
  assert.equal(internal.code, 'INTERNAL_ERROR');
  const envelope = buildErrorEnvelope(internal, {
    correlationId: 'corr-650-envelope',
    requestId: 'request-650-envelope'
  });
  assert.deepEqual(envelope, {
    ok: false,
    code: 'INTERNAL_ERROR',
    message: 'Error interno del servidor.',
    correlationId: 'corr-650-envelope',
    requestId: 'request-650-envelope'
  });
  assert.doesNotMatch(JSON.stringify(envelope), /super-secret|password=/);
});

test('#650 persisted job errors are bounded and never retain secret-bearing payloads', () => {
  assert.ok(contractModule, '#650 missing contract module');
  const safePersistedError = requireFunction(contractModule, 'safePersistedError');
  const value = safePersistedError(new Error(
    'provider failed: postgresql://runtime:db-password@db.example.test/postgres?token=provider-token Authorization: Bearer jwt-secret'
  ));

  assert.ok(value.length <= 320);
  assert.doesNotMatch(value, /db-password|provider-token|jwt-secret|postgresql:\/\//);
  assert.match(value, /INTERNAL_ERROR|DEPENDENCY_UNAVAILABLE/);
});
