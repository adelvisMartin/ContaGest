import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bearerTokenValid, isE164, metaDestinationAllowed, metaOutboundPolicy, safeEqual, safeTimeoutMs, strongSecretConfigured } from '../frontend/api/hipico/_shared.js';
import { isWhatsAppGroupId } from '../frontend/api/hipico/bridge-identity.js';
import { __test__ as ingestTest, validateGroupBridgeBody } from '../frontend/api/hipico/group-bridge-ingest.js';
import { __test__ as statusTest } from '../frontend/api/hipico/status.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const shared = read('../frontend/api/hipico/_shared.js');
const bridgeIdentity = read('../frontend/api/hipico/bridge-identity.js');
const ingest = read('../frontend/api/hipico/group-bridge-ingest.js');
const sender = read('../frontend/api/hipico/whatsapp-send.js');
const status = read('../frontend/api/hipico/status.js');
const legacyBridge = read('../tools/hipico-whatsapp-bridge/src/index.mjs');
const SOURCE_JID='120363111111111111@g.us';
const LAB_JID='120363222222222222-2222222222@g.us';

test('serverless auth helpers compare secrets safely and validate real E.164 bounds', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('', ''), false);
  assert.equal(bearerTokenValid('Bearer 123456', '123456'), true);
  assert.equal(bearerTokenValid('Basic 123456', '123456'), false);
  assert.equal(isE164('+584121234567'), true);
  assert.equal(isE164('0412-1234567'), false);
  assert.equal(isE164(`+${'1'.repeat(15)}`), true);
  assert.equal(isE164(`+${'1'.repeat(16)}`), false);
});

test('serverless internal bridge and sender secrets require at least 32 bytes', () => {
  assert.equal(strongSecretConfigured('x'.repeat(31)), false);
  assert.equal(strongSecretConfigured('x'.repeat(32)), true);
  assert.equal(strongSecretConfigured('  ' + 'x'.repeat(32) + '  '), true);
  assert.match(ingest, /serverSecret\('HIPICO_GROUP_BRIDGE_TOKEN'\)/);
  assert.match(sender, /serverSecret\('HIPICO_INTERNAL_API_TOKEN'\)/);
  assert.doesNotMatch(ingest, /configuredToken\s*=\s*env\('HIPICO_GROUP_BRIDGE_TOKEN'\)/);
  assert.doesNotMatch(sender, /expected\s*=\s*env\('HIPICO_INTERNAL_API_TOKEN'\)/);
});

test('serverless timeouts fail to bounded defaults instead of accepting NaN, zero or unbounded values', () => {
  assert.equal(safeTimeoutMs(undefined), 10000);
  assert.equal(safeTimeoutMs(Number.NaN), 10000);
  assert.equal(safeTimeoutMs(0), 10000);
  assert.equal(safeTimeoutMs(-1), 10000);
  assert.equal(safeTimeoutMs(2500), 2500);
  assert.equal(safeTimeoutMs(9999999), 60000);
});

test('serverless outbound stays disabled unless compliance, approval, SHA and allowlist all match', () => {
  const sha = 'a'.repeat(40);
  const enabled = {
    HIPICO_META_SEND_ENABLED: 'true',
    HIPICO_WHATSAPP_COMPLIANCE_DECISION: 'GO',
    HIPICO_META_SEND_APPROVED_BY: 'release-owner',
    HIPICO_META_SEND_CANDIDATE_SHA: sha,
    VERCEL_GIT_COMMIT_SHA: sha,
    HIPICO_META_ALLOWED_DESTINATIONS: '+584121234567'
  };
  assert.equal(metaOutboundPolicy({}).enabled, false);
  assert.equal(metaOutboundPolicy(enabled).enabled, true);
  assert.equal(metaDestinationAllowed('+584121234567', enabled), true);
  assert.equal(metaDestinationAllowed('+584121234568', enabled), false);
  assert.equal(metaOutboundPolicy({ ...enabled, VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40) }).enabled, false);
});

test('Supabase helper uses bounded fetch and does not echo upstream bodies into thrown errors', () => {
  assert.match(shared, /fetchWithTimeout/);
  assert.match(shared, /safeTimeoutMs/);
  assert.match(shared, /HIPICO_SUPABASE_TIMEOUT_MS/);
  assert.doesNotMatch(shared, /text\.slice\(0,\s*500\)/);
});

