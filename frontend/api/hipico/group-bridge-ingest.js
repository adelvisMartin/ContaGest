import { safeEqual, serverSecret, sha256 } from './_shared.js';
import { HIPICO_CHANNEL_KEY_PATTERN, configuredChannelIdentity, validateBridgeRoleIdentity } from './bridge-identity.js';
import { proxyCanonicalRequest, relayCanonicalResponse } from './canonical-backend.js';

const MAX_BRIDGE_BODY_BYTES = 24 * 1024;
const ALLOWED_BRIDGE_BODY_KEYS = new Set([
  'bridgeVersion', 'externalMessageId', 'groupId', 'groupName', 'channelKey', 'labChannelKey',
  'channelRole', 'shadowMode', 'historySync', 'senderId', 'senderLabel', 'fromMe', 'timestamp',
  'type', 'mediaKind', 'mediaName', 'text', 'hasMedia', 'quotedExternalMessageId', 'quoteDepth', 'rawMeta'
]);
const REQUIRED_BRIDGE_BODY_KEYS = new Set([
  'bridgeVersion', 'externalMessageId', 'groupId', 'groupName', 'channelKey', 'labChannelKey',
  'channelRole', 'shadowMode', 'senderId', 'fromMe', 'timestamp', 'type', 'mediaKind', 'text', 'hasMedia'
]);
const BRIDGE_MESSAGE_TYPES = new Set(['chat', 'media']);
const BRIDGE_MEDIA_KINDS = new Set(['none', 'image', 'video', 'audio', 'document', 'unknown']);
const ISO_TIMESTAMP_WITH_ZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

function bridgeBodyBytes(body) {
  try { return Buffer.byteLength(JSON.stringify(body), 'utf8'); }
  catch { return Number.POSITIVE_INFINITY; }
}

function normalizedMediaKind(body) {
  if (body?.mediaKind !== undefined) return String(body.mediaKind).trim().toLowerCase();
  return body?.hasMedia === true ? 'unknown' : 'none';
}

function normalizedTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 64) return undefined;
  const match = value.match(ISO_TIMESTAMP_WITH_ZONE);
  if (!match) return undefined;
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, , zone] = match;
  const year = Number(yearRaw), month = Number(monthRaw), day = Number(dayRaw);
  const hour = Number(hourRaw), minute = Number(minuteRaw), second = Number(secondRaw);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return undefined;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return undefined;
  if (zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function normalizedChannelRole(body) {
  return String(body?.channelRole || '').trim().toLowerCase();
}

function missingRequiredBridgeField(body) {
  for (const key of REQUIRED_BRIDGE_BODY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) return key;
  }
  return null;
}

export function validateGroupBridgeBody(body, source = process.env) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'invalid_body';
  if (bridgeBodyBytes(body) > MAX_BRIDGE_BODY_BYTES) return 'payload_too_large';
  if (Object.keys(body).some((key) => !ALLOWED_BRIDGE_BODY_KEYS.has(key))) return 'unknown_field';
  if (missingRequiredBridgeField(body)) return 'missing_required_field';

  const groupId = String(body.groupId || '').trim();
  const externalMessageId = String(body.externalMessageId || '').trim();
  const role = normalizedChannelRole(body);
  if (!groupId || groupId.length > 220 || !externalMessageId || externalMessageId.length > 320) return 'invalid_identifiers';
  if (!['source', 'lab'].includes(role)) return 'invalid_channel_role';
  if (typeof body.groupName !== 'string' || !body.groupName.trim() || body.groupName.length > 220) return 'invalid_group_name';
  if (typeof body.channelKey !== 'string' || !HIPICO_CHANNEL_KEY_PATTERN.test(body.channelKey.trim())) return 'invalid_channel_key';
  if (typeof body.labChannelKey !== 'string' || !HIPICO_CHANNEL_KEY_PATTERN.test(body.labChannelKey.trim())) return 'invalid_lab_channel_key';
  if (body.labChannelKey.trim() !== configuredChannelIdentity('lab', source).channelKey) return 'lab_channel_not_authorized';
  if (typeof body.bridgeVersion !== 'string' || !body.bridgeVersion.trim() || body.bridgeVersion.length > 80) return 'invalid_bridge_version';
  if (typeof body.type !== 'string' || !BRIDGE_MESSAGE_TYPES.has(body.type.trim().toLowerCase())) return 'invalid_message_type';
  if (typeof body.mediaKind !== 'string' || !BRIDGE_MEDIA_KINDS.has(body.mediaKind.trim().toLowerCase())) return 'invalid_media_kind';
  if (body.mediaName !== undefined && (typeof body.mediaName !== 'string' || body.mediaName.length > 240)) return 'invalid_media_name';
  if (body.rawMeta !== undefined && (typeof body.rawMeta !== 'string' || body.rawMeta.length > 500)) return 'invalid_raw_meta';
  if (typeof body.text !== 'string') return 'invalid_text';
  if (body.text.length > 4000) return 'text_too_large';
  if (typeof body.senderId !== 'string' || !body.senderId.trim() || body.senderId.length > 220) return 'invalid_sender';
  if (body.senderLabel !== undefined && (typeof body.senderLabel !== 'string' || body.senderLabel.length > 220)) return 'invalid_sender_label';
  if (typeof body.shadowMode !== 'boolean' || typeof body.fromMe !== 'boolean' || typeof body.hasMedia !== 'boolean') return 'invalid_boolean_field';
  if (body.historySync !== undefined && typeof body.historySync !== 'boolean') return 'invalid_history_sync';
  if (body.quoteDepth !== undefined && (!Number.isInteger(body.quoteDepth) || body.quoteDepth < 0 || body.quoteDepth > 20)) return 'invalid_quote_depth';
  if (body.quotedExternalMessageId !== undefined && body.quotedExternalMessageId !== null && (typeof body.quotedExternalMessageId !== 'string' || body.quotedExternalMessageId.length > 320)) return 'invalid_quoted_message_id';
  if (!normalizedTimestamp(body.timestamp)) return 'invalid_timestamp';
  if (body.shadowMode !== true) return role === 'source' ? 'source_requires_shadow_mode' : 'lab_requires_shadow_mode';
  if (body.hasMedia === false && normalizedMediaKind(body) !== 'none') return 'invalid_media_consistency';
  if (body.hasMedia === true && normalizedMediaKind(body) === 'none') return 'invalid_media_consistency';
  if (body.hasMedia === true && body.type.trim().toLowerCase() !== 'media') return 'invalid_media_consistency';
  if (body.hasMedia === false && body.type.trim().toLowerCase() === 'media') return 'invalid_media_consistency';

  return validateBridgeRoleIdentity(role, groupId, body.channelKey, source);
}

