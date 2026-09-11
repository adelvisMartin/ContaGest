import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test__ } from '../frontend/api/hipico/whatsapp-webhook.js';
import { __test__ as statusTest } from '../frontend/api/hipico/status.js';

const source=await readFile(new URL('../frontend/api/hipico/whatsapp-webhook.js',import.meta.url),'utf8');
const statusSource=await readFile(new URL('../frontend/api/hipico/status.js',import.meta.url),'utf8');
const metaSource={HIPICO_META_PHONE_NUMBER_ID:'1234567890'};

test('Meta webhook replay signature binds sender instant type body and quoted context',()=>{
  const base={
    senderId:'584121234567',
    timestamp:'2026-09-11T06:00:00.000Z',
    type:'text',
    text:'30k',
    quotedExternalMessageId:'origin-1'
  };
  const sameInstant={...base,timestamp:'2026-09-11T01:00:00-05:00'};
  assert.equal(__test__.messageReplaySignature(base),__test__.messageReplaySignature(sameInstant));
  assert.notEqual(__test__.messageReplaySignature(base),__test__.messageReplaySignature({...base,text:'300k'}));
  assert.notEqual(__test__.messageReplaySignature(base),__test__.messageReplaySignature({...base,senderId:'584129999999'}));
  assert.notEqual(__test__.messageReplaySignature(base),__test__.messageReplaySignature({...base,quotedExternalMessageId:'origin-2'}));
});

test('Meta webhook verifies the raw signature before parsing or persisting content',()=>{
  const signatureCheck=source.indexOf('verifyMetaSignature(raw');
  const jsonParse=source.indexOf("JSON.parse(raw.toString('utf8'))");
  const persistence=source.indexOf("await supabase('hipico_messages");
  assert.ok(signatureCheck>=0&&jsonParse>signatureCheck&&persistence>jsonParse);
  assert.match(source,/bodyParser:\s*false/);
});

test('Meta webhook requires strong server-side verification and app secrets',()=>{
  assert.match(source,/serverSecret\('HIPICO_META_VERIFY_TOKEN'\)/);
  assert.match(source,/serverSecret\('HIPICO_META_APP_SECRET'\)/);
  assert.doesNotMatch(source,/verifyToken=env\('HIPICO_META_VERIFY_TOKEN'\)/);
  assert.doesNotMatch(source,/appSecret=env\('HIPICO_META_APP_SECRET'\)/);
  const strong='x'.repeat(32);
  const ready=statusTest.secretReadiness({
    HIPICO_GROUP_BRIDGE_TOKEN:strong,
    HIPICO_INTERNAL_API_TOKEN:strong,
    HIPICO_META_VERIFY_TOKEN:strong,
    HIPICO_META_APP_SECRET:strong
  });
  assert.deepEqual(ready,{bridgeTokenStrong:true,internalApiTokenStrong:true,metaVerifyTokenStrong:true,metaAppSecretStrong:true});
  assert.equal(statusTest.secretReadiness({HIPICO_META_VERIFY_TOKEN:'short'}).metaVerifyTokenStrong,false);
});

test('Meta webhook rejects incomplete or foreign phone-number identity before persistence',()=>{
  const valid={
    externalMessageId:'wamid-meta-1',
    channelKey:'1234567890',
    senderId:'584121234567',
    timestamp:'2026-09-11T06:00:00.000Z',
    raw:{timestamp:'1789106400'}
  };
  assert.equal(__test__.validMetaMessageIdentity(valid,metaSource),true);
  assert.equal(__test__.validMetaMessageIdentity({...valid,externalMessageId:''},metaSource),false);
  assert.equal(__test__.validMetaMessageIdentity({...valid,channelKey:'meta'},metaSource),false);
  assert.equal(__test__.validMetaMessageIdentity({...valid,channelKey:'9999999999'},metaSource),false);
  assert.equal(__test__.validMetaMessageIdentity({...valid,senderId:'0412-1234567'},metaSource),false);
  assert.equal(__test__.validMetaMessageIdentity({...valid,raw:{}},metaSource),false);
  assert.equal(__test__.validMetaMessageIdentity({...valid,timestamp:'not-a-date'},metaSource),false);
  assert.equal(__test__.validMetaMessageIdentity(valid,{}),false);
  const identityCheck=source.indexOf('messages.some((message)=>!validMetaMessageIdentity(message,inboundIdentity))');
  const persistence=source.indexOf("await supabase('hipico_messages");
  assert.ok(identityCheck>=0&&persistence>identityCheck);
  assert.match(source,/HIPICO_META_PHONE_NUMBER_ID/);
  assert.match(source,/channelKey===expectedChannelKey/);
  assert.match(source,/status\(400\).*invalid_message_identity/);
});

test('missing or weak inbound Meta configuration fails closed and readiness reports the same dependency',()=>{
  assert.match(source,/phoneNumberId=env\('HIPICO_META_PHONE_NUMBER_ID'\)/);
  assert.match(source,/status\(503\).*webhook_not_configured/);
  assert.match(statusSource,/const webhookRequired = \['HIPICO_META_VERIFY_TOKEN', 'HIPICO_META_APP_SECRET', 'HIPICO_META_PHONE_NUMBER_ID'\]/);
  assert.match(statusSource,/secrets\.metaVerifyTokenStrong/);
  assert.match(statusSource,/secrets\.metaAppSecretStrong/);
  assert.match(statusSource,/const metaWebhookReady = persistenceReady[\s\S]*webhookMissing\.length === 0[\s\S]*secrets\.metaVerifyTokenStrong[\s\S]*secrets\.metaAppSecretStrong/);
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
  assert.match(source,/status\(409\).*replay_mismatch/);
  assert.match(source,/resolution=ignore-duplicates,return=representation/);
});

test('webhook logs only normalized error message and never raw signed payload',()=>{
  assert.match(source,/console\.error\('hipico whatsapp webhook',\{message:error\?\.message\|\|String\(error\)\}\)/);
  assert.doesNotMatch(source,/console\.error\([^\n]*payload/);
  assert.doesNotMatch(source,/console\.error\([^\n]*raw/);
});