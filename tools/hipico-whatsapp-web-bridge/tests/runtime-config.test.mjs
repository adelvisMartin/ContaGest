import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntimeConfig, repairUtf8Mojibake, validateRuntimeConfig } from '../src/runtime-config.mjs';
import { assessRuntimeReadiness } from '../src/health-state.mjs';

const productionEnv = {
  HIPICO_RUNTIME_MODE: 'production',
  HIPICO_BACKEND_SYNC_ENABLED: 'true',
  HIPICO_INGEST_URL: 'https://example.test/api/v1/hipico-bot/bridge/events',
  HIPICO_BRIDGE_HEALTH_URL: 'https://example.test/api/v1/hipico-bot/bridge/health',
  HIPICO_GROUP_BRIDGE_TOKEN: 'a'.repeat(64),
  HIPICO_SOURCE_GROUP_MATCHES: 'CLUB HIPICO TRIPLE COWN|CLUB HIPICO TRIPLE CROWN',
  HIPICO_LAB_GROUP_NAME: 'Control hípico lab',
  HIPICO_TRAINING_JOURNAL_ENABLED: 'true'
};

test('mojibake repair recovers the exact LAB title', () => {
  assert.equal(repairUtf8Mojibake('Control hÃ­pico lab'), 'Control hípico lab');
});

test('production config is strict and never accepts local-only', () => {
  const valid = loadRuntimeConfig(productionEnv, 'C:/tmp');
  assert.deepEqual(validateRuntimeConfig(valid), []);
  assert.equal(valid.diagnosticScreenshotsEnabled, false);
  const invalid = loadRuntimeConfig({ ...productionEnv, HIPICO_BACKEND_SYNC_ENABLED: 'false', HIPICO_GROUP_BRIDGE_TOKEN: 'short' }, 'C:/tmp');
  assert.match(validateRuntimeConfig(invalid).join(' '), /BACKEND_SYNC_ENABLED=true/);
  assert.match(validateRuntimeConfig(invalid).join(' '), /al menos 32/);
});

test('readiness requires source, cloud and empty durable queues', () => {
  const ready = assessRuntimeReadiness({ runtimeMode: 'production', backendState: 'online', activeSourceTitle: 'CLUB HIPICO TRIPLE CROWN', sourceMatches: ['CLUB HIPICO TRIPLE CROWN'] });
  assert.equal(ready.ready, true);
  const degraded = assessRuntimeReadiness({ runtimeMode: 'production', backendState: 'online', activeSourceTitle: 'CLUB HIPICO TRIPLE CROWN', sourceMatches: ['CLUB HIPICO TRIPLE CROWN'], mirrorSpool: 2 });
  assert.equal(degraded.ready, false);
  assert.ok(degraded.reasons.includes('LAB_MIRROR_PENDING'));
});