function sourceReplaySignature(body) {
  return sha256(JSON.stringify([
    String(body.senderId || '').trim(),
    normalizedTimestamp(body.timestamp),
    String(body.type || ''),
    String(body.text || ''),
    body.quotedExternalMessageId == null ? null : String(body.quotedExternalMessageId),
    body.fromMe === true,
    body.hasMedia === true,
    normalizedMediaKind(body),
    body.historySync === true,
    Number.isInteger(body.quoteDepth) ? body.quoteDepth : 0
  ]));
}

function canonicalBridgeEvent(body, source = process.env) {
  const role = normalizedChannelRole(body);
  const identity = configuredChannelIdentity(role, source);
  const lab = configuredChannelIdentity('lab', source);
  return {
    bridgeVersion: String(body.bridgeVersion).trim(),
    externalMessageId: String(body.externalMessageId).trim(),
    groupId: identity.groupId,
    groupName: String(body.groupName).trim(),
    channelKey: identity.channelKey,
    labChannelKey: lab.channelKey,
    channelRole: role,
    shadowMode: true,
    historySync: body.historySync === true,
    senderId: String(body.senderId).trim(),
    senderLabel: String(body.senderLabel || '').slice(0, 220),
    fromMe: body.fromMe === true,
    timestamp: normalizedTimestamp(body.timestamp),
    type: String(body.type).trim().toLowerCase(),
    mediaKind: normalizedMediaKind(body),
    mediaName: String(body.mediaName || '').slice(0, 240),
    text: String(body.text),
    hasMedia: body.hasMedia === true,
    quotedExternalMessageId: body.quotedExternalMessageId == null ? null : String(body.quotedExternalMessageId),
    quoteDepth: Number.isInteger(body.quoteDepth) ? body.quoteDepth : 0,
    rawMeta: `serverless-compat:${sourceReplaySignature(body).slice(0, 24)}`
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, retryable: false, error: 'method_not_allowed' });

  let configuredToken;
  try { configuredToken = serverSecret('HIPICO_GROUP_BRIDGE_TOKEN'); }
  catch { return res.status(503).json({ ok: false, retryable: true, error: 'bridge_not_configured' }); }

  if (!safeEqual(req.headers['x-hipico-bridge-token'], configuredToken)) {
    return res.status(401).json({ ok: false, retryable: false, error: 'unauthorized' });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ ok: false, retryable: false, error: 'invalid_json' }); }

  const bodyError = validateGroupBridgeBody(body);
  if (bodyError) return res.status(400).json({ ok: false, retryable: false, error: bodyError });

  try {
    const upstream = await proxyCanonicalRequest({
      path: '/api/v1/hipico-bot/bridge/events',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hipico-bridge-token': configuredToken
      },
      body: JSON.stringify(canonicalBridgeEvent(body))
    });
    return relayCanonicalResponse(res, upstream);
  } catch (error) {
    console.error('hipico canonical bridge proxy failed', { code: error?.code || 'HIPICO_CANONICAL_PROXY_FAILED' });
    return res.status(503).json({ ok: false, retryable: true, error: 'canonical_backend_unavailable' });
  }
}

export const __test__ = {
  normalizedTimestamp,
  normalizedChannelRole,
  normalizedMediaKind,
  missingRequiredBridgeField,
  sourceReplaySignature,
  canonicalBridgeEvent,
  configuredChannelIdentity
};
