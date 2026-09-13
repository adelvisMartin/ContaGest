import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntimeConfig, validateRuntimeConfig } from '../src/runtime-config.mjs';

const productionEnv={
  HIPICO_RUNTIME_MODE:'production',HIPICO_BACKEND_SYNC_ENABLED:'true',
  HIPICO_INGEST_URL:'https://example.test/api/v1/hipico-bot/bridge/events',
  HIPICO_BRIDGE_HEALTH_URL:'https://example.test/api/v1/hipico-bot/bridge/health',
  HIPICO_GROUP_BRIDGE_TOKEN:'a'.repeat(64),
  HIPICO_SOURCE_GROUP_MATCHES:'CLUB HIPICO TRIPLE CROWN',
  HIPICO_SOURCE_GROUP_ID:'120363111111111111@g.us',HIPICO_SOURCE_CHANNEL_KEY:'club-hipico-triple-crown-official',
  HIPICO_LAB_GROUP_NAME:'Control hípico lab',HIPICO_LAB_GROUP_ID:'120363222222222222-2222222222@g.us',HIPICO_LAB_CHANNEL_KEY:'control-hipico-lab',
  HIPICO_TRAINING_JOURNAL_ENABLED:'true',HIPICO_REQUIRE_PINNED_GROUP_IDS:'true',HIPICO_LAB_SEND_ENABLED:'false',HIPICO_LAB_TEST_INPUT_ENABLED:'false'
};

test('production derives safe Bridge document ingress and enables automatic PDF ingestion',()=>{
  const config=loadRuntimeConfig(productionEnv,'C:/tmp');
  assert.equal(config.pdfAutoIngestEnabled,true);
  assert.equal(config.documentIngestUrl,'https://example.test/api/v1/hipico-bot/bridge/documents');
  assert.equal(config.documentBackendTimeoutMs,15000);
  assert.deepEqual(validateRuntimeConfig(config),[]);
});

test('automatic PDF ingestion can be explicitly disabled without weakening the event bridge',()=>{
  const config=loadRuntimeConfig({...productionEnv,HIPICO_PDF_AUTO_INGEST_ENABLED:'false'},'C:/tmp');
  assert.equal(config.pdfAutoIngestEnabled,false);
  assert.deepEqual(validateRuntimeConfig(config),[]);
});

test('production PDF ingress rejects non-HTTPS, credentials, query and fragments',()=>{
  for(const url of ['http://example.test/api/v1/hipico-bot/bridge/documents','https://user:pass@example.test/api/v1/hipico-bot/bridge/documents','https://example.test/api/v1/hipico-bot/bridge/documents?token=x','https://example.test/api/v1/hipico-bot/bridge/documents#x']){
    const config=loadRuntimeConfig({...productionEnv,HIPICO_DOCUMENT_INGEST_URL:url},'C:/tmp');
    assert.match(validateRuntimeConfig(config).join(' '),/HIPICO_DOCUMENT_INGEST_URL HTTPS/);
  }
});

test('shadow-local does not turn PDF automation on implicitly',()=>{
  const config=loadRuntimeConfig({HIPICO_RUNTIME_MODE:'shadow-local',HIPICO_BACKEND_SYNC_ENABLED:'false',HIPICO_SOURCE_GROUP_MATCHES:'CLUB HIPICO TRIPLE CROWN',HIPICO_SOURCE_CHANNEL_KEY:'club-hipico-triple-crown-official',HIPICO_LAB_GROUP_NAME:'Control hípico lab',HIPICO_LAB_CHANNEL_KEY:'control-hipico-lab'},'C:/tmp');
  assert.equal(config.pdfAutoIngestEnabled,false);
});
