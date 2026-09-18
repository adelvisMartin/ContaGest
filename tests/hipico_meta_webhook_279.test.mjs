import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractMetaMessages, metaTimestamp } from '../frontend/api/hipico/_shared.js';
import { isMetaPhoneNumberId, metaWebhookConfig, strongMetaSecretConfigured } from '../frontend/api/hipico/meta-runtime.js';

const source=await readFile(new URL('../frontend/api/hipico/whatsapp-webhook.js',import.meta.url),'utf8');
const shared=await readFile(new URL('../frontend/api/hipico/_shared.js',import.meta.url),'utf8');
const backend=await readFile(new URL('../backend/src/modules/hipico-bot/hipico-webhook.routes.ts',import.meta.url),'utf8');
const runtimeSource=await readFile(new URL('../frontend/api/hipico/meta-runtime.js',import.meta.url),'utf8');
const strong='s'.repeat(40);
const runtimeEnv={HIPICO_META_VERIFY_TOKEN:'v'.repeat(40),HIPICO_META_APP_SECRET:'a'.repeat(40),HIPICO_META_PHONE_NUMBER_ID:'1234567890'};

test('Meta serverless runtime requires strong non-placeholder secrets and a numeric phone id',()=>{
  assert.equal(metaWebhookConfig(runtimeEnv).ready,true);
  assert.equal(metaWebhookConfig({...runtimeEnv,HIPICO_META_VERIFY_TOKEN:'short'}).ready,false);
  assert.equal(metaWebhookConfig({...runtimeEnv,HIPICO_META_APP_SECRET:'CHANGE_ME_CHANGE_ME_CHANGE_ME_CHANGE_ME'}).ready,false);
  assert.equal(metaWebhookConfig({...runtimeEnv,HIPICO_META_PHONE_NUMBER_ID:'phone-id'}).ready,false);
  assert.equal(strongMetaSecretConfigured(strong),true);
  assert.equal(strongMetaSecretConfigured('CHANGE_ME_CHANGE_ME_CHANGE_ME_CHANGE_ME'),false);
  assert.equal(isMetaPhoneNumberId('1234567890'),true);
  assert.equal(isMetaPhoneNumberId('phone-id'),false);
  assert.match(runtimeSource,/PUBLIC_PLACEHOLDER_PATTERN/);
});

test('Meta timestamp extraction remains fail-closed for malformed provider values',()=>{
  assert.equal(metaTimestamp('1789106400'),'2026-09-11T06:00:00.000Z');
  assert.equal(metaTimestamp('not-a-number'),null);
  assert.equal(metaTimestamp('1e999'),null);
  assert.equal(metaTimestamp('-1'),null);
  assert.equal(metaTimestamp(null),null);
  const payload={entry:[{changes:[{value:{metadata:{phone_number_id:'1234567890'},messages:[{id:'wamid-1',from:'584121234567',timestamp:'not-a-number',type:'text',text:{body:'hola'}}]}}]}]};
  const [message]=extractMetaMessages(payload);
  assert.equal(message.timestamp,null);
  assert.match(shared,/timestamp:\s*metaTimestamp\(message\?\.timestamp\)/);
});

test('Meta extraction preserves external identities for canonical backend validation',()=>{
  const payload={entry:[{changes:[{value:{metadata:{phone_number_id:'1234567890'},contacts:[{wa_id:'584121234567',profile:{name:'Participante'}}],messages:[{id:'wamid-meta-1',from:'584121234567',timestamp:'1789106400',type:'text',text:{body:'hola'},context:{id:'origin-1'}}]}}]}]};
  const [message]=extractMetaMessages(payload);
  assert.equal(message.channelKey,'1234567890');
  assert.equal(message.externalMessageId,'wamid-meta-1');
  assert.equal(message.senderId,'584121234567');
  assert.equal(message.text,'hola');
  assert.equal(message.quotedExternalMessageId,'origin-1');
});

test('serverless Meta endpoint is transport-only: raw signature verification precedes canonical delegation',()=>{
  const configCheck=source.indexOf('metaWebhookConfig()');
  const rawRead=source.indexOf('readRawBody(req)');
  const signature=source.indexOf('verifyMetaSignature(raw');
  const proxy=source.indexOf('proxyCanonicalRequest({');
  const relay=source.indexOf('return relayCanonicalResponse');
  assert.ok(configCheck>=0&&rawRead>configCheck&&signature>rawRead&&proxy>signature&&relay>proxy);
  assert.match(source,/bodyParser:\s*false/);
  assert.match(source,/path:'\/api\/v1\/hipico-bot\/webhook'/);
  assert.match(source,/'x-hub-signature-256':signature/);
  assert.doesNotMatch(source,/\bsupabase\s*\(|persistMetaMessage|adapterCaptureDecision|validMetaMessageIdentity/);
});

test('canonical backend owns Meta identity partitioning, replay and persistence semantics',()=>{
  assert.match(backend,/rawEnvelopeIdentityError/);
  assert.match(backend,/webhookTimestampValid/);
  assert.match(backend,/processMessagesBounded/);
  assert.match(backend,/assertPersistedWebhookReplay/);
  assert.match(backend,/webhook_replay_mismatch/);
  assert.match(backend,/invalid_webhook_items_partial/);
  assert.match(backend,/webhook_processing_failed/);
});

test('oversized/malformed serverless requests fail closed before canonical delegation',()=>{
  assert.match(source,/request_body_too_large/);
  assert.match(source,/status\(413\)/);
  assert.match(source,/request_body_invalid/);
  assert.match(source,/status\(400\)/);
  assert.match(source,/retryable:false/);
});

test('serverless webhook logging excludes raw signed payload and request body',()=>{
  assert.match(source,/console\.error\('hipico whatsapp webhook canonical proxy'/);
  assert.doesNotMatch(source,/console\.error\([^\n]*raw/);
  assert.doesNotMatch(source,/console\.error\([^\n]*payload/);
});
