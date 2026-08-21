import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWhatsAppGroupId,
  loadRuntimeConfig,
  repairUtf8Mojibake,
  validateRuntimeConfig
} from '../src/runtime-config.mjs';
import { assessRuntimeReadiness } from '../src/health-state.mjs';

const productionEnv = {
  HIPICO_RUNTIME_MODE: 'production',
  HIPICO_BACKEND_SYNC_ENABLED: 'true',
  HIPICO_INGEST_URL: 'https://example.test/api/v1/hipico-bot/bridge/events',
  HIPICO_BRIDGE_HEALTH_URL: 'https://example.test/api/v1/hipico-bot/bridge/health',
  HIPICO_GROUP_BRIDGE_TOKEN: 'a'.repeat(64),
  HIPICO_SOURCE_GROUP_MATCHES: 'CLUB HIPICO TRIPLE COWN|CLUB HIPICO TRIPLE CROWN',
  HIPICO_SOURCE_GROUP_ID: '120363111111111111-1111111111@g.us',
  HIPICO_LAB_GROUP_NAME: 'Control hípico lab',
  HIPICO_LAB_GROUP_ID: '120363222222222222-2222222222@g.us',
  HIPICO_TRAINING_JOURNAL_ENABLED: 'true',
  HIPICO_REQUIRE_PINNED_GROUP_IDS: 'true',
  HIPICO_LAB_SEND_ENABLED: 'false',
  HIPICO_LAB_TEST_INPUT_ENABLED: 'false'
};

test('mojibake repair recovers the exact LAB title', () => {
  assert.equal(repairUtf8Mojibake('Control hÃ­pico lab'), 'Control hípico lab');
});

test('WhatsApp group IDs accept only stable @g.us identifiers', () => {
  assert.equal(isWhatsAppGroupId('120363111111111111-1111111111@g.us'), true);
  assert.equal(isWhatsAppGroupId('Control hípico lab'), false);
  assert.equal(isWhatsAppGroupId('123@s.whatsapp.net'), false);
  assert.equal(isWhatsAppGroupId(''), false);
});

test('production config is strict and never accepts local-only', () => {
  const valid = loadRuntimeConfig(productionEnv, 'C:/tmp');
  assert.deepEqual(validateRuntimeConfig(valid), []);
  assert.equal(valid.diagnosticScreenshotsEnabled, false);
  assert.equal(valid.labSendEnabled, false);
  assert.equal(valid.labTestInputEnabled, false);

  const invalid = loadRuntimeConfig({
    ...productionEnv,
    HIPICO_BACKEND_SYNC_ENABLED: 'false',
    HIPICO_GROUP_BRIDGE_TOKEN: 'short'
  }, 'C:/tmp');
  assert.match(validateRuntimeConfig(invalid).join(' '), /BACKEND_SYNC_ENABLED=true/);
  assert.match(validateRuntimeConfig(invalid).join(' '), /al menos 32/);
});

test('LAB automation fails closed unless both group IDs are pinned and distinct', () => {
  const missingIds = loadRuntimeConfig({
    ...productionEnv,
    HIPICO_SOURCE_GROUP_ID: '',
    HIPICO_LAB_GROUP_ID: '',
    HIPICO_LAB_SEND_ENABLED: 'true'
  }, 'C:/tmp');
  const missingErrors = validateRuntimeConfig(missingIds).join(' ');
  assert.match(missingErrors, /SOURCE_GROUP_ID pinneado/);
  assert.match(missingErrors, /LAB_GROUP_ID pinneado/);

  const sameId = loadRuntimeConfig({
    ...productionEnv,
    HIPICO_LAB_GROUP_ID: productionEnv.HIPICO_SOURCE_GROUP_ID,
    HIPICO_LAB_SEND_ENABLED: 'true'
  }, 'C:/tmp');
  assert.match(validateRuntimeConfig(sameId).join(' '), /deben ser distintos/);

  const unsafeBypass = loadRuntimeConfig({
    ...productionEnv,
    HIPICO_REQUIRE_PINNED_GROUP_IDS: 'false'
  }, 'C:/tmp');
  assert.match(validateRuntimeConfig(unsafeBypass).join(' '), /REQUIRE_PINNED_GROUP_IDS=true/);
});

test('readiness requires source, cloud and empty durable queues', () => {
  const ready = assessRuntimeReadiness({
    runtimeMode: 'production',
    backendState: 'online',
    activeSourceTitle: 'CLUB HIPICO TRIPLE CROWN',
    sourceMatches: ['CLUB HIPICO TRIPLE CROWN']
  });
  assert.equal(ready.ready, true);
  const degraded = assessRuntimeReadiness({
    runtimeMode: 'production',
    backendState: 'online',
    activeSourceTitle: 'CLUB HIPICO TRIPLE CROWN',
    sourceMatches: ['CLUB HIPICO TRIPLE CROWN'],
    mirrorSpool: 2
  });
  assert.equal(degraded.ready, false);
  assert.ok(degraded.reasons.includes('LAB_MIRROR_PENDING'));
});
