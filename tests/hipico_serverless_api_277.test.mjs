import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bearerTokenValid, isE164, metaDestinationAllowed, metaOutboundPolicy, safeEqual, safeTimeoutMs, strongSecretConfigured } from '../frontend/api/hipico/_shared.js';
import { canonicalBackendOrigin, buildCanonicalUrl } from '../frontend/api/hipico/canonical-backend.js';
import { isWhatsAppGroupId } from '../frontend/api/hipico/bridge-identity.js';
import { __test__ as ingestTest, validateGroupBridgeBody } from '../frontend/api/hipico/group-bridge-ingest.js';
import { __test__ as statusTest } from '../frontend/api/hipico/status.js';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const shared=read('../frontend/api/hipico/_shared.js');
const bridgeIdentity=read('../frontend/api/hipico/bridge-identity.js');
const ingest=read('../frontend/api/hipico/group-bridge-ingest.js');
const sender=read('../frontend/api/hipico/whatsapp-send.js');
const status=read('../frontend/api/hipico/status.js');
const legacyBridge=read('../tools/hipico-whatsapp-bridge/src/index.mjs');
const SOURCE_JID='120363111111111111@g.us';
const LAB_JID='120363222222222222-2222222222@g.us';

test('serverless auth helpers compare secrets safely and validate real E.164 bounds',()=>{
  assert.equal(safeEqual('abc','abc'),true);
  assert.equal(safeEqual('abc','abd'),false);
  assert.equal(safeEqual('',''),false);
  assert.equal(bearerTokenValid('Bearer 123456','123456'),true);
  assert.equal(bearerTokenValid('Basic 123456','123456'),false);
  assert.equal(isE164('+584121234567'),true);
  assert.equal(isE164('0412-1234567'),false);
  assert.equal(isE164(`+${'1'.repeat(15)}`),true);
  assert.equal(isE164(`+${'1'.repeat(16)}`),false);
});

test('serverless secrets reject weak and placeholder values',()=>{
  assert.equal(strongSecretConfigured('x'.repeat(31)),false);
  assert.equal(strongSecretConfigured('x'.repeat(32)),true);
  assert.equal(strongSecretConfigured('CHANGE_ME_CHANGE_ME_CHANGE_ME_CHANGE_ME'),false);
  assert.match(ingest,/serverSecret\('HIPICO_GROUP_BRIDGE_TOKEN'\)/);
  assert.match(sender,/serverSecret\('HIPICO_INTERNAL_API_TOKEN'\)/);
  assert.match(shared,/serverSecret\('HIPICO_SUPABASE_SERVICE_ROLE_KEY'\)/);
});

test('serverless timeouts stay bounded',()=>{
  assert.equal(safeTimeoutMs(undefined),10000);
  assert.equal(safeTimeoutMs(0),10000);
  assert.equal(safeTimeoutMs(2500),2500);
  assert.equal(safeTimeoutMs(9999999),60000);
});

test('serverless outbound stays disabled unless compliance, approval, SHA and allowlist all match',()=>{
  const sha='a'.repeat(40);
  const enabled={HIPICO_META_SEND_ENABLED:'true',HIPICO_WHATSAPP_COMPLIANCE_DECISION:'GO',HIPICO_META_SEND_APPROVED_BY:'release-owner',HIPICO_META_SEND_CANDIDATE_SHA:sha,VERCEL_GIT_COMMIT_SHA:sha,HIPICO_META_ALLOWED_DESTINATIONS:'+584121234567'};
  assert.equal(metaOutboundPolicy({}).enabled,false);
  assert.equal(metaOutboundPolicy(enabled).enabled,true);
  assert.equal(metaDestinationAllowed('+584121234567',enabled),true);
  assert.equal(metaDestinationAllowed('+584121234568',enabled),false);
});

test('canonical serverless bridge identity accepts modern and legacy WhatsApp group JIDs only',()=>{
  assert.equal(isWhatsAppGroupId(SOURCE_JID),true);
  assert.equal(isWhatsAppGroupId(LAB_JID),true);
  assert.equal(isWhatsAppGroupId('12345@g.us'),false);
  assert.equal(isWhatsAppGroupId('584121234567@c.us'),false);
});

test('group bridge validates transport boundary before canonical delegation',()=>{
  const base={groupId:SOURCE_JID,externalMessageId:'wamid-1',groupName:'Grupo fuente',channelRole:'source',shadowMode:true,senderId:'584121234567',senderLabel:'Participante',fromMe:false,hasMedia:false,historySync:false,timestamp:'2026-09-11T06:00:00.000Z',type:'chat',text:'Juego 1N del 5 con 100k',quotedExternalMessageId:'wamid-origin'};
  const env={HIPICO_SOURCE_GROUP_ID:SOURCE_JID,HIPICO_LAB_GROUP_ID:LAB_JID};
  assert.equal(validateGroupBridgeBody(base,env),null);
  assert.equal(validateGroupBridgeBody({...base,fromMe:'false'},env),'invalid_boolean_field');
  assert.equal(validateGroupBridgeBody({...base,timestamp:'not-a-date'},env),'invalid_timestamp');
  assert.equal(validateGroupBridgeBody({...base,groupId:LAB_JID},env),'source_group_not_authorized');
  assert.equal(validateGroupBridgeBody({...base,shadowMode:false},env),'source_requires_shadow_mode');
});

