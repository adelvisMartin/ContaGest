import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test__ } from '../frontend/api/hipico/whatsapp-webhook.js';
import { extractMetaMessages, metaTimestamp } from '../frontend/api/hipico/_shared.js';

const source=await readFile(new URL('../frontend/api/hipico/whatsapp-webhook.js',import.meta.url),'utf8');
const shared=await readFile(new URL('../frontend/api/hipico/_shared.js',import.meta.url),'utf8');

test('Meta webhook replay signature binds sender instant type body and quoted context',()=>{
  const base={senderId:'584121234567',timestamp:'2026-09-11T06:00:00.000Z',type:'text',text:'30k',quotedExternalMessageId:'origin-1'};
  const sameInstant={...base,timestamp:'2026-09-11T01:00:00-05:00'};
  assert.equal(__test__.messageReplaySignature(base),__test__.messageReplaySignature(sameInstant));
  assert.notEqual(__test__.messageReplaySignature(base),__test__.messageReplaySignature({...base,text:'300k'}));
  assert.notEqual(__test__.messageReplaySignature(base),__test__.messageReplaySignature({...base,senderId:'584129999999'}));
  assert.notEqual(__test__.messageReplaySignature(base),__test__.messageReplaySignature({...base,quotedExternalMessageId:'origin-2'}));
});

test('Meta webhook requires strong secrets and timing-safe verification token comparison',()=>{
  assert.match(source,/serverSecret\('HIPICO_META_VERIFY_TOKEN'\)/);
  assert.match(source,/safeEqual\(token, verifyToken\)/);
  assert.match(source,/serverSecret\('HIPICO_META_APP_SECRET'\)/);
  assert.doesNotMatch(source,/token\s*===\s*verifyToken/);
});

test('Meta webhook verifies the raw signature before parsing or persisting content',()=>{
  const signatureCheck=source.indexOf('verifyMetaSignature(raw');
  const jsonParse=source.indexOf("JSON.parse(raw.toString('utf8'))");
  const persistence=source.indexOf("await supabase('hipico_messages");
  assert.ok(signatureCheck>=0&&jsonParse>signatureCheck&&persistence>jsonParse);
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
});

test('Meta webhook rejects incomplete message identity before any persistence',()=>{
  const valid={externalMessageId:'wamid-meta-1',channelKey:'1234567890',senderId:'584121234567',senderLabel:'',timestamp:'2026-09-11T06:00:00.000Z',type:'text',text:'hola',quotedExternalMessageId:null,raw:{timestamp:'1789106400'}};
  assert.equal(__test__.validMetaMessageIdentity(valid),true);
  assert.equal(__test__.validMetaMessageIdentity({...valid,externalMessageId:''}),false);
  assert.equal(__test__.validMetaMessageIdentity({...valid,channelKey:'meta'}),false);
  assert.equal(__test__.validMetaMessageIdentity({...valid,senderId:'0412-1234567'}),false);
  assert.equal(__test__.validMetaMessageIdentity({...valid,raw:{}}),false);
  assert.equal(__test__.validMetaMessageIdentity({...valid,timestamp:'not-a-date'}),false);
  const identityCheck=source.indexOf('messages.some((message)=>!validMetaMessageIdentity(message))');
  const persistence=source.indexOf("await supabase('hipico_messages");
  assert.ok(identityCheck>=0&&persistence>identityCheck);
  assert.match(source,/status\(400\).*invalid_message_identity/);
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
