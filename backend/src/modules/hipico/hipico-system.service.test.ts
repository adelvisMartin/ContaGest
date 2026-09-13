import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHipicoSystemStatus, hipicoReadinessFromStatus } from './hipico-system.service.js';

const strong = 'x'.repeat(48);
const source = {
  HIPICO_GROUP_BRIDGE_TOKEN: strong,
  HIPICO_SOURCE_GROUP_ID: '120363111111111111@g.us',
  HIPICO_LAB_GROUP_ID: '120363222222222222@g.us',
  HIPICO_DOCUMENT_OCR_ENABLED: 'true',
  HIPICO_BRIDGE_PROTOCOL_VERSION: '1'
};

void test('canonical system status reports only executed/injected capability and keeps provider non-financial', async () => {
  const status = await buildHipicoSystemStatus({
    source,
    readinessCheck: async () => ({ ready: true, configuration: 'ok', database: 'ok' }),
    providerStatus: () => ({
      provider: 'sportradar-uof',
      configured: true,
      enrichmentOnly: true,
      financialAuthority: false,
      cacheTtlMs: 30_000,
      timeoutMs: 5_000,
      reason: null
    }),
    documentCapability: () => ({ configured: true, nativeText: true, ocr: true, parserVersion: 'fixture', reason: null }),
    now: () => new Date('2026-09-12T18:00:00.000Z')
  });

  assert.equal(status.ok, true);
  assert.equal(status.timestamp, '2026-09-12T18:00:00.000Z');
  assert.equal(status.components.backend.state, 'ready');
  assert.equal(status.components.database.state, 'ready');
  assert.equal(status.components.bridge.state, 'ready');
  assert.equal(status.components.channel.state, 'ready');
  assert.equal(status.components.providers.state, 'ready');
  assert.equal(status.components.providers.financialAuthority, false);
  assert.equal(status.components.documentEngine.state, 'ready');
  assert.equal(status.components.agent.state, 'ready');
  assert.deepEqual(hipicoReadinessFromStatus(status).checks, { backend: 'ready', database: 'ready' });
});

void test('canonical system status fails closed for unavailable database and missing operational capabilities', async () => {
  const status = await buildHipicoSystemStatus({
    source: {},
    readinessCheck: async () => ({ ready: false, configuration: 'ok', database: 'failed' }),
    providerStatus: () => ({
      provider: 'disabled',
      configured: false,
      enrichmentOnly: true,
      financialAuthority: false,
      cacheTtlMs: 30_000,
      timeoutMs: 5_000,
      reason: 'HIPICO_RACE_PROVIDER_DISABLED'
    }),
    documentCapability: () => ({ configured: false, nativeText: false, ocr: false, parserVersion: null, reason: 'POPPLER_NOT_INSTALLED' }),
    now: () => new Date('2026-09-12T18:01:00.000Z')
  });

  assert.equal(status.ok, false);
  assert.equal(status.components.database.state, 'unavailable');
  assert.equal(status.components.bridge.state, 'not_configured');
  assert.equal(status.components.channel.state, 'not_configured');
  assert.equal(status.components.providers.state, 'not_configured');
  assert.equal(status.components.documentEngine.state, 'not_configured');
  assert.equal(hipicoReadinessFromStatus(status).ready, false);
});

void test('requested OCR without OCR runtime is explicit degraded state, never a silent pass', async () => {
  const status = await buildHipicoSystemStatus({
    source,
    readinessCheck: async () => ({ ready: true, configuration: 'ok', database: 'ok' }),
    providerStatus: () => ({
      provider: 'disabled', configured: false, enrichmentOnly: true, financialAuthority: false,
      cacheTtlMs: 30_000, timeoutMs: 5_000, reason: 'HIPICO_RACE_PROVIDER_DISABLED'
    }),
    documentCapability: () => ({ configured: true, nativeText: true, ocr: false, parserVersion: 'fixture', reason: 'OCR_RUNTIME_NOT_INSTALLED' })
  });
  assert.equal(status.components.documentEngine.state, 'degraded');
  assert.equal(status.components.documentEngine.reason, 'OCR_RUNTIME_NOT_INSTALLED');
});
