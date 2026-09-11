import crypto from 'node:crypto';

const DEFAULT_FETCH_TIMEOUT_MS = 10000;
const MAX_FETCH_TIMEOUT_MS = 60000;
const SHA40 = /^[a-f0-9]{40}$/i;
const PUBLIC_SECRET_PLACEHOLDER_PATTERN = /(?:REEMPLAZA|REPLACE|CHANGE[_-]?ME|CHANGEME|PLACEHOLDER|YOUR[_-]?(?:SECRET|TOKEN|KEY)|TU[_-]?(?:SECRETO|TOKEN|CLAVE)|EXAMPLE[_-]?(?:SECRET|TOKEN|KEY))/i;
export const MIN_HIPICO_INTERNAL_SECRET_LENGTH = 32;

export function env(name, required = true) {
  const value = process.env[name];
  if (required && !value) throw new Error(`Missing server configuration: ${name}`);
  return value || '';
}

export function strongSecretConfigured(value, minLength = MIN_HIPICO_INTERNAL_SECRET_LENGTH) {
  const minimum = Number.isInteger(minLength) && minLength > 0 ? minLength : MIN_HIPICO_INTERNAL_SECRET_LENGTH;
  const secret = String(value || '').trim();
  if (Buffer.byteLength(secret, 'utf8') < minimum) return false;
  if (PUBLIC_SECRET_PLACEHOLDER_PATTERN.test(secret)) return false;
  return true;
}

export function serverSecret(name, minLength = MIN_HIPICO_INTERNAL_SECRET_LENGTH) {
  const value = String(env(name) || '').trim();
  if (!strongSecretConfigured(value, minLength)) throw new Error(`Weak server configuration: ${name}`);
  return value;
}

export function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

export function bearerTokenValid(header, expected) {
  const value = String(header || '');
  return value.startsWith('Bearer ') && safeEqual(value.slice(7), expected);
}

export function isE164(value) {
  return /^\+?[1-9]\d{6,14}$/.test(String(value || '').trim());
}

export function isMetaPhoneNumberId(value) {
  return /^\d{5,30}$/.test(String(value || '').trim());
}

export function metaTimestampIso(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizedE164(value) {
  const raw = String(value || '').trim();
  return isE164(raw) ? raw.replace(/^\+/, '') : null;
}

function metaAllowedDestinations(source = process.env) {
  return new Set(String(source.HIPICO_META_ALLOWED_DESTINATIONS || '')
    .split(',')
    .map(normalizedE164)
    .filter(Boolean));
}

export function metaOutboundPolicy(source = process.env) {
  const runtimeSha = String(source.VERCEL_GIT_COMMIT_SHA || source.GIT_SHA || '').trim();
  const approvedSha = String(source.HIPICO_META_SEND_CANDIDATE_SHA || '').trim();
  const destinations = metaAllowedDestinations(source);
  const reasons = [];
  if (String(source.HIPICO_META_SEND_ENABLED || '').toLowerCase() !== 'true') reasons.push('SEND_SWITCH_DISABLED');
  if (String(source.HIPICO_WHATSAPP_COMPLIANCE_DECISION || '').toUpperCase() !== 'GO') reasons.push('WHATSAPP_COMPLIANCE_NOT_GO');
  if (!String(source.HIPICO_META_SEND_APPROVED_BY || '').trim()) reasons.push('EXPLICIT_APPROVAL_MISSING');
  if (!SHA40.test(runtimeSha) || !SHA40.test(approvedSha) || runtimeSha.toLowerCase() !== approvedSha.toLowerCase()) reasons.push('CANDIDATE_SHA_NOT_BOUND');
  if (!destinations.size) reasons.push('DESTINATION_ALLOWLIST_EMPTY');
  return { enabled: reasons.length === 0, reasons, allowedDestinationCount: destinations.size, runtimeShaBound: !reasons.includes('CANDIDATE_SHA_NOT_BOUND') };
}

export function metaDestinationAllowed(value, source = process.env) {
  const normalized = normalizedE164(value);
  return Boolean(normalized && metaAllowedDestinations(source).has(normalized));
}

export async function readRawBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > maxBytes) throw new Error('request_body_too_large');
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function verifyMetaSignature(rawBody, header, appSecret) {
  if (!header || !appSecret || !String(header).startsWith('sha256=')) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  return safeEqual(header, expected);
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

export function safeTimeoutMs(value, fallback = DEFAULT_FETCH_TIMEOUT_MS) {
  const fallbackValue = Number(fallback);
  const safeFallback = Number.isFinite(fallbackValue) && fallbackValue > 0
    ? Math.min(Math.floor(fallbackValue), MAX_FETCH_TIMEOUT_MS)
    : DEFAULT_FETCH_TIMEOUT_MS;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return safeFallback;
  return Math.min(Math.floor(number), MAX_FETCH_TIMEOUT_MS);
}

export async function fetchWithTimeout(url, init = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const timer = setTimeout(() => controller.abort(), safeTimeoutMs(timeoutMs));
  const abort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', abort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener?.('abort', abort);
  }
}

export async function supabase(path, init = {}) {
  const base = env('HIPICO_SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = env('HIPICO_SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetchWithTimeout(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  }, safeTimeoutMs(process.env.HIPICO_SUPABASE_TIMEOUT_MS));
  const text = await response.text();
  if (!response.ok) {
    const requestId = response.headers.get('x-request-id') || response.headers.get('sb-request-id') || '';
    throw new Error(`Supabase ${response.status}${requestId ? ` request=${requestId}` : ''}`);
  }
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
          timestamp: metaTimestampIso(message?.timestamp),
          type: String(message?.type || 'unknown'),
          text: String(text || '').slice(0, 4000),
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
