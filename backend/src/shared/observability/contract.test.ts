import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as contextModule from './context.js';
import * as redactionModule from './redaction.js';

const contractModule = await import('./contract.js').catch(() => null as any);

function requireFunction(source: any, name: string) {
  assert.equal(typeof source?.[name], 'function', `#650 missing ${name}`);
  return source[name] as (...args: any[]) => any;
}

test('#650 exposes one authoritative observability contract', () => {
  assert.ok(contractModule, '#650 missing authoritative observability contract module');
  assert.equal(contractModule.OBSERVABILITY_CONTRACT?.version, 1);
  assert.equal(contractModule.OBSERVABILITY_CONTRACT?.errorEnvelopeVersion, 2);
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
  const redactTelemetryValue = requireFunction(redactionModule, 'redactTelemetryValue');
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

test('#979 redaction protects personal identifiers in free text and URL query without damaging safe metadata', () => {
  const actual = redactionModule.redactTelemetryValue({
    description: 'Cliente ana.qa@example.test no encontrado; https://app.example.test/report?email=ana.qa%40example.test&phone=04121234567&rif=J12345678&mode=summary&page=2',
    nested: ['Comunicación desde bob+ops@example.test']
  });
  const serialized = JSON.stringify(actual);
  assert.doesNotMatch(serialized, /ana\.qa|bob\+ops|04121234567|J12345678|%40example\.test/);
  assert.match(serialized, /\[REDACTED_EMAIL\]/);
  assert.match(serialized, /email=\[REDACTED\]|email=\[REDACTED_EMAIL\]/);
  assert.match(serialized, /phone=\[REDACTED\]/);
  assert.match(serialized, /rif=\[REDACTED\]/);
  assert.match(serialized, /mode=summary&page=2/);
});

test('#650 normalizes 4xx, dependency and unhandled errors into stable safe envelopes', () => {
  assert.ok(contractModule, '#650 missing contract module');
  const normalizeOperationalError = requireFunction(contractModule, 'normalizeOperationalError');
  const buildErrorEnvelope = requireFunction(contractModule, 'buildErrorEnvelope');

  const notFound = normalizeOperationalError(Object.assign(
    new Error('Documento no encontrado.'),
    { status: 404, details: { code: 'DOCUMENT_NOT_FOUND' } }
  ));
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
  // The canonical envelope is Problem Details v2 with legacy safe aliases.
  assert.deepEqual(envelope, {
    ok: false,
    type: 'urn:contagest:problem:internal_error',
    title: 'Error interno del servidor',
    status: 500,
    detail: 'Error interno del servidor.',
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

test('#979 structured telemetry masks credential containers and private keys without changing safe details', () => {
  const redactTelemetryValue = requireFunction(redactionModule, 'redactTelemetryValue');
  const payload = {
    action: 'sync-completed',
    credentials: { username: 'should-never-appear', password: 'should-not-appear' },
    privateKey: ['-----BEGIN', ' PRIVATE KEY-----', ' sensitive'].join(''),
    clientCredential: 'oauth-credential-secret',
    nested: [{ signing_private_key: 'signing-sentinel', message: 'privacy-sensitive', state: 'safe status' }]
  };
  const actual = redactTelemetryValue(payload) as Record<string, any>;
  assert.equal(actual.action, 'sync-completed');
  assert.equal(actual.credentials, '[REDACTED]');
  assert.equal(actual.privateKey, '[REDACTED]');
  assert.equal(actual.clientCredential, '[REDACTED]');
  assert.equal(actual.nested[0].signing_private_key, '[REDACTED]');
  assert.equal(actual.nested[0].message, '[REDACTED]');
  assert.equal(actual.nested[0].state, 'safe status');
  const serialized = JSON.stringify(actual);
  assert.doesNotMatch(serialized, /should-never-appear|should-not-appear|BEGIN PRIVATE KEY|oauth-credential-secret|signing-sentinel|privacy-sensitive/);
});