test('canonical serverless bridge identity accepts modern and legacy WhatsApp group JIDs only',()=>{
  assert.equal(isWhatsAppGroupId(SOURCE_JID),true);
  assert.equal(isWhatsAppGroupId(LAB_JID),true);
  assert.equal(isWhatsAppGroupId('12345@g.us'),false);
  assert.equal(isWhatsAppGroupId('1234-5678@g.us'),false);
  assert.equal(isWhatsAppGroupId('source-gid'),false);
  assert.equal(isWhatsAppGroupId('584121234567@c.us'),false);
});

test('group bridge validates types, timestamps, quoted ids and pinned source before persistence', () => {
  const base = {
    groupId: SOURCE_JID,
    externalMessageId: 'wamid-1',
    groupName: 'Grupo fuente',
    channelRole: 'source',
    shadowMode: true,
    senderId: '584121234567',
    senderLabel: 'Participante',
    fromMe: false,
    hasMedia: false,
    timestamp: '2026-09-11T06:00:00.000Z',
    type: 'chat',
    text: 'Juego 1N del 5 con 100k',
    quotedExternalMessageId: 'wamid-origin'
  };
  const env = { HIPICO_SOURCE_GROUP_ID: SOURCE_JID, HIPICO_LAB_GROUP_ID: LAB_JID };
  assert.equal(validateGroupBridgeBody(base, env), null);
  assert.equal(validateGroupBridgeBody({ ...base, fromMe: 'false' }, env), 'invalid_boolean_field');
  assert.equal(validateGroupBridgeBody({ ...base, timestamp: 'not-a-date' }, env), 'invalid_timestamp');
  assert.equal(validateGroupBridgeBody({ ...base, quotedExternalMessageId: 'x'.repeat(321) }, env), 'invalid_quoted_message_id');
  assert.equal(validateGroupBridgeBody({ ...base, groupId: LAB_JID }, env), 'source_group_not_authorized');
  assert.equal(validateGroupBridgeBody({ ...base, groupId: 'not-a-group' }, env), 'invalid_group_id');
  assert.equal(validateGroupBridgeBody({ ...base, shadowMode: false }, env), 'source_requires_shadow_mode');
});

test('omitted group bridge role is canonical source across validation, persistence and lab shadow flow', () => {
  const body = {
    groupId: SOURCE_JID,
    externalMessageId: 'wamid-default-source',
    shadowMode: true,
    senderId: '584121234567',
    timestamp: '2026-09-11T06:00:00.000Z',
    type: 'chat',
    text: 'Juego 1N del 5 con 100k'
  };
  const env = { HIPICO_SOURCE_GROUP_ID: SOURCE_JID, HIPICO_LAB_GROUP_ID: LAB_JID };
  assert.equal(validateGroupBridgeBody(body, env), null);
  assert.equal(ingestTest.normalizedChannelRole(body), 'source');
  assert.equal(ingestTest.normalizedChannelRole({ ...body, channelRole: 'lab' }), 'lab');
  assert.match(ingest, /channel_role:\s*channelRole/);
  assert.match(ingest, /labSimulation:\s*!duplicate\s*&&\s*channelRole === 'source'/);
  assert.doesNotMatch(ingest, /body\.channelRole === 'source'/);
});

test('serverless bridge identity is mandatory and client channel aliases cannot split the canonical source', () => {
  const base = {
    groupId: SOURCE_JID, externalMessageId: 'wamid-1', groupName: 'Grupo fuente', channelRole: 'source', shadowMode: true,
    senderId: '584121234567', timestamp: '2026-09-11T06:00:00.000Z', type: 'chat', text: 'hola'
  };
  assert.equal(validateGroupBridgeBody(base, {}), 'source_group_not_configured');
  assert.equal(validateGroupBridgeBody({ ...base, channelKey: 'otro-canal' }, { HIPICO_SOURCE_GROUP_ID: SOURCE_JID, HIPICO_LAB_GROUP_ID: LAB_JID }), 'source_channel_not_authorized');
  assert.equal(validateGroupBridgeBody({ ...base, channelRole: 'lab', groupId: LAB_JID }, { HIPICO_SOURCE_GROUP_ID: SOURCE_JID }), 'lab_group_not_configured');
  assert.equal(validateGroupBridgeBody(base, { HIPICO_SOURCE_GROUP_ID:'source-gid',HIPICO_LAB_GROUP_ID:LAB_JID }), 'source_group_invalid');
  assert.deepEqual(ingestTest.configuredChannelIdentity('source', { HIPICO_SOURCE_GROUP_ID: SOURCE_JID, HIPICO_LAB_GROUP_ID: LAB_JID }), {
    role: 'source', groupId: SOURCE_JID, channelKey: 'club-hipico-triple-crown-official'
  });
});

