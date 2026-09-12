import { extractMetaMessages, isE164, readRawBody, safeEqual, verifyMetaSignature } from './_shared.js';
import { proxyCanonicalRequest, relayCanonicalResponse } from './canonical-backend.js';
import { isMetaPhoneNumberId, metaWebhookConfig } from './meta-runtime.js';
import { metaTimestampValid } from './meta-timestamp-policy.js';

export const config = { api: { bodyParser: false } };

function normalizedTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function rawMetaEnvelopeIdentityError(payload, expectedPhoneNumberId) {
  const expected = String(expectedPhoneNumberId || '').trim();
  if (!isMetaPhoneNumberId(expected)) return 'META_PHONE_NUMBER_NOT_CONFIGURED';
  for (const entry of payload?.entry || []) for (const change of entry?.changes || []) {
    const value = change?.value || {};
    const hasMessages = Array.isArray(value.messages) && value.messages.length > 0;
    const hasStatuses = Array.isArray(value.statuses) && value.statuses.length > 0;
    if (!hasMessages && !hasStatuses) continue;
    if (String(value?.metadata?.phone_number_id || '').trim() !== expected) return 'META_PHONE_NUMBER_MISMATCH';
  }
  return null;
}

function validMetaMessageIdentity(message) {
  const externalMessageId = String(message?.externalMessageId || '').trim();
  const channelKey = String(message?.channelKey || '').trim();
  const senderId = String(message?.senderId || '').trim();
  const senderLabel = String(message?.senderLabel || '');
  const messageType = String(message?.type || '');
  const text = String(message?.text || '');
  const quoted = message?.quotedExternalMessageId == null ? null : String(message.quotedExternalMessageId);
  const sourceTimestamp = message?.raw?.timestamp;
  return Boolean(
    externalMessageId && externalMessageId.length <= 320
    && isMetaPhoneNumberId(channelKey)
    && isE164(senderId)
    && senderLabel.length <= 220
    && messageType && messageType.length <= 80
    && text.length <= 4000
    && (quoted === null || quoted.length <= 320)
    && metaTimestampValid(sourceTimestamp)
    && normalizedTimestamp(message?.timestamp)
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const runtime = metaWebhookConfig();

  if (req.method === 'GET') {
    if (!runtime.ready) return res.status(503).json({ ok: false, error: 'webhook_not_configured' });
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    if (mode === 'subscribe' && safeEqual(token, runtime.verifyToken)) return res.status(200).send(String(challenge || ''));
    return res.status(403).json({ ok: false, error: 'verification_failed' });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!runtime.ready) return res.status(503).json({ ok: false, retryable: true, error: 'webhook_not_configured' });

  let raw;
  try {
    raw = await readRawBody(req);
  } catch (error) {
    if (error?.message === 'request_body_too_large') return res.status(413).json({ ok: false, retryable: false, error: 'request_body_too_large' });
    return res.status(400).json({ ok: false, retryable: false, error: 'request_body_invalid' });
  }

  const signature = String(req.headers['x-hub-signature-256'] || '').trim();
  if (!verifyMetaSignature(raw, signature, runtime.appSecret)) {
    return res.status(401).json({ ok: false, retryable: false, error: 'invalid_signature' });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ ok: false, retryable: false, error: 'invalid_json' });
  }

  const envelopeIdentityError = rawMetaEnvelopeIdentityError(payload, runtime.phoneNumberId);
  if (envelopeIdentityError) {
    return res.status(200).json({ ok: false, acknowledged: true, accepted: false, retryable: false, error: 'webhook_phone_number_mismatch' });
  }

  const messages = extractMetaMessages(payload);
  const validMessages = messages.filter((message) => validMetaMessageIdentity(message));
  const invalidMessages = messages.length - validMessages.length;
  if (validMessages.some((message) => String(message.channelKey) !== runtime.phoneNumberId)) {
    return res.status(200).json({ ok: false, acknowledged: true, accepted: false, retryable: false, error: 'webhook_phone_number_mismatch', received: messages.length, validMessages: validMessages.length, invalidMessages });
  }
  if (invalidMessages > 0) {
    return res.status(200).json({ ok: false, acknowledged: true, accepted: false, retryable: false, error: 'invalid_message_identity', received: messages.length, validMessages: validMessages.length, invalidMessages });
  }

  try {
    const upstream = await proxyCanonicalRequest({
      path: '/api/v1/hipico-bot/webhook',
      method: 'POST',
      headers: {
        'content-type': String(req.headers['content-type'] || 'application/json'),
        'x-hub-signature-256': signature
      },
      body: raw
    });
    return relayCanonicalResponse(res, upstream);
  } catch (error) {
    console.error('hipico canonical webhook proxy failed', { message: error?.message || String(error) });
    return res.status(503).json({ ok: false, retryable: true, error: 'canonical_backend_unavailable', invalidMessages: 0 });
  }
}

export const __test__ = {
  normalizedTimestamp,
  rawMetaEnvelopeIdentityError,
  validMetaMessageIdentity,
  metaWebhookConfig,
  metaTimestampValid
};