test('omitted bridge role remains canonical source and produces pinned canonical event',()=>{
  const body={groupId:SOURCE_JID,externalMessageId:'wamid-default-source',shadowMode:true,senderId:'584121234567',timestamp:'2026-09-11T06:00:00.000Z',type:'chat',text:'Juego 1N del 5 con 100k'};
  const env={HIPICO_SOURCE_GROUP_ID:SOURCE_JID,HIPICO_LAB_GROUP_ID:LAB_JID};
  assert.equal(validateGroupBridgeBody(body,env),null);
  assert.equal(ingestTest.normalizedChannelRole(body),'source');
  const event=ingestTest.canonicalBridgeEvent(body,env);
  assert.equal(event.channelRole,'source');
  assert.equal(event.channelKey,'control-hipico-source-official');
  assert.equal(event.labChannelKey,'control-hipico-lab');
  assert.equal(event.shadowMode,true);
  assert.equal(event.historySync,false);
});

test('serverless bridge is transport-only and never owns business classification or persistence',()=>{
  assert.match(ingest,/proxyCanonicalRequest/);
  assert.match(ingest,/\/api\/v1\/hipico-bot\/bridge\/events/);
  assert.doesNotMatch(ingest,/classifyText/);
  assert.doesNotMatch(ingest,/supabase\(/);
  assert.doesNotMatch(ingest,/hipico_messages/);
  assert.doesNotMatch(shared,/export function classifyText/);
});

test('transport replay signature binds behavior-changing immutable fields',()=>{
  const base={senderId:'584121234567',timestamp:'2026-09-11T01:00:00-05:00',type:'chat',text:'30k',quotedExternalMessageId:'source-1',fromMe:false,hasMedia:false,historySync:false};
  const same={...base,timestamp:'2026-09-11T06:00:00.000Z'};
  assert.equal(ingestTest.sourceReplaySignature(base),ingestTest.sourceReplaySignature(same));
  assert.notEqual(ingestTest.sourceReplaySignature(base),ingestTest.sourceReplaySignature({...base,text:'300k'}));
  assert.notEqual(ingestTest.sourceReplaySignature(base),ingestTest.sourceReplaySignature({...base,historySync:true}));
});

test('canonical backend adapter cannot recurse into the frontend deployment',()=>{
  assert.equal(canonicalBackendOrigin({VERCEL_ENV:'production',VERCEL_URL:'frontend.vercel.app'}),'');
  const source={VERCEL_ENV:'production',HIPICO_CANONICAL_API_BASE_URL:'https://backend.example.com'};
  assert.equal(canonicalBackendOrigin(source),'https://backend.example.com');
  assert.equal(buildCanonicalUrl('/api/v1/hipico-bot/bridge/events',source),'https://backend.example.com/api/v1/hipico-bot/bridge/events');
  assert.throws(()=>buildCanonicalUrl('/api/v1/auth/login',source),/HIPICO_CANONICAL_PATH_NOT_ALLOWED/);
});

test('outbound Meta sender retains production policy and durable transitions',()=>{
  assert.match(sender,/metaOutboundPolicy/);
  assert.match(sender,/metaDestinationAllowed/);
  assert.match(sender,/serverSecret\('HIPICO_INTERNAL_API_TOKEN'\)/);
  assert.match(sender,/status:\s*'sending'/);
  assert.match(sender,/status=in\.\(queued,retry\)/);
  assert.doesNotMatch(sender,/status=in\.\(queued,retry,sending\)/);
  assert.match(sender,/RECONCILIATION_REQUIRED:AMBIGUOUS_TRANSPORT_FAILURE/);
});

test('status separates linked-device, individual sender and canonical backend webhook readiness',()=>{
  assert.match(status,/linkedDeviceBridge/);
  assert.match(status,/shadowOnly:\s*true/);
  assert.match(status,/sourceSendPossible:\s*false/);
  assert.match(status,/webhookAuthority:\s*'canonical_backend'/);
  assert.match(status,/WHATSAPP_VERIFY_TOKEN/);
  assert.match(status,/WHATSAPP_APP_SECRET/);
  assert.match(status,/persistenceServiceKeyStrong/);
  const ready=statusTest.bridgeIdentityStatus({HIPICO_SOURCE_GROUP_ID:SOURCE_JID,HIPICO_LAB_GROUP_ID:LAB_JID});
  assert.equal(ready.ready,true);
});

test('legacy linked-device fallback remains shadow-only and never sends to source',()=>{
  assert.match(legacyBridge,/Legacy Hípico bridge is shadow-only/);
  assert.match(legacyBridge,/await client\.sendMessage\(lab\.id, labText\)/);
  assert.doesNotMatch(legacyBridge,/client\.sendMessage\(source\.id/);
  assert.match(legacyBridge,/shadowMode:\s*true/);
});
