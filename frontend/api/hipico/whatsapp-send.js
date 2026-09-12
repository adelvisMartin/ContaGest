import { bearerTokenValid, env, fetchWithTimeout, isE164, metaDestinationAllowed, metaOutboundPolicy, retryAfterMs, serverSecret, supabase } from './_shared.js';
import { metaSenderConfig } from './meta-runtime.js';

const MAX_ATTEMPTS = 6;
const BATCH_SIZE = 10;
const SEND_LEASE_MS = 2 * 60 * 1000;
const STALE_CLAIM_SCAN_LIMIT = 50;

function nextRetryIso(attempts, retryAfterHeader = '', nowMs = Date.now()) {
  const retryMinutes = Math.min(60, Math.max(1, 2 ** Math.min(attempts, 5)));
  const localWaitMs = retryMinutes * 60000;
  const parsedNow = Number(nowMs);
  const safeNow = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  const providerWaitMs = retryAfterMs(retryAfterHeader, safeNow);
  return new Date(safeNow + Math.max(localWaitMs, providerWaitMs)).toISOString();
}

function sendLeaseExpiryIso(nowMs = Date.now()) {
  const parsed = Number(nowMs);
  const safeNow = Number.isFinite(parsed) ? parsed : Date.now();
  return new Date(safeNow + SEND_LEASE_MS).toISOString();
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
    body: JSON.stringify({ status: 'sending', next_attempt_at: sendLeaseExpiryIso(), last_error: null })
  });
  return Array.isArray(claimed) ? claimed[0] || null : null;
}

async function quarantineExpiredSendingClaims(nowIso = new Date().toISOString()) {
  const ownerId = env('HIPICO_OWNER_ID');
  const stale = await supabase(
    `hipico_outbox?owner_id=eq.${encodeURIComponent(ownerId)}&status=eq.sending&next_attempt_at=lte.${encodeURIComponent(nowIso)}&order=next_attempt_at.asc&limit=${STALE_CLAIM_SCAN_LIMIT}`,
    { headers: { Prefer: 'return=representation' } }
  ) || [];
  let quarantined = 0;
  for (const row of stale) {
    const expectedNext = String(row.next_attempt_at || '');
    if (!row?.id || !expectedNext) continue;
    const updated = await supabase(
      `hipico_outbox?id=eq.${encodeURIComponent(row.id)}&owner_id=eq.${encodeURIComponent(ownerId)}&status=eq.sending&next_attempt_at=eq.${encodeURIComponent(expectedNext)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'reconciliation_required',
          last_error: 'RECONCILIATION_REQUIRED:STALE_SENDING_LEASE'
        })
      }
    );
    if (Array.isArray(updated) && updated[0]?.id) quarantined += 1;
  }
  return quarantined;
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
    expected = serverSecret('HIPICO_INTERNAL_API_TOKEN');
  } catch {
    return res.status(503).json({ ok: false, retryable: true, error: 'sender_not_configured' });
  }
  if (!bearerTokenValid(req.headers.authorization, expected)) return res.status(401).json({ ok: false, retryable: false, error: 'unauthorized' });

  const outbound = metaOutboundPolicy();
  if (!outbound.enabled) {
    return res.status(409).json({ ok: false, retryable: false, error: 'outbound_disabled', reasons: outbound.reasons });
  }

  const senderConfig=metaSenderConfig();
  if(!senderConfig.ready){
    return res.status(503).json({ok:false,retryable:true,error:'sender_not_configured'});
  }
  const {accessToken,phoneNumberId}=senderConfig;

  try {
    const ownerId = env('HIPICO_OWNER_ID');
    const now = new Date().toISOString();
    const staleSendingQuarantined = await quarantineExpiredSendingClaims(now);
    const rows = await supabase(`hipico_outbox?owner_id=eq.${encodeURIComponent(ownerId)}&status=in.(queued,retry)&next_attempt_at=lte.${encodeURIComponent(now)}&order=created_at.asc&limit=${BATCH_SIZE}`, {
      headers: { Prefer: 'return=representation' }
    }) || [];
    if (!rows.length) return res.status(200).json({ ok: true, processed: 0, sent: 0, failed: 0, retried: 0, reconciliationRequired: 0, staleSendingQuarantined, skippedClaims: 0 });

    const graphVersion = safeGraphVersion();
    let sent = 0;
    let failed = 0;
    let retried = 0;
    let reconciliationRequired = 0;
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
        await updateRow(row.id, {
          status: 'reconciliation_required',
          attempts,
          last_error: `RECONCILIATION_REQUIRED:AMBIGUOUS_TRANSPORT_FAILURE:${String(error?.name || 'network_error').slice(0, 120)}`
        });
        reconciliationRequired += 1;
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
          next_attempt_at: retryable && !exhausted ? nextRetryIso(attempts, response.headers.get('retry-after')) : row.next_attempt_at,
          last_error: `META_HTTP_${response.status}`
        });
        if (retryable && !exhausted) retried += 1;
        else failed += 1;
        continue;
      }

      const providerMessageId = data?.messages?.[0]?.id || null;
      if (!providerMessageId) {
        await updateRow(row.id, {
          status: 'reconciliation_required',
          attempts,
          last_error: 'RECONCILIATION_REQUIRED:META_SUCCESS_WITHOUT_MESSAGE_ID'
        });
        reconciliationRequired += 1;
        continue;
      }

      await updateRow(row.id, {
        status: 'sent',
        attempts,
        external_message_id: providerMessageId,
        sent_at: new Date().toISOString(),
        last_error: null
      });
      sent += 1;
    }

    return res.status(200).json({ ok: true, processed: rows.length, sent, failed, retried, reconciliationRequired, staleSendingQuarantined, skippedClaims });
  } catch (error) {
    console.error('hipico whatsapp send', { message: error?.message || String(error) });
    return res.status(503).json({ ok: false, retryable: true, error: 'send_unavailable' });
  }
}

export const __test__={safeGraphVersion,metaSenderConfig,nextRetryIso,sendLeaseExpiryIso,quarantineExpiredSendingClaims,SEND_LEASE_MS,STALE_CLAIM_SCAN_LIMIT};
