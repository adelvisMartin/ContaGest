import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test__ } from '../frontend/api/hipico/whatsapp-webhook.js';
import { extractMetaMessages, metaTimestamp } from '../frontend/api/hipico/_shared.js';
import { isMetaPhoneNumberId, metaWebhookConfig, strongMetaSecretConfigured } from '../frontend/api/hipico/meta-runtime.js';

const source=await readFile(new URL('../frontend/api/hipico/whatsapp-webhook.js',import.meta.url),'utf8');
const shared=await readFile(new URL('../frontend/api/hipico/_shared.js',import.meta.url),'utf8');
const runtimeSource=await readFile(new URL('../frontend/api/hipico/meta-runtime.js',import.meta.url),'utf8');
const strong='s'.repeat(40);
const runtimeEnv={HIPICO_META_VERIFY_TOKEN:'v'.repeat(40),HIPICO_META_APP_SECRET:'a'.repeat(40),HIPICO_META_PHONE_NUMBER_ID:'1234567890'};
const handlerSource=source.slice(source.indexOf('export default async function handler'));

function statusEnvelope(phoneNumberId='1234567890'){
  return{entry:[{changes:[{value:{metadata:{phone_number_id:phoneNumberId},statuses:[{id:'wamid-status-1',status:'delivered'}]}}]}]};
}

test('Meta webhook replay signature binds sender instant type body and quoted context',()=>{
  const base={senderId:'584121234567',timestamp:'2026-09-11T06:00:00.000Z',type:'text',text:'30k',quotedExternalMessageId:'origin-1'};
  const sameInstant={...base,timestamp:'2026-09-11T01:00:00-05:00'};
  assert.equal(__test__.messageReplaySignature(base),__test__.messageReplaySignature(sameInstant));
  assert.notEqual(__test__.messageReplaySignature(base),__test__.messageReplaySignature({...base,text:'300k'}));
  assert.notEqual(__test__.messageReplaySignature(base),__test__.messageReplaySignature({...base,senderId:'584129999999'}));
  assert.notEqual(__test__.messageReplaySignature(base),__test__.messageReplaySignature({...base,quotedExternalMessageId:'origin-2'}));
});

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

test('Meta webhook verifies raw signature and signed envelope identity before extraction or persistence',()=>{
  const configCheck=handlerSource.indexOf('metaWebhookConfig()');
  const signatureCheck=handlerSource.indexOf('verifyMetaSignature(raw');
  const jsonParse=handlerSource.indexOf("JSON.parse(raw.toString('utf8'))");
  const envelopeIdentity=handlerSource.indexOf('rawMetaEnvelopeIdentityError(payload,runtime.phoneNumberId)');
  const extraction=handlerSource.indexOf('extractMetaMessages(payload)');
  const persistence=handlerSource.indexOf('await persistMetaMessage(ownerId,message)');
  assert.ok(configCheck>=0&&signatureCheck>configCheck&&jsonParse>signatureCheck&&envelopeIdentity>jsonParse&&extraction>envelopeIdentity&&persistence>extraction);
  assert.match(source,/bodyParser:\s*false/);
});

test('Meta timestamp parser never throws and invalid signed timestamps fail identity validation',()=>{
  assert.equal(metaTimestamp('1789106400'),'2026-09-11T06:00:00.000Z');
  assert.equal(metaTimestamp('not-a-number'),null);
  assert.equal(metaTimestamp('1e999'),null);
  assert.equal(metaTimestamp('-1'),null);
  assert.equal(metaTimestamp(null),null);
  const payload={entry:[{changes:[{value:{metadata:{phone_number_id:'1234567890'},messages:[{id:'wamid-1',from:'584121234567',timestamp:'not-a-number',type:'text',text:{body:'hola'}}]}}]}]};
  const [message]=extractMetaMessages(payload);
  assert.equal(message.timestamp,null);
  assert.equal(__test__.validMetaMessageIdentity(message),false);
  assert.match(shared,/timestamp:\s*metaTimestamp\(message\?\.timestamp\)/);
});

test('Meta extraction preserves external identities and boundary validation rejects oversized fields',()=>{
  const long='x'.repeat(5000);
  const payload={entry:[{changes:[{value:{metadata:{phone_number_id:long},contacts:[{wa_id:'584121234567',profile:{name:long}}],messages:[{id:long,from:'584121234567',timestamp:'1789106400',type:long,text:{body:long},context:{id:long}}]}}]}]};
  const [message]=extractMetaMessages(payload);
  assert.equal(message.channelKey,long);
  assert.equal(message.externalMessageId,long);
  assert.equal(message.senderLabel,long);
  assert.equal(message.type,long);
  assert.equal(message.text,long);
  assert.equal(message.quotedExternalMessageId,long);
  assert.equal(__test__.validMetaMessageIdentity(message),false);
  const base={externalMessageId:'wamid-meta-1',channelKey:'1234567890',senderId:'584121234567',senderLabel:'Participante',timestamp:'2026-09-11T06:00:00.000Z',type:'text',text:'hola',quotedExternalMessageId:null,raw:{timestamp:'1789106400'}};
  assert.equal(__test__.validMetaMessageIdentity({...base,senderLabel:'x'.repeat(221)}),false);
  assert.equal(__test__.validMetaMessageIdentity({...base,type:'x'.repeat(81)}),false);
  assert.equal(__test__.validMetaMessageIdentity({...base,text:'x'.repeat(4001)}),false);
  assert.equal(__test__.validMetaMessageIdentity({...base,quotedExternalMessageId:'x'.repeat(321)}),false);
  assert.equal(__test__.validMetaMessageIdentity({...base,channelKey:'meta'}),false);
});

