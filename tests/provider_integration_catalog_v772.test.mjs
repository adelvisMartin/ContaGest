import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCatalog, validateCatalog } from '../scripts/verify-provider-integration-catalog-v772.mjs';

const original = readCatalog();
function mutate(fn) {
  const v = structuredClone(original);
  fn(v);
  return validateCatalog(v);
}
function rejected(fn, code) {
  assert.ok(mutate(fn).some(x => x.includes(code)), 'expected reject: ' + code);
}
test('valid disabled catalog stays structurally safe and contract-bound', () => {
  assert.deepEqual(validateCatalog(original), []);
  assert.equal(original.runtimeEnabled, false);
});
test('must never enable a provider through a catalog edit', () => {
  rejected(v => { v.providers[0].enabled = true; }, 'DISABLED');
});
test('must reject cross-tenant client-controlled context', () => {
  rejected(v => { v.contract.identity.tenantFromAuthenticatedServer = false; }, 'TENANT_SECURITY');
  rejected(v => { v.contract.identity.connectionScopedToTenant = false; }, 'TENANT_SECURITY');
  rejected(v => { v.contract.webhooks.neverFromPayload = false; }, 'WEBHOOK_REPLAY_AND_TENANT');
});
test('must reject unsigned or replayable webhooks', () => {
  rejected(v => { v.contract.webhooks.signedRawBodyRequired = false; }, 'WEBHOOK_REPLAY_AND_TENANT');
  rejected(v => { v.contract.webhooks.maxClockSkewSeconds = 3600; }, 'WEBHOOK_REPLAY_AND_TENANT');
  rejected(v => { v.contract.webhooks.durableNonceOrEventId = false; }, 'WEBHOOK_REPLAY_AND_TENANT');
});
test('must reject unsafe replay of non-idempotent financial mutations', () => {
  rejected(v => { v.contract.delivery.retryNonIdempotentWithoutProviderDedupe = true; }, 'RETRY_IDEMPOTENCY');
  rejected(v => { v.contract.delivery.outboxRequiredForSideEffects = false; }, 'RETRY_IDEMPOTENCY');
  rejected(v => { v.contract.delivery.inboxDeduplication = 'memory-only'; }, 'RETRY_IDEMPOTENCY');
});
test('must reject unbounded network and redirect access', () => {
  rejected(v => { v.contract.network.requestTimeoutMs = 0; }, 'NETWORK_BOUNDS');
  rejected(v => { v.contract.network.maxResponseBytes = 500_000_000; }, 'NETWORK_BOUNDS');
  rejected(v => { v.contract.network.blockPrivateAddresses = false; }, 'NETWORK_BOUNDS');
  rejected(v => { v.contract.network.preventRedirectToUnapprovedHost = false; }, 'NETWORK_BOUNDS');
});
test('must reject duplicate provider identifiers', () => {
  rejected(v => { v.providers[1].id = v.providers[0].id; }, 'UNIQUE_ID');
});
test('must reject missing provenance or embedded URL credentials', () => {
  rejected(v => { v.providers[0].source = 'http://erp.local'; }, 'HTTPS_PROVENANCE');
  rejected(v => { v.providers[0].source = 'https://foo.example/?api_key=plaintext'; }, 'HTTPS_PROVENANCE');
  rejected(v => { v.providers[0].source = 'https://me:password@foo.example/path'; }, 'HTTPS_PROVENANCE');
});
test('must reject unverified providers activated as candidate connectors', () => {
  rejected(v => { v.providers[5].decision = 'CONSUME_EXTERNAL_API'; }, 'DOCUMENTED_API');
  rejected(v => { v.providers[5].status = 'CANDIDATE'; }, 'UNVERIFIED_MUST_FAIL_CLOSED');
});
test('must reject empty official API contracts for candidate providers', () => {
  rejected(v => { v.providers[0].documentedApi = null; }, 'DOCUMENTED_API');
});
test('must reject removal of secret redaction requirements', () => {
  rejected(v => { v.contract.observability.redact = ['authorization']; }, 'SECRET_REDACTION');
  rejected(v => { v.contract.observability.noSecretsInLogs = false; }, 'SECRET_REDACTION');
});
test('must not silently lock the core behind a paid integration', () => {
  rejected(v => { v.contract.availability.paidMandatory = true; }, 'FREE_FIRST');
  rejected(v => { v.sourceReuse = 'GPL_COPY'; }, 'SOURCE_REUSE');
});
test('must preserve API contract ownership under #565/#652', () => {
  rejected(v => { v.contract.apiContractAuthority = 'vendor'; }, 'API_CONTRACT_OWNER');
});
