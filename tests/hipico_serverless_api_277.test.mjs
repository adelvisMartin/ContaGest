import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bearerTokenValid, isE164, metaDestinationAllowed, metaOutboundPolicy, safeEqual, safeTimeoutMs, strongSecretConfigured } from '../frontend/api/hipico/_shared.js';
import { isWhatsAppGroupId, validateBridgeRoleIdentity } from '../frontend/api/hipico/bridge-identity.js';
import { __test__ as ingestTest, validateGroupBridgeBody } from '../frontend/api/hipico/group-bridge-ingest.js';
import { __test__ as statusTest } from '../frontend/api/hipico/status.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const shared = read('../frontend/api/hipico/_shared.js');
const identitySource = read('../frontend/api/hipico/bridge-identity.js');
const ingest = read('../frontend/api/hipico/group-bridge-ingest.js');
const sender = read('../frontend/api/hipico/whatsapp-send.js');
const status = read('../frontend/api/hipico/status.js');
const legacyBridge = read('../tools/hipico-whatsapp-bridge/src/index.mjs');

const sourceGroupId = '120363111111111111@g.us';
const labGroupId = '120363222222222222-2222222222@g.us';
const sourceChannelKey = 'club-hipico-triple-crown-official';
const labChannelKey = 'control-hipico-lab';
const bridgeEnv = { HIPICO_SOURCE_GROUP_ID: sourceGroupId, HIPICO_LAB_GROUP_ID: labGroupId };
function bridgeEnvelope(overrides = {}) {
  return {
    bridgeVersion: '1.4.2',
    groupId: sourceGroupId,
    externalMessageId: 'wamid-1',
    groupName: 'Grupo fuente',
    channelKey: sourceChannelKey,
    labChannelKey,
    channelRole: 'source',
    shadowMode: true,
    senderId: '584121234567',
    senderLabel: 'Participante',
    fromMe: false,
    hasMedia: false,
    mediaKind: 'none',
    timestamp: '2026-09-11T06:00:00.000Z',
    type: 'chat',
    text: 'Juego 1N del 5 con 100k',
    quotedExternalMessageId: 'wamid-origin',
    ...overrides
  };
}

test('serverless auth helpers compare secrets safely, enforce internal secret strength and validate E.164 bounds', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('', ''), false);
  assert.equal(strongSecretConfigured('x'.repeat(31)), false);
  assert.equal(strongSecretConfigured('x'.repeat(32)), true);
  assert.equal(strongSecretConfigured('x'.repeat(64)), true);
  assert.equal(bearerTokenValid('Bearer 123456', '123456'), true);
  assert.equal(bearerTokenValid('Basic 123456', '123456'), false);
  assert.equal(isE164('+584121234567'), true);
  assert.equal(isE164('0412-1234567'), false);
  assert.equal(isE164(`+${'1'.repeat(15)}`), true);
  assert.equal(isE164(`+${'1'.repeat(16)}`), false);
  assert.match(shared, /MIN_HIPICO_INTERNAL_SECRET_LENGTH\s*=\s*32/);
  assert.match(shared, /Weak server configuration/);
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

test('serverless bridge identity accepts modern and legacy group JIDs and rejects malformed or colliding identities', () => {
  assert.equal(isWhatsAppGroupId(sourceGroupId), true);
  assert.equal(isWhatsAppGroupId(labGroupId), true);
  assert.equal(isWhatsAppGroupId('source-gid'), false);
  assert.equal(validateBridgeRoleIdentity('source', sourceGroupId, undefined, bridgeEnv), null);
  assert.equal(validateBridgeRoleIdentity('lab', labGroupId, undefined, bridgeEnv), null);
  assert.equal(validateBridgeRoleIdentity('source', sourceGroupId, undefined, { ...bridgeEnv, HIPICO_LAB_GROUP_ID: sourceGroupId }), 'bridge_groups_not_distinct');
  assert.equal(validateBridgeRoleIdentity('source', sourceGroupId, undefined, { ...bridgeEnv, HIPICO_LAB_GROUP_ID: 'bad-id' }), 'lab_group_invalid');
});

test('group bridge validates strict transport schema before persistence', () => {
  const base = bridgeEnvelope();
  assert.equal(validateGroupBridgeBody(base, bridgeEnv), null);
  assert.equal(validateGroupBridgeBody({ ...base, fromMe: 'false' }, bridgeEnv), 'invalid_boolean_field');
  assert.equal(validateGroupBridgeBody({ ...base, timestamp: 'not-a-date' }, bridgeEnv), 'invalid_timestamp');
  assert.equal(validateGroupBridgeBody({ ...base, quotedExternalMessageId: 'x'.repeat(321) }, bridgeEnv), 'invalid_quoted_message_id');
  assert.equal(validateGroupBridgeBody({ ...base, groupId: labGroupId }, bridgeEnv), 'source_group_not_authorized');
  assert.equal(validateGroupBridgeBody({ ...base, shadowMode: false }, bridgeEnv), 'source_requires_shadow_mode');
  assert.equal(validateGroupBridgeBody({ ...base, hasMedia: true, mediaKind: 'none' }, bridgeEnv), 'invalid_media_consistency');
  assert.match(ingest, /serverSecret\('HIPICO_GROUP_BRIDGE_TOKEN'\)/);
});