test('Meta webhook partitions malformed message identities instead of dropping valid signed siblings',()=>{
  const valid={externalMessageId:'wamid-meta-1',channelKey:'1234567890',senderId:'584121234567',senderLabel:'',timestamp:'2026-09-11T06:00:00.000Z',type:'text',text:'hola',quotedExternalMessageId:null,raw:{timestamp:'1789106400'}};
  assert.equal(__test__.validMetaMessageIdentity(valid),true);
  assert.equal(__test__.validMetaMessageIdentity({...valid,externalMessageId:''}),false);
  assert.equal(__test__.validMetaMessageIdentity({...valid,channelKey:'phone-id'}),false);
  assert.equal(__test__.validMetaMessageIdentity({...valid,senderId:'0412-1234567'}),false);
  assert.equal(__test__.validMetaMessageIdentity({...valid,raw:{}}),false);
  assert.equal(__test__.validMetaMessageIdentity({...valid,timestamp:'not-a-date'}),false);
  const partition=handlerSource.indexOf('const validMessages=messages.filter((message)=>validMetaMessageIdentity(message))');
  const invalidCount=handlerSource.indexOf('const invalidMessages=messages.length-validMessages.length');
  const phoneBinding=handlerSource.indexOf('validMessages.some((message)=>String(message.channelKey)!==runtime.phoneNumberId)');
  const persistence=handlerSource.indexOf('await persistMetaMessage(ownerId,message)');
  const partialAck=handlerSource.indexOf("error:'invalid_message_identity_partial'");
  assert.ok(partition>=0&&invalidCount>partition&&phoneBinding>invalidCount&&persistence>phoneBinding&&partialAck>persistence);
  assert.match(source,/accepted:true,\n\s*partial:true,\n\s*retryable:false/);
  assert.match(source,/for \(const message of validMessages\)/);
  assert.doesNotMatch(source,/messages\.some\(\(message\)=>!validMetaMessageIdentity\(message\)\)/);
});

test('fully malformed or foreign phone identity is permanently transport-acknowledged',()=>{
  assert.match(source,/error:'invalid_message_identity'/);
  assert.match(source,/error:'webhook_phone_number_mismatch'/);
  assert.match(source,/status\(200\).*accepted:false/s);
});

test('signed status-only callbacks are bound to raw Meta phone identity before persistence bypass',()=>{
  assert.equal(__test__.rawMetaEnvelopeIdentityError(statusEnvelope(),'1234567890'),null);
  assert.equal(__test__.rawMetaEnvelopeIdentityError(statusEnvelope('9999999999'),'1234567890'),'META_PHONE_NUMBER_MISMATCH');
  assert.equal(__test__.rawMetaEnvelopeIdentityError({entry:[{changes:[{value:{statuses:[{id:'s1'}]}}]}]},'1234567890'),'META_PHONE_NUMBER_MISMATCH');
  const envelope=handlerSource.indexOf('rawMetaEnvelopeIdentityError(payload,runtime.phoneNumberId)');
  const empty=handlerSource.indexOf('if(validMessages.length===0)');
  const owner=handlerSource.indexOf("const ownerId = String(process.env.HIPICO_OWNER_ID");
  assert.ok(envelope>=0&&empty>envelope&&owner>empty);
});

test('oversized and malformed requests are rejected without being treated as retryable server faults',()=>{
  assert.match(source,/request_body_too_large/);
  assert.match(source,/status\(413\)/);
  assert.match(source,/status\(400\).*invalid_json/);
  assert.match(source,/retryable:false/);
});

test('duplicate Meta message id is compared with first persisted source instead of silently rewritten',()=>{
  assert.match(source,/assertDuplicateMetaReplay/);
  assert.match(source,/persistedReplaySignature\(existing\)!==messageReplaySignature\(message\)/);
  assert.match(source,/HIPICO_META_REPLAY_MISMATCH/);
  assert.match(source,/status\(200\).*replay_mismatch/s);
  assert.match(source,/acknowledged:true,accepted:false,retryable:false/);
  assert.match(source,/resolution=ignore-duplicates,return=representation/);
});

test('serverless adapter capture remains evidence-only and non-authoritative',()=>{
  const capture=__test__.adapterCaptureDecision('Juega 1N al 3 con 30k');
  assert.equal(capture.domainAuthority,'backend_canonical_only');
  assert.equal(capture.storedClassification,'unclassified');
  assert.equal(capture.storedConfidence,0);
  assert.equal(capture.processingStatus,'review');
  assert.equal(capture.adapterHint.classification,'offer');
  assert.match(source,/adapter_hint_authoritative:\s*false/);
  assert.match(source,/domainAuthority:'backend_canonical_only'/);
});

test('webhook logs only normalized error message and never raw signed payload',()=>{
  assert.match(source,/console\.error\('hipico whatsapp webhook',\{message:error\?\.message\|\|String\(error\)\}\)/);
  assert.doesNotMatch(source,/console\.error\([^\n]*payload/);
  assert.doesNotMatch(source,/console\.error\([^\n]*raw/);
});
