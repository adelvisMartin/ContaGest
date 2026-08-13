import { env, supabase } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const expected = env('HIPICO_INTERNAL_API_TOKEN');
  if (req.headers.authorization !== `Bearer ${expected}`) return res.status(401).json({ ok: false, error: 'unauthorized' });

  try {
    const ownerId = env('HIPICO_OWNER_ID');
    const rows = await supabase(`hipico_outbox?owner_id=eq.${encodeURIComponent(ownerId)}&status=in.(queued,retry)&next_attempt_at=lte.${encodeURIComponent(new Date().toISOString())}&order=created_at.asc&limit=10`, {
      headers: { Prefer: 'return=representation' }
    }) || [];
    if (!rows.length) return res.status(200).json({ ok: true, processed: 0 });

    const accessToken = env('HIPICO_META_ACCESS_TOKEN');
    const phoneNumberId = env('HIPICO_META_PHONE_NUMBER_ID');
    let sent = 0;
    for (const row of rows) {
      const text = String(row?.payload?.text || '').trim();
      if (!text) continue;
      try {
        const response = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: row.destination, type: 'text', text: { preview_url: false, body: text } })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(JSON.stringify(data).slice(0, 500));
        await supabase(`hipico_outbox?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'sent', attempts: Number(row.attempts || 0) + 1, external_message_id: data?.messages?.[0]?.id || null, sent_at: new Date().toISOString(), last_error: null })
        });
        sent += 1;
      } catch (error) {
        const attempts = Number(row.attempts || 0) + 1;
        const retryMinutes = Math.min(60, Math.max(1, 2 ** Math.min(attempts, 5)));
        await supabase(`hipico_outbox?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: attempts >= 6 ? 'failed' : 'retry', attempts, next_attempt_at: new Date(Date.now() + retryMinutes * 60000).toISOString(), last_error: String(error.message || error).slice(0, 1000) })
        });
      }
    }
    return res.status(200).json({ ok: true, processed: rows.length, sent });
  } catch (error) {
    console.error('hipico whatsapp send', error);
    return res.status(500).json({ ok: false, error: 'send_failed' });
  }
}