test('group bridge requires explicit role and canonical channel identities', () => {
  const body = bridgeEnvelope({ externalMessageId: 'wamid-explicit-source' });
  const { channelRole: _omitted, ...withoutChannelRole } = body;
  assert.equal(validateGroupBridgeBody(withoutChannelRole, bridgeEnv), 'missing_required_field');
  assert.equal(validateGroupBridgeBody({ ...body, channelRole: undefined }, bridgeEnv), 'invalid_channel_role');
  assert.equal(ingestTest.normalizedChannelRole(body), 'source');
  assert.equal(ingestTest.normalizedChannelRole({ ...body, channelRole: 'lab' }), 'lab');
  assert.equal(validateGroupBridgeBody({ ...body, channelKey: 'otro-canal' }, bridgeEnv), 'source_channel_not_authorized');
});

test('serverless bridge identity is mandatory and client channel aliases cannot split the canonical source', () => {
  const base = bridgeEnvelope({ text: 'hola' });
  assert.equal(validateGroupBridgeBody(base, {}), 'source_group_not_configured');
  assert.equal(validateGroupBridgeBody({ ...base, channelKey: 'otro-canal' }, bridgeEnv), 'source_channel_not_authorized');
  assert.equal(validateGroupBridgeBody({ ...base, channelRole: 'lab', groupId: labGroupId, channelKey: labChannelKey }, { HIPICO_SOURCE_GROUP_ID: sourceGroupId }), 'lab_group_not_configured');
  assert.deepEqual(ingestTest.configuredChannelIdentity('source', bridgeEnv), {
    role: 'source', groupId: sourceGroupId, channelKey: sourceChannelKey
  });
});

test('persisted serverless channels cannot be reactivated or repurposed by incoming traffic', () => {
  const identity = { role: 'source', groupId: sourceGroupId, channelKey: sourceChannelKey };
  const valid = { id: 'c1', status: 'active', channel_type: 'web_bridge', config: { channel_role: 'source' } };
  assert.equal(ingestTest.assertPersistedChannel(valid, identity, sourceGroupId).id, 'c1');
  assert.throws(() => ingestTest.assertPersistedChannel({ ...valid, status: 'blocked' }, identity, sourceGroupId), (error) => error?.code === 'HIPICO_SERVERLESS_CHANNEL_DISABLED');
  assert.throws(() => ingestTest.assertPersistedChannel({ ...valid, channel_type: 'manual_export' }, identity, sourceGroupId), (error) => error?.code === 'HIPICO_SERVERLESS_CHANNEL_TYPE_MISMATCH');
  assert.throws(() => ingestTest.assertPersistedChannel({ ...valid, config: { channel_role: 'lab' } }, identity, sourceGroupId), (error) => error?.code === 'HIPICO_SERVERLESS_CHANNEL_ROLE_MISMATCH');
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
  assert.match(identitySource, /source_group_not_authorized/);
  assert.match(identitySource, /lab_group_not_authorized/);
  assert.match(ingest, /actions:\s*\[\]/);
  assert.match(ingest, /monetaryAutoApply:\s*false/);
  assert.doesNotMatch(ingest, /response\.actions\.push/);
});

test('outbound Meta sender requires strong auth, explicit production policy, durable transitions and no ambiguous reclaim', () => {
  assert.match(sender, /serverSecret\('HIPICO_INTERNAL_API_TOKEN'\)/);
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

test('status endpoint separates linked-device readiness from gated optional Meta Cloud readiness without exposing identity or secrets', () => {
  assert.match(status, /linkedDeviceBridge/);
  assert.match(status, /shadowOnly:\s*true/);
  assert.match(status, /sourceSendPossible:\s*false/);
  assert.match(status, /bridgeTokenStrong/);
  assert.match(status, /internalApiTokenStrong/);
  assert.match(status, /webhookSecretsStrong/);
  assert.match(status, /optionalForLinkedDeviceBridge:\s*true/);
  assert.match(status, /groupIdsValid/);
  assert.match(status, /groupsDistinct/);
  assert.match(status, /channelKeysValid/);
  assert.match(status, /channelKeysDistinct/);
  assert.match(status, /metaOutboundPolicy/);
  assert.match(status, /runtimeShaBound/);
  assert.doesNotMatch(status, /sourceChannelKey:\s*identity\.sourceChannelKey/);
  assert.doesNotMatch(status, /labChannelKey:\s*identity\.labChannelKey/);
  const ready = statusTest.bridgeIdentityStatus(bridgeEnv);
  assert.equal(ready.groupIdsValid, true);
  assert.equal(ready.groupsDistinct, true);
  assert.equal(ready.channelKeysDistinct, true);
  const collided = statusTest.bridgeIdentityStatus({ ...bridgeEnv, HIPICO_SOURCE_CHANNEL_KEY: 'same-key', HIPICO_LAB_CHANNEL_KEY: 'same-key' });
  assert.equal(collided.channelKeysDistinct, false);
  const malformed = statusTest.bridgeIdentityStatus({ ...bridgeEnv, HIPICO_LAB_GROUP_ID: 'lab-gid' });
  assert.equal(malformed.groupIdsValid, false);
  assert.equal(malformed.ready, false);
});

test('legacy linked-device fallback cannot be configured to send to the source group', () => {
  assert.match(legacyBridge, /Legacy Hípico bridge is shadow-only/);
  assert.match(legacyBridge, /requires pinned HIPICO_SOURCE_GROUP_ID and HIPICO_LAB_GROUP_ID/);
  assert.match(legacyBridge, /await client\.sendMessage\(lab\.id, labText\)/);
  assert.doesNotMatch(legacyBridge, /client\.sendMessage\(source\.id/);
  assert.match(legacyBridge, /shadowMode:\s*true/);
});
