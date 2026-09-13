import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateGroupBridgeBody } from '../frontend/api/hipico/group-bridge-ingest.js';

const backendPolicy = readFileSync(new URL('../backend/src/modules/hipico-bot/hipico-bridge-input-policy.ts', import.meta.url), 'utf8');
const backendRoutes = readFileSync(new URL('../backend/src/modules/hipico-bot/hipico-bridge.routes.ts', import.meta.url), 'utf8');
const serverless = readFileSync(new URL('../frontend/api/hipico/group-bridge-ingest.js', import.meta.url), 'utf8');

const sourceGroupId = '120363111111111111@g.us';
const labGroupId = '120363222222222222-2222222222@g.us';
const env = { HIPICO_SOURCE_GROUP_ID: sourceGroupId, HIPICO_LAB_GROUP_ID: labGroupId };
const mediaEnvelope = {
  bridgeVersion: '1.4.2',
  externalMessageId: 'media-unknown-1',
  groupId: sourceGroupId,
  groupName: 'Grupo fuente',
  channelKey: 'club-hipico-triple-crown-official',
  labChannelKey: 'control-hipico-lab',
  channelRole: 'source',
  shadowMode: true,
  senderId: '584121234567',
  senderLabel: 'Participante',
  fromMe: false,
  timestamp: '2026-09-12T12:00:00.000Z',
  type: 'media',
  mediaKind: 'unknown',
  text: 'caption no confiable',
  hasMedia: true,
  quotedExternalMessageId: null
};

test('#305 backend and serverless adapters share the unknown-media quarantine contract', () => {
  assert.equal(validateGroupBridgeBody(mediaEnvelope, env), null);
  assert.match(backendPolicy, /MEDIA_KINDS=new Set\(\['none','image','video','audio','document','unknown'\]\)/);
  assert.match(backendPolicy, /Boolean\(hasMedia\)&&known==='none'\)return'unknown'/);
  assert.match(backendRoutes, /effectiveBridgeMediaKind/);
  assert.match(serverless, /BRIDGE_MEDIA_KINDS = new Set\(\['none', 'image', 'video', 'audio', 'document', 'unknown'\]\)/);
});

test('#305 unknown media cannot masquerade as text or a no-media event', () => {
  assert.equal(validateGroupBridgeBody({ ...mediaEnvelope, hasMedia: false, type: 'chat' }, env), 'invalid_media_consistency');
  assert.equal(validateGroupBridgeBody({ ...mediaEnvelope, mediaKind: 'none' }, env), 'invalid_media_consistency');
  assert.equal(validateGroupBridgeBody({ ...mediaEnvelope, type: 'chat' }, env), 'invalid_media_consistency');
  assert.equal(validateGroupBridgeBody({ ...mediaEnvelope, unexpected: true }, env), 'unknown_field');
});
