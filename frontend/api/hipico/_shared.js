import crypto from 'node:crypto';

export function env(name, required = true) {
  const value = process.env[name];
  if (required && !value) throw new Error(`Missing server configuration: ${name}`);
  return value || '';
}

export async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function verifyMetaSignature(rawBody, header, appSecret) {
  if (!header || !appSecret || !String(header).startsWith('sha256=')) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const left = Buffer.from(String(header));
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

export async function supabase(path, init = {}) {
  const base = env('HIPICO_SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = env('HIPICO_SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

export function extractMetaMessages(payload) {
  const rows = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const channelKey = String(value?.metadata?.phone_number_id || 'meta');
      const contactNames = new Map((value?.contacts || []).map((c) => [String(c.wa_id || ''), c?.profile?.name || '']));
      for (const message of value?.messages || []) {
        const text = message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title || message?.interactive?.list_reply?.title || '';
        rows.push({
          channelKey,
          externalMessageId: String(message?.id || ''),
          senderId: String(message?.from || ''),
          senderLabel: contactNames.get(String(message?.from || '')) || '',
          timestamp: message?.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
          type: String(message?.type || 'unknown'),
          text: String(text || ''),
          quotedExternalMessageId: message?.context?.id ? String(message.context.id) : null,
          raw: message
        });
      }
    }
  }
  return rows;
}

export function classifyText(text) {
  const value = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (/NO MAS JUGAD|CARRERA CERRADA|CERRADO CERRADO/.test(value)) return ['race_close', 0.99];
  if (/ESTO ES TODO POR EL DIA DE HOY|CIERRE DE JORNADA/.test(value)) return ['day_close', 0.99];
  if (/\bLLEGADA\b|\bPIZARRA\s*:/.test(value)) return ['result', 0.97];
  if (/\bTERCIOS\b/.test(value) && /\bJUEGA\b/.test(value) && /\bCONSIGUE\b/.test(value) && /BS\.?\s*[+-]/.test(value)) return ['settlement_snapshot', 0.99];
  if (/\bTERCIO\s+DISPONIBLE\b/.test(value)) return ['balance_snapshot', 0.99];
  if (/\bTERCIOS\b/.test(value) && /\bJUEGA\b/.test(value)) return ['plan_snapshot', 0.98];
  if (/^(JUEGO|JUEGA|CONSIGO|CONSIGUE)\b/.test(value)) return ['offer', 0.90];
  if (/^(J|JUGANDO|SF|S\s*\/\s*F|SE FUE|DEBE CONFIRMAR|\d+(?:[.,]\d+)?\s*(K|MIL)?)$/.test(value)) return ['reply_review', 0.65];
  return ['other', 0.20];
}
