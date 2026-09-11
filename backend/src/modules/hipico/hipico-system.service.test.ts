import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHipicoSystemStatus, hipicoReadinessFromStatus } from './hipico-system.service.js';

const providerDisabled = () => ({
  provider: 'disabled' as const,
  configured: false,
  enrichmentOnly: true as const,
  financialAuthority: false as const,
  reason: 'RACE_PROVIDER_DISABLED',
  timeoutMs: 5000,
  cacheTtlMs: 30000
});

void test('system status does not expose secrets and reports unavailable integrations explicitly', async () => {
  const status = await buildHipicoSystemStatus({
    source: {
      HIPICO_GROUP_BRIDGE_TOKEN: 'x'.repeat(40),
      HIPICO_SOURCE_GROUP_ID: '120363111111111111@g.us',
      HIPICO_LAB_GROUP_ID: '120363222222222222@g.us',
      HIPICO_SPORTRADAR_UOF_TOKEN: 'do-not-expose'
    },
    readinessCheck: async () => ({ ready: true, configuration: 'ok', database: 'ok' }),
    providerStatus: providerDisabled,
    documentCapability: () => ({ configured: false, nativeText: false, ocr: false, parserVersion: null, reason: 'PDFJS_NOT_INSTALLED' }),
    now: () => new Date('2026-09-11T19:00:00.000Z')
  });

  assert.equal(status.ok, true);
  assert.equal(status.components.bridge.state, 'ready');
  assert.equal(status.components.channel.state, 'ready');
  assert.equal(status.components.providers.financialAuthority, false);
  assert.equal(status.components.documentEngine.state, 'not_configured');
  assert.equal(status.components.agent.state, 'not_configured');
  assert.equal(JSON.stringify(status).includes('do-not-expose'), false);
  assert.equal(hipicoReadinessFromStatus(status).ready, true);
});

void test('document engine reports ready for native parsing and degraded only when requested OCR is missing', async () => {
  const common = {
    readinessCheck: async () => ({ ready: true, configuration: 'ok' as const, database: 'ok' as const }),
    providerStatus: providerDisabled
  };
  const native = await buildHipicoSystemStatus({
    ...common,
    source: {},
    documentCapability: () => ({ configured: true, nativeText: true, ocr: false, parserVersion: 'fixture', reason: null })
  });
  assert.equal(native.components.documentEngine.state, 'ready');

  const requestedOcr = await buildHipicoSystemStatus({
    ...common,
    source: { HIPICO_DOCUMENT_OCR_ENABLED: 'true' },
    documentCapability: () => ({ configured: true, nativeText: true, ocr: false, parserVersion: 'fixture', reason: 'OCR_DEPENDENCY_NOT_INSTALLED' })
  });
  assert.equal(requestedOcr.components.documentEngine.state, 'degraded');
});

void test('database failure makes canonical readiness fail closed', async () => {
  const status = await buildHipicoSystemStatus({
    source: {},
    readinessCheck: async () => ({ ready: false, configuration: 'ok', database: 'failed' }),
    providerStatus: providerDisabled,
    documentCapability: () => ({ configured: false, nativeText: false, ocr: false, parserVersion: null, reason: 'PDFJS_NOT_INSTALLED' })
  });

  assert.equal(status.ok, false);
  assert.equal(status.components.database.state, 'unavailable');
  assert.equal(hipicoReadinessFromStatus(status).ready, false);
});
