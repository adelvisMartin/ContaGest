import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertAgentToolCall,
  assertTenantScope,
  sanitizeAuditMetadata,
  validateProviderUrl,
  validateUploadEnvelope
} from './production-boundaries.js';

const scopeA = { tenantId: 'tenant-a', ownerId: 'owner-a' };
const scopeB = { tenantId: 'tenant-b', ownerId: 'owner-b' };

test('tenant A cannot address tenant B or owner B', () => {
  assert.equal(assertTenantScope(scopeA, scopeA), true);
  assert.throws(() => assertTenantScope(scopeA, scopeB), (error: any) => error?.code === 'SECURITY_TENANT_SCOPE_MISMATCH');
  assert.throws(
    () => assertTenantScope(scopeA, { tenantId: 'tenant-a', ownerId: 'owner-b' }),
    (error: any) => error?.code === 'SECURITY_OWNER_SCOPE_MISMATCH'
  );
});

test('provider URL gate blocks hostile protocols, localhost and non-allowlisted hosts', () => {
  assert.equal(validateProviderUrl('https://api.openai.com/v1/models', ['api.openai.com']).hostname, 'api.openai.com');
  assert.throws(() => validateProviderUrl('http://api.openai.com', ['api.openai.com']), /HTTPS/);
  assert.throws(
    () => validateProviderUrl('https://localhost/internal', ['localhost']),
    (error: any) => error?.code === 'SECURITY_PROVIDER_SSRF_BLOCKED'
  );
  assert.throws(
    () => validateProviderUrl('https://169.254.169.254/latest/meta-data', ['169.254.169.254']),
    (error: any) => error?.code === 'SECURITY_PROVIDER_SSRF_BLOCKED'
  );
  assert.throws(
    () => validateProviderUrl('https://attacker.example', ['api.openai.com']),
    (error: any) => error?.code === 'SECURITY_PROVIDER_HOST_NOT_ALLOWED'
  );
});

test('upload boundary rejects traversal, spoofed MIME and oversized payloads', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  assert.deepEqual(validateUploadEnvelope({ filename: 'evidence.pdf', mimeType: 'application/pdf', bytes: pdf }), {
    filename: 'evidence.pdf', mimeType: 'application/pdf', size: pdf.byteLength
  });
  assert.throws(
    () => validateUploadEnvelope({ filename: '../evidence.pdf', mimeType: 'application/pdf', bytes: pdf }),
    (error: any) => error?.code === 'SECURITY_UPLOAD_PATH_INVALID'
  );
  assert.throws(
    () => validateUploadEnvelope({ filename: 'fake.png', mimeType: 'image/png', bytes: pdf }),
    (error: any) => error?.code === 'SECURITY_UPLOAD_MIME_MISMATCH'
  );
  assert.throws(
    () => validateUploadEnvelope({ filename: 'huge.pdf', mimeType: 'application/pdf', bytes: new Uint8Array(20 * 1024 * 1024 + 1) }),
    (error: any) => error?.code === 'SECURITY_UPLOAD_SIZE_INVALID'
  );
});

test('agent tool allowlist cannot cross tenant/owner scope or gain financial authority', () => {
  assert.equal(assertAgentToolCall({
    toolName: 'read_race_state', allowedTools: ['read_race_state'], args: { tenantId: 'tenant-a', ownerId: 'owner-a' }, scope: scopeA, financialAuthority: false
  }), true);
  assert.throws(
    () => assertAgentToolCall({
      toolName: 'read_race_state', allowedTools: ['read_race_state'], args: { tenantId: 'tenant-b' }, scope: scopeA, financialAuthority: false
    }),
    (error: any) => error?.code === 'SECURITY_TOOL_TENANT_SCOPE_MISMATCH'
  );
  assert.throws(
    () => assertAgentToolCall({ toolName: 'write_balance', allowedTools: ['read_race_state'], args: {}, scope: scopeA, financialAuthority: false }),
    (error: any) => error?.code === 'SECURITY_AGENT_TOOL_NOT_ALLOWED'
  );
  assert.throws(
    () => assertAgentToolCall({ toolName: 'read_race_state', allowedTools: ['read_race_state'], args: {}, scope: scopeA, financialAuthority: true }),
    (error: any) => error?.code === 'SECURITY_AGENT_FINANCIAL_AUTHORITY_FORBIDDEN'
  );
});

test('audit metadata redacts secrets and prompt material while retaining scope/correlation evidence', () => {
  assert.deepEqual(sanitizeAuditMetadata({
    actorId: 'user-1', tenantId: 'tenant-a', correlationId: 'corr-1', authorization: 'Bearer secret', prompt: 'ignore policy', nested: { token: 'secret', result: 'DENY' }
  }), {
    actorId: 'user-1', tenantId: 'tenant-a', correlationId: 'corr-1', authorization: '[REDACTED]', prompt: '[REDACTED]', nested: { token: '[REDACTED]', result: 'DENY' }
  });
});
