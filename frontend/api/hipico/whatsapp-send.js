import { bearerTokenValid, env, fetchWithTimeout, isE164, metaDestinationAllowed, metaOutboundPolicy, supabase } from './_shared.js';

const MAX_ATTEMPTS = 6;
const BATCH_SIZE = 10;

function nextRetryIso(attempts) {
  const retryMinutes = Math.min(60, Math.max(1, 2 ** Math.min(attempts, 5)));
  return new Date(Date.now() + retryMinutes * 60000).toISOString();
}

async function claimRow(row) {
  const ownerId = env('HIPICO_OWNER_ID');
  const expectedStatus = String(row.status || 'queued');
  const expectedNext = String(row.next_attempt_at || '');
  const filters = [
    `id=eq.${encodeURIComponent(row.id)}`,
    `owner_id=eq.${encodeURIComponent(ownerId)}`,
    `status=eq.${encodeURIComponent(expectedStatus)}`
  ];
  if (expectedNext) filters.push(`next_attempt_at=eq.${encodeURIComponent(expectedNext)}`);
  const claimed = await supabase(`hipico_outbox?${filters.join('&')}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'sending', last_error: null })
  });
  return Array.isArray(claimed) ? claimed[0] || null : null;
}

async function updateRow(id, patch) {
  const ownerId = env('HIPICO_OWNER_ID');
  const rows = await supabase(`hipico_outbox?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}&status=eq.sending`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch)
  });
  const updated = Array.isArray(rows) ? rows[0] || null : null;
  if (!updated?.id) throw new Error('HIPICO_OUTBOX_STATE_TRANSITION_NOT_PERSISTED');
  return updated;
}

function safeGraphVersion() {
  const configured = String(process.env.HIPICO_META_GRAPH_VERSION || 'v23.0').trim();
  return /^v\d+\.\d+$/.test(configured) ? configured : 'v23.0';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, retryable: false, error: 'method_not_allowed' });

  let expected;
  try {
    expected = env('HIPICO_INTERNAL_API_TOKEN');
  } catch {
    return res.status(503).json({ ok: false, retryable: true, error: 'sender_not_configured' });
  }
  if (!bearerTokenValid(req.headers.authorization, expected)) return res.status(401).json({ ok: false, retryable: false, error: 'unauthorized' });

  const outbound = metaOutboundPolicy();
  if (!outbound.enabled) {
    return res.status(409).json({ ok: false, retryable: false, error: 'outbound_disabled', reasons: outbound.reasons });
  }

  try {
    const ownerId = env('HIPICO_OWNER_ID');
    const now = new Date().toISOString();
    const rows = await supabase(`hipico_outbox?owner_id=eq.${encodeURIComponent(ownerId)}&status=in.(queued,retry)&next_attempt_at=lte.${encodeURIComponent(now)}&order=created_at.asc&limit=${BATCH_SIZE}`, {
      headers: { Prefer: 'return=representation' }
    }) || [];
    if (!rows.length) return res.status(200).json({ ok: true, processed: 0, sent: 0, failed: 0, retried: 0, skippedClaims: 0 });

    const accessToken = env('HIPICO_META_ACCESS_TOKEN');
    const phoneNumberId = env('HIPICO_META_PHONE_NUMBER_ID');
    const graphVersion = safeGraphVersion();
    let sent = 0;
    let failed = 0;
    let retried = 0;
    let skippedClaims = 0;

    for (const candidate of rows) {
      const row = await claimRow(candidate);
      if (!row) {
        skippedClaims += 1;
        continue;
      }

      const attempts = Number(row.attempts || 0) + 1;
      const text = String(row?.payload?.text || '').trim();
      const destination = String(row.destination || '').trim();
      if (!text || text.length > 4000 || !isE164(destination) || !metaDestinationAllowed(destination)) {
        await updateRow(row.id, {
          status: 'failed',
          attempts,
          last_error: !text ? 'EMPTY_MESSAGE' : text.length > 4000 ? 'MESSAGE_TOO_LARGE' : !isE164(destination) ? 'INVALID_DESTINATION' : 'DESTINATION_NOT_ALLOWLISTED'
        });
        failed += 1;
        continue;
      }

      let response;
      try {
        response = await fetchWithTimeout(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: destination.replace(/^\+/, ''),
            type: 'text',
            text: { preview_url: false, body: text }
          })
        }, Number(process.env.HIPICO_META_SEND_TIMEOUT_MS || 12000));
      } catch (error) {
        // A transport timeout can happen after Meta accepted the message. Never auto-retry
        // an ambiguous delivery because that can duplicate a financial communication.
        await updateRow(row.id, {
          status: 'failed',
          attempts,
          last_error: `AMBIGUOUS_TRANSPORT_FAILURE:${String(error?.name || 'network_error').slice(0, 120)}`
        });
        failed += 1;
        continue;
      }

      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }

      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        const exhausted = attempts >= MAX_ATTEMPTS;
        await updateRow(row.id, {
          status: retryable && !exhausted ? 'retry' : 'failed',
          attempts,
          next_attempt_at: retryable && !exhausted ? nextRetryIso(attempts) : row.next_attempt_at,
          last_error: `META_HTTP_${response.status}`
        });
        if (retryable && !exhausted) retried += 1;
        else failed += 1;
        continue;
      }

      const providerMessageId = data?.messages?.[0]?.id || null;
      if (!providerMessageId) {
        await updateRow(row.id, { status: 'failed', attempts, last_error: 'META_SUCCESS_WITHOUT_MESSAGE_ID' });
        failed += 1;
        continue;
      }

      // Once Meta confirms acceptance, this row is never eligible for automatic resend.
      // If this persistence update fails the row remains `sending`, which intentionally
      // requires operator reconciliation instead of risking a duplicate message.
      await updateRow(row.id, {
        status: 'sent',
        attempts,
        external_message_id: providerMessageId,
        sent_at: new Date().toISOString(),
        last_error: null
      });
      sent += 1;
    }

    return res.status(200).json({ ok: true, processed: rows.length, sent, failed, retried, skippedClaims });
  } catch (error) {
    console.error('hipico whatsapp send', { message: error?.message || String(error) });
    return res.status(503).json({ ok: false, retryable: true, error: 'send_unavailable' });
  }
}