test('persisted serverless channels cannot be reactivated or repurposed by incoming traffic', () => {
  const identity={role:'source',groupId:SOURCE_JID,channelKey:'club-hipico-triple-crown-official'};
  const valid={id:'c1',status:'active',channel_type:'web_bridge',config:{channel_role:'source'}};
  assert.equal(ingestTest.assertPersistedChannel(valid,identity,SOURCE_JID).id,'c1');
  assert.throws(()=>ingestTest.assertPersistedChannel({...valid,status:'blocked'},identity,SOURCE_JID),(error)=>error?.code==='HIPICO_SERVERLESS_CHANNEL_DISABLED');
  assert.throws(()=>ingestTest.assertPersistedChannel({...valid,channel_type:'manual_export'},identity,SOURCE_JID),(error)=>error?.code==='HIPICO_SERVERLESS_CHANNEL_TYPE_MISMATCH');
  assert.throws(()=>ingestTest.assertPersistedChannel({...valid,config:{channel_role:'lab'}},identity,SOURCE_JID),(error)=>error?.code==='HIPICO_SERVERLESS_CHANNEL_ROLE_MISMATCH');
  assert.doesNotMatch(ingest, /resolution=merge-duplicates/);
  assert.match(ingest, /resolution=ignore-duplicates/);
});

test('serverless duplicate identity binds sender, timestamp, body, type, quote and semantic transport flags', () => {
  const base = {
    senderId: '584121234567',
    timestamp: '2026-09-11T01:00:00-05:00',
    type: 'chat',
    text: '30k',
    quotedExternalMessageId: 'source-1',
    fromMe: false,
    hasMedia: false
  };
  const sameInstant = { ...base, timestamp: '2026-09-11T06:00:00.000Z' };
  assert.equal(ingestTest.sourceReplaySignature(base), ingestTest.sourceReplaySignature(sameInstant));
  assert.notEqual(ingestTest.sourceReplaySignature(base), ingestTest.sourceReplaySignature({ ...base, text: '300k' }));
  assert.notEqual(ingestTest.sourceReplaySignature(base), ingestTest.sourceReplaySignature({ ...base, quotedExternalMessageId: 'source-2' }));
  assert.notEqual(ingestTest.sourceReplaySignature(base), ingestTest.sourceReplaySignature({ ...base, fromMe: true }));
  assert.notEqual(ingestTest.sourceReplaySignature(base), ingestTest.sourceReplaySignature({ ...base, hasMedia: true }));
  const persisted={sender_id:base.senderId,sent_at:'2026-09-11T06:00:00.000Z',message_type:base.type,raw_text:base.text,quoted_external_message_id:base.quotedExternalMessageId,normalized:{from_me:false,has_media:false}};
  assert.equal(ingestTest.persistedReplaySignature(persisted),ingestTest.sourceReplaySignature(base));
  assert.notEqual(ingestTest.persistedReplaySignature({...persisted,normalized:{from_me:true,has_media:false}}),ingestTest.sourceReplaySignature(base));
  assert.match(ingest, /select=id,sender_id,sent_at,message_type,raw_text,quoted_external_message_id,normalized/);
  assert.match(ingest, /replay_mismatch/);
  assert.match(ingest, /retryable:\s*false/);
});

test('group bridge fails closed to configured owner and centralized SOURCE/LAB policy', () => {
  assert.match(ingest, /env\('HIPICO_OWNER_ID'\)/);
  assert.doesNotMatch(ingest, /hipico_workspaces\?select=owner_id&order=updated_at\.desc&limit=1/);
  assert.match(ingest, /source_requires_shadow_mode/);
  assert.match(ingest, /validateBridgeRoleIdentity/);
  assert.match(bridgeIdentity, /source_group_not_authorized/);
  assert.match(bridgeIdentity, /lab_group_not_authorized/);
  assert.match(ingest, /actions:\s*\[\]/);
  assert.match(ingest, /monetaryAutoApply:\s*false/);
  assert.doesNotMatch(ingest, /response\.actions\.push/);
});

