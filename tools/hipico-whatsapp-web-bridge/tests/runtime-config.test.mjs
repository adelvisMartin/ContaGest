import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isWhatsAppGroupId,
  loadRuntimeConfig,
  repairUtf8Mojibake,
  strongBridgeTokenConfigured,
  validateRuntimeConfig
} from '../src/runtime-config.mjs';
import { assessRuntimeReadiness } from '../src/health-state.mjs';

const runtimeConfigSource=readFileSync(new URL('../src/runtime-config.mjs',import.meta.url),'utf8');
const productionEnv = {
  HIPICO_RUNTIME_MODE: 'production',
  HIPICO_BACKEND_SYNC_ENABLED: 'true',
  HIPICO_INGEST_URL: 'https://example.test/api/v1/hipico-bot/bridge/events',
  HIPICO_BRIDGE_HEALTH_URL: 'https://example.test/api/v1/hipico-bot/bridge/health',
  HIPICO_GROUP_BRIDGE_TOKEN: 'a'.repeat(64),
  HIPICO_SOURCE_GROUP_MATCHES: 'CLUB HIPICO TRIPLE COWN|CLUB HIPICO TRIPLE CROWN',
  HIPICO_SOURCE_GROUP_ID: '120363111111111111@g.us',
  HIPICO_SOURCE_CHANNEL_KEY: 'club-hipico-triple-crown-official',
  HIPICO_LAB_GROUP_NAME: 'Control hípico lab',
  HIPICO_LAB_GROUP_ID: '120363222222222222-2222222222@g.us',
  HIPICO_LAB_CHANNEL_KEY: 'control-hipico-lab',
  HIPICO_TRAINING_JOURNAL_ENABLED: 'true',
  HIPICO_REQUIRE_PINNED_GROUP_IDS: 'true',
  HIPICO_SOURCE_AUTO_REPLY_ENABLED: 'false',
  HIPICO_LAB_SEND_ENABLED: 'false',
  HIPICO_LAB_TEST_INPUT_ENABLED: 'false'
};

test('mojibake repair recovers the exact LAB title', () => {
  assert.equal(repairUtf8Mojibake('Control hÃ­pico lab'), 'Control hípico lab');
});

test('WhatsApp group IDs use the canonical modern or legacy JID contract', () => {
  assert.equal(isWhatsAppGroupId('120363111111111111@g.us'), true);
  assert.equal(isWhatsAppGroupId('120363111111111111-1111111111@g.us'), true);
  assert.equal(isWhatsAppGroupId('12345-67890@g.us'), true);
  assert.equal(isWhatsAppGroupId('12345@g.us'), false);
  assert.equal(isWhatsAppGroupId('Control hípico lab'), false);
  assert.equal(isWhatsAppGroupId('123@s.whatsapp.net'), false);
  assert.equal(isWhatsAppGroupId('1234@g.us'), false);
  assert.equal(isWhatsAppGroupId(''), false);
  assert.match(runtimeConfigSource,/import \{ normalizeGroupId \} from '\.\/group-identity\.mjs'/);
  assert.doesNotMatch(runtimeConfigSource,/\^\\d\{5,\}\(\?:-\\d\+\)\?@g/);
});

test('production bridge token rejects public placeholders even when long enough',()=>{
  assert.equal(strongBridgeTokenConfigured('a'.repeat(32)),true);
  assert.equal(strongBridgeTokenConfigured('a'.repeat(31)),false);
  assert.equal(strongBridgeTokenConfigured('REEMPLAZA_CON_SECRETO_ALEATORIO_32_CHARS_MINIMO'),false);
  assert.equal(strongBridgeTokenConfigured('CHANGE_ME_WITH_A_SECRET_THAT_IS_LONG_ENOUGH_123456'),false);
  const placeholder=loadRuntimeConfig({...productionEnv,HIPICO_GROUP_BRIDGE_TOKEN:'REEMPLAZA_CON_SECRETO_ALEATORIO_32_CHARS_MINIMO'},'C:/tmp');
  assert.match(validateRuntimeConfig(placeholder).join(' '),/no-placeholder/);
});

test('linked-device runtime defaults process-created local evidence to private POSIX permissions',()=>{
  assert.match(runtimeConfigSource,/process\.umask\(0o077\)/);
});

