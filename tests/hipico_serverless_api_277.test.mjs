import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bearerTokenValid, isE164, metaDestinationAllowed, metaOutboundPolicy, safeEqual, safeTimeoutMs } from '../frontend/api/hipico/_shared.js';
import { __test__ as ingestTest, validateGroupBridgeBody } from '../frontend/api/hipico/group-bridge-ingest.js';
import { __test__ as statusTest } from '../frontend/api/hipico/status.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const shared = read('../frontend/api/hipico/_shared.js');
const ingest = read('../frontend/api/hipico/group-bridge-ingest.js');
const sender = read('../frontend/api/hipico/whatsapp-send.js');
const status = read('../frontend/api/hipico/status.js');
const legacyBridge = read('../tools/hipico-whatsapp-bridge/src/index.mjs');

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

test('group bridge validates types, timestamps, quoted ids and pinned source before persistence', () => {
  const base = {
    groupId: 'source-gid',
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
  const env = { HIPICO_SOURCE_GROUP_ID: 'source-gid', HIPICO_LAB_GROUP_ID: 'lab-gid' };
  assert.equal(validateGroupBridgeBody(base, env), null);
  assert.equal(validateGroupBridgeBody({ ...base, fromMe: 'false' }, env), 'invalid_boolean_field');
  assert.equal(validateGroupBridgeBody({ ...base, timestamp: 'not-a-date' }, env), 'invalid_timestamp');
  assert.equal(validateGroupBridgeBody({ ...base, quotedExternalMessageId: 'x'.repeat(321) }, env), 'invalid_quoted_message_id');
  assert.equal(validateGroupBridgeBody({ ...base, groupId: 'other' }, env), 'source_group_not_authorized');
  assert.equal(validateGroupBridgeBody({ ...base, shadowMode: false }, env), 'source_requires_shadow_mode');
});

test('omitted group bridge role is canonical source across validation, persistence and lab shadow flow', () => {
  const body = {
    groupId: 'source-gid',
    externalMessageId: 'wamid-default-source',
    shadowMode: true,
    senderId: '584121234567',
    timestamp: '2026-09-11T06:00:00.000Z',
    type: 'chat',
    text: 'Juego 1N del 5 con 100k'
  };
  const env = { HIPICO_SOURCE_GROUP_ID: 'source-gid', HIPICO_LAB_GROUP_ID: 'lab-gid' };
  assert.equal(validateGroupBridgeBody(body, env), null);
  assert.equal(ingestTest.normalizedChannelRole(body), 'source');
  assert.equal(ingestTest.normalizedChannelRole({ ...body, channelRole: 'lab' }), 'lab');
  assert.match(ingest, /channel_role:\s*channelRole/);
  assert.match(ingest, /labSimulation:\s*!duplicate\s*&&\s*channelRole === 'source'/);
  assert.doesNotMatch(ingest, /body\.channelRole === 'source'/);
});

test('serverless bridge identity is mandatory and client channel aliases cannot split the canonical source', () => {
  const base = {
    groupId: 'source-gid', externalMessageId: 'wamid-1', groupName: 'Grupo fuente', channelRole: 'source', shadowMode: true,
    senderId: '584121234567', timestamp: '2026-09-11T06:00:00.000Z', type: 'chat', text: 'hola'
  };
  assert.equal(validateGroupBridgeBody(base, {}), 'source_group_not_configured');
  assert.equal(validateGroupBridgeBody({ ...base, channelKey: 'otro-canal' }, { HIPICO_SOURCE_GROUP_ID: 'source-gid' }), 'source_channel_not_authorized');
  assert.equal(validateGroupBridgeBody({ ...base, channelRole: 'lab', groupId: 'lab-gid' }, { HIPICO_SOURCE_GROUP_ID: 'source-gid' }), 'lab_group_not_configured');
  assert.deepEqual(ingestTest.configuredChannelIdentity('source', { HIPICO_SOURCE_GROUP_ID: 'source-gid' }), {
    role: 'source', groupId: 'source-gid', channelKey: 'club-hipico-triple-crown-official'
  });
});

test('persisted serverless channels cannot be reactivated or repurposed by incoming traffic', () => {
  const identity={role:'source',groupId:'source-gid',channelKey:'club-hipico-triple-crown-official'};
  const valid={id:'c1',status:'active',channel_type:'web_bridge',config:{channel_role:'source'}};
  assert.equal(ingestTest.assertPersistedChannel(valid,identity,'source-gid').id,'c1');
  assert.throws(()=>ingestTest.assertPersistedChannel({...valid,status:'blocked'},identity,'source-gid'),(error)=>error?.code==='HIPICO_SERVERLESS_CHANNEL_DISABLED');
  assert.throws(()=>ingestTest.assertPersistedChannel({...valid,channel_type:'manual_export'},identity,'source-gid'),(error)=>error?.code==='HIPICO_SERVERLESS_CHANNEL_TYPE_MISMATCH');
  assert.throws(()=>ingestTest.assertPersistedChannel({...valid,config:{channel_role:'lab'}},identity,'source-gid'),(error)=>error?.code==='HIPICO_SERVERLESS_CHANNEL_ROLE_MISMATCH');
  assert.doesNotMatch(ingest, /resolution=merge-duplicates/);
  assert.match(ingest, /resolution=ignore-duplicates/);
});

test('legacy serverless duplicate identity binds sender, timestamp, body, type and quote context', () => {
  const base = {
    senderId: '584121234567',
    timestamp: '2026-09-11T01:00:00-05:00',
    type: 'chat',
    text: '30k',
    quotedExternalMessageId: 'source-1'
  };
  const sameInstant = { ...base, timestamp: '2026-09-11T06:00:00.000Z' };
  assert.equal(ingestTest.sourceReplaySignature(base), ingestTest.sourceReplaySignature(sameInstant));
  assert.notEqual(ingestTest.sourceReplaySignature(base), ingestTest.sourceReplaySignature({ ...base, text: '300k' }));
  assert.notEqual(ingestTest.sourceReplaySignature(base), ingestTest.sourceReplaySignature({ ...base, quotedExternalMessageId: 'source-2' }));
  assert.match(ingest, /replay_mismatch/);
  assert.match(ingest, /retryable:\s*false/);
});

test('group bridge fails closed to configured owner and source shadow mode', () => {
  assert.match(ingest, /env\('HIPICO_OWNER_ID'\)/);
  assert.doesNotMatch(ingest, /hipico_workspaces\?select=owner_id&order=updated_at\.desc&limit=1/);
  assert.match(ingest, /source_requires_shadow_mode/);
  assert.match(ingest, /source_group_not_authorized/);
  assert.match(ingest, /lab_group_not_authorized/);
  assert.match(ingest, /actions:\s*\[\]/);
  assert.match(ingest, /monetaryAutoApply:\s*false/);
  assert.doesNotMatch(ingest, /response\.actions\.push/);
});

test('outbound Meta sender requires explicit production policy, durable state transitions and never auto-reclaims ambiguous rows', () => {
  assert.match(sender, /metaOutboundPolicy/);
  assert.match(sender, /metaDestinationAllowed/);
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
  assert.match(status, /groupsDistinct/);
  assert.match(status, /channelKeysValid/);
  assert.match(status, /channelKeysDistinct/);
  assert.match(status, /metaOutboundPolicy/);
  assert.match(status, /runtimeShaBound/);
  assert.doesNotMatch(status, /sourceChannelKey:\s*identity\.sourceChannelKey/);
  assert.doesNotMatch(status, /labChannelKey:\s*identity\.labChannelKey/);
  const ready=statusTest.bridgeIdentityStatus({HIPICO_SOURCE_GROUP_ID:'s',HIPICO_LAB_GROUP_ID:'l'});
  assert.equal(ready.groupsDistinct,true);
  assert.equal(ready.channelKeysDistinct,true);
  const collided=statusTest.bridgeIdentityStatus({HIPICO_SOURCE_GROUP_ID:'s',HIPICO_LAB_GROUP_ID:'l',HIPICO_SOURCE_CHANNEL_KEY:'same-key',HIPICO_LAB_CHANNEL_KEY:'same-key'});
  assert.equal(collided.channelKeysDistinct,false);
});

test('legacy linked-device fallback cannot be configured to send to the source group', () => {
  assert.match(legacyBridge, /Legacy Hípico bridge is shadow-only/);
  assert.match(legacyBridge, /HIPICO_ALLOW_SEND requires pinned SOURCE and LAB group IDs/);
  assert.match(legacyBridge, /await client\.sendMessage\(lab\.id, labText\)/);
  assert.doesNotMatch(legacyBridge, /client\.sendMessage\(source\.id/);
  assert.match(legacyBridge, /shadowMode:\s*true/);
});
