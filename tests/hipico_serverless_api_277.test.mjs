import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bearerTokenValid, isE164, metaDestinationAllowed, metaOutboundPolicy, safeEqual } from '../frontend/api/hipico/_shared.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const shared = read('../frontend/api/hipico/_shared.js');
const ingest = read('../frontend/api/hipico/group-bridge-ingest.js');
const sender = read('../frontend/api/hipico/whatsapp-send.js');
const status = read('../frontend/api/hipico/status.js');
const legacyBridge = read('../tools/hipico-whatsapp-bridge/src/index.mjs');

test('serverless auth helpers compare secrets safely and validate destinations', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('', ''), false);
  assert.equal(bearerTokenValid('Bearer 123456', '123456'), true);
  assert.equal(bearerTokenValid('Basic 123456', '123456'), false);
  assert.equal(isE164('+584121234567'), true);
  assert.equal(isE164('0412-1234567'), false);
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
  assert.match(shared, /HIPICO_SUPABASE_TIMEOUT_MS/);
  assert.doesNotMatch(shared, /text\.slice\(0,\s*500\)/);
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

test('outbound Meta sender requires explicit production policy, atomically claims rows and never auto-reclaims sending rows', () => {
  assert.match(sender, /metaOutboundPolicy/);
  assert.match(sender, /metaDestinationAllowed/);
  assert.match(sender, /outbound_disabled/);
  assert.match(sender, /DESTINATION_NOT_ALLOWLISTED/);
  assert.match(sender, /status:\s*'sending'/);
  assert.match(sender, /const row = await claimRow\(candidate\)/);
  assert.match(sender, /status=in\.\(queued,retry\)/);
  assert.doesNotMatch(sender, /status=in\.\(queued,retry,sending\)/);
  assert.match(sender, /AMBIGUOUS_TRANSPORT_FAILURE/);
  assert.match(sender, /META_SUCCESS_WITHOUT_MESSAGE_ID/);
  assert.match(sender, /bearerTokenValid/);
  assert.match(sender, /isE164/);
});

test('status endpoint separates linked-device readiness from gated optional Meta Cloud readiness', () => {
  assert.match(status, /linkedDeviceBridge/);
  assert.match(status, /shadowOnly:\s*true/);
  assert.match(status, /sourceSendPossible:\s*false/);
  assert.match(status, /optionalForLinkedDeviceBridge:\s*true/);
  assert.match(status, /groupsDistinct/);
  assert.match(status, /metaOutboundPolicy/);
  assert.match(status, /runtimeShaBound/);
});

test('legacy linked-device fallback cannot be configured to send to the source group', () => {
  assert.match(legacyBridge, /Legacy Hípico bridge is shadow-only/);
  assert.match(legacyBridge, /HIPICO_ALLOW_SEND requires pinned SOURCE and LAB group IDs/);
  assert.match(legacyBridge, /await client\.sendMessage\(lab\.id, labText\)/);
  assert.doesNotMatch(legacyBridge, /client\.sendMessage\(source\.id/);
  assert.match(legacyBridge, /shadowMode:\s*true/);
});
