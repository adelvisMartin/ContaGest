import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test__ } from '../frontend/api/hipico/whatsapp-webhook.js';

const source=await readFile(new URL('../frontend/api/hipico/whatsapp-webhook.js',import.meta.url),'utf8');

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

test('Meta webhook rejects incomplete message identity before any persistence',()=>{
  const valid={
    externalMessageId:'wamid-meta-1',
    channelKey:'1234567890',
    senderId:'584121234567',
    timestamp:'2026-09-11T06:00:00.000Z',
    raw:{timestamp:'1789106400'}
  };
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
