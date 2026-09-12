import { safeEqual, serverSecret, sha256 } from './_shared.js';
import { HIPICO_CHANNEL_KEY_PATTERN, configuredChannelIdentity, validateBridgeRoleIdentity } from './bridge-identity.js';
import { proxyCanonicalRequest, relayCanonicalResponse } from './canonical-backend.js';

function validOptionalBoolean(body, key) { return body[key] === undefined || typeof body[key] === 'boolean'; }
function normalizedTimestamp(value) { if (value === undefined || value === null || value === '') return null; if (typeof value !== 'string' || value.length > 64) return undefined; const parsed = Date.parse(value); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined; }
function normalizedChannelRole(body) { return String(body?.channelRole || 'source'); }

export function validateGroupBridgeBody(body, source = process.env) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'invalid_body';
  const groupId = String(body.groupId || '').trim(); const externalMessageId = String(body.externalMessageId || '').trim(); const role = normalizedChannelRole(body);
  if (!groupId || groupId.length > 220 || !externalMessageId || externalMessageId.length > 320) return 'invalid_identifiers';
  if (!['source', 'lab'].includes(role)) return 'invalid_channel_role';
  if (body.groupName !== undefined && (typeof body.groupName !== 'string' || body.groupName.length > 220)) return 'invalid_group_name';
  if (body.channelKey !== undefined && (typeof body.channelKey !== 'string' || !HIPICO_CHANNEL_KEY_PATTERN.test(body.channelKey.trim()))) return 'invalid_channel_key';
  if (body.bridgeVersion !== undefined && (typeof body.bridgeVersion !== 'string' || body.bridgeVersion.length > 80)) return 'invalid_bridge_version';
  if (body.type !== undefined && (typeof body.type !== 'string' || body.type.length > 80)) return 'invalid_message_type';
  if (body.text !== undefined && typeof body.text !== 'string') return 'invalid_text';
  if (String(body.text || '').length > 4000) return 'text_too_large';
  if (typeof body.senderId !== 'string' || !body.senderId.trim() || body.senderId.length > 220) return 'invalid_sender';
  if (body.senderLabel !== undefined && (typeof body.senderLabel !== 'string' || body.senderLabel.length > 220)) return 'invalid_sender_label';
  if (!validOptionalBoolean(body, 'shadowMode') || !validOptionalBoolean(body, 'fromMe') || !validOptionalBoolean(body, 'hasMedia') || !validOptionalBoolean(body, 'historySync')) return 'invalid_boolean_field';
  if (body.quoteDepth !== undefined && (!Number.isInteger(body.quoteDepth) || body.quoteDepth < 0 || body.quoteDepth > 20)) return 'invalid_quote_depth';
  if (body.quotedExternalMessageId !== undefined && body.quotedExternalMessageId !== null && (typeof body.quotedExternalMessageId !== 'string' || body.quotedExternalMessageId.length > 320)) return 'invalid_quoted_message_id';
  if (!normalizedTimestamp(body.timestamp)) return 'invalid_timestamp';
  if (body.shadowMode !== true) return role === 'source' ? 'source_requires_shadow_mode' : 'lab_requires_shadow_mode';
  return validateBridgeRoleIdentity(role, groupId, body.channelKey, source);
}

function sourceReplaySignature(body) {
  return sha256(JSON.stringify([String(body.senderId || '').trim(), normalizedTimestamp(body.timestamp), String(body.type || 'text'), String(body.text || ''), body.quotedExternalMessageId == null ? null : String(body.quotedExternalMessageId), Boolean(body.fromMe), Boolean(body.hasMedia), Boolean(body.historySync)]));
}

function mediaKind(body) {
  const allowed = new Set(['none', 'image', 'video', 'audio', 'document', 'unknown']);
  const requested = String(body.mediaKind || '').trim().toLowerCase();
  return allowed.has(requested) ? requested : body.hasMedia ? 'unknown' : 'none';
}

function canonicalBridgeEvent(body, source = process.env) {
  const role = normalizedChannelRole(body);
  const identity = configuredChannelIdentity(role, source);
  const lab = configuredChannelIdentity('lab', source);
  return { bridgeVersion: String(body.bridgeVersion || 'serverless-compat-adapter').slice(0, 80), externalMessageId: String(body.externalMessageId).trim(), groupId: identity.groupId, groupName: String(body.groupName || 'Grupo WhatsApp').trim().slice(0, 220) || 'Grupo WhatsApp', channelKey: identity.channelKey, labChannelKey: lab.channelKey, channelRole: role, shadowMode: true, historySync: Boolean(body.historySync), senderId: String(body.senderId).trim(), senderLabel: String(body.senderLabel || '').slice(0, 220), fromMe: Boolean(body.fromMe), timestamp: normalizedTimestamp(body.timestamp), type: String(body.type || 'chat').slice(0, 80), mediaKind: mediaKind(body), mediaName: String(body.mediaName || '').slice(0, 240), text: String(body.text || '').slice(0, 4000), hasMedia: Boolean(body.hasMedia), quotedExternalMessageId: body.quotedExternalMessageId == null ? null : String(body.quotedExternalMessageId), quoteDepth: Number.isInteger(body.quoteDepth) ? body.quoteDepth : 0, rawMeta: `serverless-compat:${sourceReplaySignature(body).slice(0, 24)}` };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, retryable: false, error: 'method_not_allowed' });
  let configuredToken;
  try { configuredToken = serverSecret('HIPICO_GROUP_BRIDGE_TOKEN'); }
  catch { return res.status(503).json({ ok: false, retryable: true, error: 'bridge_not_configured' }); }
  if (!safeEqual(req.headers['x-hipico-bridge-token'], configuredToken)) return res.status(401).json({ ok: false, retryable: false, error: 'unauthorized' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ ok: false, retryable: false, error: 'invalid_json' }); }
  const bodyError = validateGroupBridgeBody(body);
  if (bodyError) return res.status(400).json({ ok: false, retryable: false, error: bodyError });
  try {
    const upstream = await proxyCanonicalRequest({ path: '/api/v1/hipico-bot/bridge/events', method: 'POST', headers: { 'content-type': 'application/json', 'x-hipico-bridge-token': configuredToken }, body: JSON.stringify(canonicalBridgeEvent(body)) });
    return relayCanonicalResponse(res, upstream);
  } catch (error) {
    console.error('hipico canonical bridge proxy failed', { message: error?.message || String(error) });
    return res.status(503).json({ ok: false, retryable: true, error: 'canonical_backend_unavailable' });
  }
}

export const __test__ = { normalizedTimestamp, normalizedChannelRole, sourceReplaySignature, canonicalBridgeEvent, configuredChannelIdentity };
