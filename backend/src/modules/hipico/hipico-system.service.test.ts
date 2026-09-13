import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHipicoSystemStatus, hipicoReadinessFromStatus } from './hipico-system.service.js';

const disabledProvider = () => ({
  provider: 'disabled' as const,
  configured: false,
  enrichmentOnly: true as const,
  financialAuthority: false as const,
  reason: 'RACE_PROVIDER_DISABLED',
  timeoutMs: 5000,
  cacheTtlMs: 30000
});

void test('system status exposes no secrets and never invents integration readiness', async () => {
  const status = await buildHipicoSystemStatus({
    source: {
      HIPICO_GROUP_BRIDGE_TOKEN: 'x'.repeat(40),
      HIPICO_SOURCE_GROUP_ID: '120363111111111111@g.us',
      HIPICO_LAB_GROUP_ID: '120363222222222222@g.us',
      HIPICO_SPORTRADAR_UOF_TOKEN: 'do-not-expose'
    },
    readinessCheck: async () => ({ ready: true, configuration: 'ok', database: 'ok' }),
    providerStatus: disabledProvider,
    now: () => new Date('2026-09-12T12:00:00.000Z')
  });

  assert.equal(status.ok, true);
  assert.equal(status.components.backend.state, 'ready');
  assert.equal(status.components.database.state, 'ready');
  assert.equal(status.components.bridge.state, 'degraded');
  assert.equal(status.components.bridge.reason, 'BRIDGE_CONFIGURED_NOT_PROBED');
  assert.equal(status.components.channel.state, 'degraded');
  assert.equal(status.components.providers.state, 'not_configured');
  assert.equal(status.components.providers.financialAuthority, false);
  assert.equal(status.components.documentEngine.state, 'not_configured');
  assert.equal(status.components.agent.state, 'not_configured');
  assert.equal(JSON.stringify(status).includes('do-not-expose'), false);
  assert.equal(JSON.stringify(status).includes('x'.repeat(40)), false);
  assert.equal(hipicoReadinessFromStatus(status).ready, true);
});

void test('database failure makes canonical readiness fail closed', async () => {
  const status = await buildHipicoSystemStatus({
    source: {},
    readinessCheck: async () => ({ ready: false, configuration: 'ok', database: 'failed' }),
    providerStatus: disabledProvider
  });

  assert.equal(status.ok, false);
  assert.equal(status.components.database.state, 'unavailable');
  assert.equal(status.components.bridge.state, 'not_configured');
  assert.equal(status.components.channel.state, 'not_configured');
  assert.equal(hipicoReadinessFromStatus(status).ready, false);
});