test('production config is strict, pinned and never accepts local-only', () => {
  const valid = loadRuntimeConfig(productionEnv, 'C:/tmp');
  assert.deepEqual(validateRuntimeConfig(valid), []);
  assert.equal(valid.diagnosticScreenshotsEnabled, false);
  assert.equal(valid.sourceAutoReplyEnabled, false);
  assert.equal(valid.labSendEnabled, false);
  assert.equal(valid.labTestInputEnabled, false);

  const invalid = loadRuntimeConfig({
    ...productionEnv,
    HIPICO_BACKEND_SYNC_ENABLED: 'false',
    HIPICO_GROUP_BRIDGE_TOKEN: 'short',
    HIPICO_SOURCE_GROUP_ID: '',
    HIPICO_LAB_GROUP_ID: ''
  }, 'C:/tmp');
  const errors=validateRuntimeConfig(invalid).join(' ');
  assert.match(errors, /BACKEND_SYNC_ENABLED=true/);
  assert.match(errors, /al menos 32/);
  assert.match(errors, /Producción exige HIPICO_SOURCE_GROUP_ID pinneado/);
  assert.match(errors, /Producción exige HIPICO_LAB_GROUP_ID pinneado/);
});

test('production endpoints reject credentials, query strings and fragments', () => {
  for(const value of [
    'https://user:pass@example.test/api/v1/hipico-bot/bridge/events',
    'https://example.test/api/v1/hipico-bot/bridge/events?token=x',
    'https://example.test/api/v1/hipico-bot/bridge/events#fragment',
    'http://example.test/api/v1/hipico-bot/bridge/events'
  ]){
    const config=loadRuntimeConfig({...productionEnv,HIPICO_INGEST_URL:value},'C:/tmp');
    assert.match(validateRuntimeConfig(config).join(' '),/HIPICO_INGEST_URL HTTPS/);
  }
});

test('SOURCE/LAB channel identities must remain distinct and canonical',()=>{
  const sameKey=loadRuntimeConfig({...productionEnv,HIPICO_LAB_CHANNEL_KEY:productionEnv.HIPICO_SOURCE_CHANNEL_KEY},'C:/tmp');
  assert.match(validateRuntimeConfig(sameKey).join(' '),/channel keys distintos/);
  const invalidKey=loadRuntimeConfig({...productionEnv,HIPICO_SOURCE_CHANNEL_KEY:'bad key'},'C:/tmp');
  assert.match(validateRuntimeConfig(invalidKey).join(' '),/SOURCE_CHANNEL_KEY no es válido/);
  const weakModernId=loadRuntimeConfig({...productionEnv,HIPICO_SOURCE_GROUP_ID:'12345@g.us'},'C:/tmp');
  assert.match(validateRuntimeConfig(weakModernId).join(' '),/SOURCE_GROUP_ID no tiene formato/);
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


test('SOURCE auto reply is production-only, backend-bound and requires the exact pinned source group',()=>{
  const enabled=loadRuntimeConfig({...productionEnv,HIPICO_SOURCE_AUTO_REPLY_ENABLED:'true'},'C:/tmp');
  assert.deepEqual(validateRuntimeConfig(enabled),[]);
  assert.equal(enabled.sourceAutoReplyEnabled,true);

  const local=loadRuntimeConfig({...productionEnv,HIPICO_RUNTIME_MODE:'shadow-local',HIPICO_SOURCE_AUTO_REPLY_ENABLED:'true'},'C:/tmp');
  assert.match(validateRuntimeConfig(local).join(' '),/solo se admite en production/);

  const noBackend=loadRuntimeConfig({...productionEnv,HIPICO_SOURCE_AUTO_REPLY_ENABLED:'true',HIPICO_BACKEND_SYNC_ENABLED:'false'},'C:/tmp');
  assert.match(validateRuntimeConfig(noBackend).join(' '),/backend sync autoritativo/);

  const noSourceId=loadRuntimeConfig({...productionEnv,HIPICO_SOURCE_AUTO_REPLY_ENABLED:'true',HIPICO_SOURCE_GROUP_ID:''},'C:/tmp');
  assert.match(validateRuntimeConfig(noSourceId).join(' '),/Auto reply SOURCE exige HIPICO_SOURCE_GROUP_ID pinneado/);
});
