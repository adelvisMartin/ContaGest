import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYWRIGHT_WEB_TRANSPORT,
  CLOUD_API_TRANSPORT,
  resolveTransportCapabilities
} from '../src/transport-capabilities.mjs';
import {
  SOURCE_AUTO_REPLY_POLICY_NO_GO,
  SOURCE_POLICY_SNAPSHOT,
  evaluateSourceAutoReplyPolicy
} from '../src/source-policy-gate.mjs';
import { loadRuntimeConfig, validateRuntimeConfig, VERSION } from '../src/runtime-config.mjs';

const pinned = {
  HIPICO_RUNTIME_MODE: 'production',
  HIPICO_BACKEND_SYNC_ENABLED: 'true',
  HIPICO_INGEST_URL: 'https://example.test/api/v1/hipico-bot/bridge/events',
  HIPICO_BRIDGE_HEALTH_URL: 'https://example.test/api/v1/hipico-bot/bridge/health',
  HIPICO_GROUP_BRIDGE_TOKEN: 'a'.repeat(64),
  HIPICO_SOURCE_GROUP_ID: '120363111111111111@g.us',
  HIPICO_LAB_GROUP_ID: '120363222222222222-2222222222@g.us',
  HIPICO_TRAINING_JOURNAL_ENABLED: 'true',
  HIPICO_REQUIRE_PINNED_GROUP_IDS: 'true'
};

test('v1.6 exposes an explicit transport capability contract', () => {
  assert.equal(VERSION, '1.6.0');
  assert.equal(PLAYWRIGHT_WEB_TRANSPORT.id, 'playwright-web');
  assert.equal(PLAYWRIGHT_WEB_TRANSPORT.official, false);
  assert.equal(PLAYWRIGHT_WEB_TRANSPORT.implemented, true);
  assert.equal(PLAYWRIGHT_WEB_TRANSPORT.sourceRead, true);
  assert.equal(PLAYWRIGHT_WEB_TRANSPORT.labSend, true);
  assert.equal(PLAYWRIGHT_WEB_TRANSPORT.groupSend, true);
  assert.equal(CLOUD_API_TRANSPORT.id, 'cloud-api');
  assert.equal(CLOUD_API_TRANSPORT.official, true);
  assert.equal(CLOUD_API_TRANSPORT.implemented, false);
  assert.equal(resolveTransportCapabilities('unknown').implemented, false);
});

test('current official WhatsApp Business policy keeps real-money SOURCE automation fail-closed', () => {
  const config = loadRuntimeConfig({ ...pinned, HIPICO_SOURCE_AUTO_REPLY_ENABLED: 'true' }, 'C:/tmp');
  const policy = evaluateSourceAutoReplyPolicy(config);
  assert.equal(policy.status, 'NO_GO');
  assert.equal(policy.eligible, false);
  assert.equal(policy.policyCode, SOURCE_AUTO_REPLY_POLICY_NO_GO);
  assert.equal(policy.snapshot, SOURCE_POLICY_SNAPSHOT);
  assert.ok(policy.reasons.includes('REAL_MONEY_GAMBLING_PROHIBITED_BY_WHATSAPP_BUSINESS_POLICY'));
  assert.ok(policy.reasons.includes('UNOFFICIAL_TRANSPORT'));
  assert.match(validateRuntimeConfig(config).join(' '), /SOURCE_AUTO_REPLY_POLICY_NO_GO/);
});

test('no environment evidence can convert the current policy snapshot into GO', () => {
  const config = loadRuntimeConfig({
    ...pinned,
    HIPICO_SOURCE_AUTO_REPLY_ENABLED: 'true',
    HIPICO_TRANSPORT_ADAPTER: 'cloud-api',
    HIPICO_SOURCE_POLICY_REVIEW_ID: 'review-2026-09-29',
    HIPICO_SOURCE_LICENSE_EVIDENCE_REF: 'license://local-review',
    HIPICO_META_PERMISSION_EVIDENCE_REF: 'meta://permission-review',
    HIPICO_SOURCE_AGE_GATE_CONFIRMED: 'true'
  }, 'C:/tmp');
  const policy = evaluateSourceAutoReplyPolicy(config);
  assert.equal(policy.eligible, false);
  assert.ok(policy.reasons.includes('REAL_MONEY_GAMBLING_PROHIBITED_BY_WHATSAPP_BUSINESS_POLICY'));
  assert.ok(policy.reasons.includes('TRANSPORT_NOT_IMPLEMENTED'));
});

test('LAB autonomous capability remains available independently of SOURCE policy', () => {
  const config = loadRuntimeConfig({
    ...pinned,
    HIPICO_LAB_SEND_ENABLED: 'true',
    HIPICO_LAB_TEST_INPUT_ENABLED: 'true',
    HIPICO_SOURCE_AUTO_REPLY_ENABLED: 'false'
  }, 'C:/tmp');
  assert.deepEqual(validateRuntimeConfig(config), []);
  const capabilities = resolveTransportCapabilities(config.transportAdapter);
  assert.equal(capabilities.labSend, true);
  const policy = evaluateSourceAutoReplyPolicy(config, capabilities);
  assert.equal(policy.requested, false);
  assert.equal(policy.status, 'DISABLED');
});

test('unsupported transport adapter fails validation instead of silently falling back', () => {
  const config = loadRuntimeConfig({ ...pinned, HIPICO_TRANSPORT_ADAPTER: 'mystery-adapter' }, 'C:/tmp');
  assert.match(validateRuntimeConfig(config).join(' '), /HIPICO_TRANSPORT_ADAPTER/);
});