test('outbound Meta sender requires explicit production policy, durable state transitions and never auto-reclaims ambiguous rows', () => {
  assert.match(sender, /metaOutboundPolicy/);
  assert.match(sender, /metaDestinationAllowed/);
  assert.match(sender, /serverSecret\('HIPICO_INTERNAL_API_TOKEN'\)/);
  assert.match(sender, /outbound_disabled/);
  assert.match(sender, /sender_not_configured/);
  assert.match(sender, /DESTINATION_NOT_ALLOWLISTED/);
  assert.match(sender, /status:\s*'sending'/);
  assert.match(sender, /const row = await claimRow\(candidate\)/);
  assert.match(sender, /status=in\.\(queued,retry\)/);
  assert.doesNotMatch(sender, /status=in\.\(queued,retry,sending\)/);
  assert.match(sender, /return=representation/);
  assert.match(sender, /HIPICO_OUTBOX_STATE_TRANSITION_NOT_PERSISTED/);
  assert.match(sender, /RECONCILIATION_REQUIRED:AMBIGUOUS_TRANSPORT_FAILURE/);
  assert.match(sender, /RECONCILIATION_REQUIRED:META_SUCCESS_WITHOUT_MESSAGE_ID/);
  assert.match(sender, /reconciliationRequired/);
  assert.match(sender, /bearerTokenValid/);
  assert.match(sender, /isE164/);
});

test('status endpoint separates linked-device readiness from gated optional Meta Cloud readiness', () => {
  assert.match(status, /linkedDeviceBridge/);
  assert.match(status, /shadowOnly:\s*true/);
  assert.match(status, /sourceSendPossible:\s*false/);
  assert.match(status, /optionalForLinkedDeviceBridge:\s*true/);
  assert.match(status, /groupIdsValid/);
  assert.match(status, /groupsDistinct/);
  assert.match(status, /channelKeysValid/);
  assert.match(status, /channelKeysDistinct/);
  assert.match(status, /metaOutboundPolicy/);
  assert.match(status, /runtimeShaBound/);
  assert.doesNotMatch(status, /sourceChannelKey:\s*identity\.sourceChannelKey/);
  assert.doesNotMatch(status, /labChannelKey:\s*identity\.labChannelKey/);
  const ready=statusTest.bridgeIdentityStatus({HIPICO_SOURCE_GROUP_ID:SOURCE_JID,HIPICO_LAB_GROUP_ID:LAB_JID});
  assert.equal(ready.groupIdsValid,true);
  assert.equal(ready.groupsDistinct,true);
  assert.equal(ready.channelKeysDistinct,true);
  const invalid=statusTest.bridgeIdentityStatus({HIPICO_SOURCE_GROUP_ID:'s',HIPICO_LAB_GROUP_ID:LAB_JID});
  assert.equal(invalid.groupIdsValid,false);
  assert.equal(invalid.ready,false);
  const collided=statusTest.bridgeIdentityStatus({HIPICO_SOURCE_GROUP_ID:SOURCE_JID,HIPICO_LAB_GROUP_ID:LAB_JID,HIPICO_SOURCE_CHANNEL_KEY:'same-key',HIPICO_LAB_CHANNEL_KEY:'same-key'});
  assert.equal(collided.channelKeysDistinct,false);
});

test('legacy linked-device fallback cannot be configured to send to the source group', () => {
  assert.match(legacyBridge, /Legacy Hípico bridge is shadow-only/);
  assert.match(legacyBridge, /Legacy Hípico bridge requires pinned HIPICO_SOURCE_GROUP_ID and HIPICO_LAB_GROUP_ID/);
  assert.match(legacyBridge, /SOURCE_GROUP_ID_ENV === LAB_GROUP_ID_ENV/);
  assert.match(legacyBridge, /await client\.sendMessage\(lab\.id, labText\)/);
  assert.doesNotMatch(legacyBridge, /client\.sendMessage\(source\.id/);
  assert.match(legacyBridge, /shadowMode:\s*true/);
});
