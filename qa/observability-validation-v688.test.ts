import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { normalizeOperationalError, buildErrorEnvelope, structuredErrorFields }
  from '../backend/src/shared/observability/contract.js';

const CONTEXT = { requestId: 'req-688', correlationId: 'corr-688', instance: '/api/v1/clients' };

function render(error: unknown) {
  const normalized = normalizeOperationalError(error);
  return { normalized, publicBody: buildErrorEnvelope(normalized, CONTEXT) };
}

test('#688 Zod errors always map to 422 / validation and redact field-level messages', () => {
  const result = z.object({ password: z.string().min(30), email: z.string().email() })
    .safeParse({ password: 'FAKE_SENSITIVE_PASSWORD_688', email: 'invalid' });
  assert.equal(result.success, false);
  if (result.success) throw new Error('DRIFT_TEST_EXPECTED_ZOD_ERROR');
  const { normalized, publicBody } = render(result.error);
  assert.equal(normalized.status, 422);
  assert.equal(normalized.errorClass, 'validation');
  assert.equal(publicBody.status, 422);
  assert.equal(publicBody.code, 'VALIDATION_ERROR');
  assert.equal(publicBody.detail, 'La solicitud contiene datos inválidos.');
  assert.equal(publicBody.type, 'urn:contagest:problem:validation_error');
  assert.equal(publicBody.correlationId, 'corr-688');
  assert.equal(publicBody.requestId, 'req-688');
  assert.equal(publicBody.ok, false);
  assert.ok(Array.isArray(publicBody.details), 'safe validation details should exist');
  assert.equal(publicBody.details.length >= 1, true);
  assert.ok(!JSON.stringify(publicBody).includes('FAKE_SENSITIVE_PASSWORD_688'));
  for (const issue of publicBody.details as Array<Record<string, unknown>>) {
    assert.equal(issue.message, '[REDACTED]', 'raw Zod error messages cannot be disclosed');
  }
});

test('#688 explicit business conflict retains 409 and redacts credentials in details and message', () => {
  const error = Object.assign(new Error('Conflicto: password=FAKE_SECRET_688'), {
    status: 409, details: { resource: 'client', password: 'FAKE_SECRET_688', token: 'FAKE_SECRET_688' }
  });
  const { normalized, publicBody } = render(error);
  assert.equal(normalized.status, 409);
  assert.equal(publicBody.status, 409);
  assert.equal(publicBody.code, 'CONFLICT');
  assert.equal(publicBody.type, 'urn:contagest:problem:conflict');
  assert.equal((publicBody.details as Record<string,string>).password, '[REDACTED]');
  assert.equal((publicBody.details as Record<string,string>).token, '[REDACTED]');
  assert.ok(!JSON.stringify(publicBody).includes('FAKE_SECRET_688'));
  assert.equal(publicBody.message, publicBody.detail, 'compatibility alias must match v2 detail');
});

test('#688 database provider error cannot leak connection string, credentials or private details', () => {
  const error = Object.assign(
    new Error('postgresql://private:FAKE_DB_PASSWORD_688@database.private/erp connection refused'),
    { code: 'P1001', details: { password: 'FAKE_DB_PASSWORD_688', server: 'database.private' } }
  );
  const { normalized, publicBody } = render(error);
  assert.equal(normalized.status, 503);
  assert.equal(normalized.errorClass, 'dependency');
  assert.equal(normalized.retryable, true);
  assert.equal(publicBody.status, 503);
  assert.equal(publicBody.code, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(publicBody.type, 'urn:contagest:problem:dependency_unavailable');
  assert.equal('details' in publicBody, false);
  assert.ok(!JSON.stringify(publicBody).includes('database.private'));
  assert.ok(!JSON.stringify(publicBody).includes('FAKE_DB_PASSWORD_688'));
  const structured = structuredErrorFields(normalized);
  assert.equal(structured.status, 503);
  assert.equal(structured.errorCode, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(JSON.stringify(structured).includes('FAKE_DB_PASSWORD_688'), false);
});

test('#688 unexpected server faults remain 500 and never expose stack or details', () => {
  const fault = Object.assign(new Error('private: FAKE_INTERNAL_STACK_688'), {
    status: 200, details: { stack: 'FAKE_INTERNAL_STACK_688' }
  });
  const { normalized, publicBody } = render(fault);
  assert.equal(normalized.status, 500);
  assert.equal(publicBody.status, 500);
  assert.equal(publicBody.detail, 'Error interno del servidor.');
  assert.equal('details' in publicBody, false);
  assert.equal(JSON.stringify(publicBody).includes('FAKE_INTERNAL_STACK_688'), false);
});
