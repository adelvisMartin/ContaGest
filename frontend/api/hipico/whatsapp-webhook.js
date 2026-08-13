import { env, extractMetaMessages, readRawBody, sha256, supabase, verifyMetaSignature, classifyText } from './_shared.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    if (mode === 'subscribe' && token && token === env('HIPICO_META_VERIFY_TOKEN')) return res.status(200).send(String(challenge || ''));
    return res.status(403).json({ ok: false, error: 'verification_failed' });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const raw = await readRawBody(req);
    if (!verifyMetaSignature(raw, req.headers['x-hub-signature-256'], env('HIPICO_META_APP_SECRET'))) {
      return res.status(401).json({ ok: false, error: 'invalid_signature' });
    }
    const payload = JSON.parse(raw.toString('utf8'));
    const ownerId = env('HIPICO_OWNER_ID');
    const messages = extractMetaMessages(payload);
    let accepted = 0;
    for (const message of messages) {
      const [classification, confidence] = classifyText(message.text);
      const fingerprint = sha256(message.externalMessageId || `${message.channelKey}|${message.senderId}|${message.timestamp}|${message.text}|${message.quotedExternalMessageId || ''}`);
      const body = [{
        owner_id: ownerId,
        channel_key: message.channelKey,
        external_message_id: message.externalMessageId || null,
        fingerprint,
        sender_id: message.senderId || null,
        sender_label: message.senderLabel || null,
        quoted_external_message_id: message.quotedExternalMessageId,
        sent_at: message.timestamp,
        message_type: message.type,
        raw_text: message.text,
        classification,
        confidence,
        processing_status: classification === 'other' ? 'ignored' : classification === 'reply_review' ? 'review' : 'pending',
        normalized: { source: 'meta_cloud_api' },
        metadata: { raw_type: message.type }
      }];
      await supabase('hipico_messages?on_conflict=owner_id,channel_key,fingerprint', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(body)
      });
      accepted += 1;
    }
    return res.status(200).json({ ok: true, accepted });
  } catch (error) {
    console.error('hipico whatsapp webhook', error);
    return res.status(500).json({ ok: false, error: 'webhook_processing_failed' });
  }
}
