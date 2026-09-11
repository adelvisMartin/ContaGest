import crypto from 'node:crypto';

const DEFAULT_FETCH_TIMEOUT_MS = 10000;
const MAX_FETCH_TIMEOUT_MS = 60000;
const SHA40 = /^[a-f0-9]{40}$/i;
export const MIN_HIPICO_INTERNAL_SECRET_LENGTH = 32;
export const PUBLIC_SECRET_PLACEHOLDER_PATTERN = /(?:REEMPLAZA|REPLACE|CHANGE[_-]?ME|CHANGEME|PLACEHOLDER|YOUR[_-]?(?:SECRET|TOKEN|KEY)|TU[_-]?(?:SECRETO|TOKEN|CLAVE)|EXAMPLE[_-]?(?:SECRET|TOKEN|KEY))/i;

export function env(name, required = true) {
  const value = process.env[name];
  if (required && !value) throw new Error(`Missing server configuration: ${name}`);
  return value || '';
}

export function strongSecretConfigured(value, minLength = MIN_HIPICO_INTERNAL_SECRET_LENGTH) {
  const minimum = Number.isInteger(minLength) && minLength > 0 ? minLength : MIN_HIPICO_INTERNAL_SECRET_LENGTH;
  const secret=String(value || '').trim();
  return Buffer.byteLength(secret, 'utf8') >= minimum && !PUBLIC_SECRET_PLACEHOLDER_PATTERN.test(secret);
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
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(MAX_FETCH_TIMEOUT_MS, Math.max(100, Math.trunc(number)));
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const bounded = safeTimeoutMs(timeoutMs);
  return fetch(url, { ...options, signal: AbortSignal.timeout(bounded) });
}

export async function supabase(path, options = {}) {
  const base = env('HIPICO_SUPABASE_URL').replace(/\/$/, '');
  const key = serverSecret('HIPICO_SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetchWithTimeout(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  }, Number(process.env.HIPICO_SUPABASE_TIMEOUT_MS || DEFAULT_FETCH_TIMEOUT_MS));
  if (!response.ok) throw Object.assign(new Error(`Supabase HTTP ${response.status}`), { status: response.status });
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function metaTimestamp(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,12}$/.test(raw)) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const milliseconds = seconds * 1000;
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

export function extractMetaMessages(payload) {
  const rows = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const channelKey = String(value?.metadata?.phone_number_id || 'meta').trim() || 'meta';
      const contactNames = new Map((value?.contacts || []).map((contact) => [String(contact?.wa_id || ''), String(contact?.profile?.name || '')]));
      for (const message of value?.messages || []) {
        const text = message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title || message?.interactive?.list_reply?.title || message?.document?.caption || message?.document?.filename || message?.image?.caption || message?.video?.caption || '';
        rows.push({
          channelKey,
          externalMessageId: String(message?.id || ''),
          senderId: String(message?.from || ''),
          senderLabel: contactNames.get(String(message?.from || '')) || '',
          timestamp: metaTimestamp(message?.timestamp),
          type: String(message?.type || 'unknown').trim().toLowerCase() || 'unknown',
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

export function adapterCaptureDecision(text) {
  const [hintClassification, hintConfidence] = classifyText(text);
  return {
    storedClassification: 'unclassified',
    storedConfidence: 0,
    processingStatus: 'review',
    domainAuthority: 'backend_canonical_only',
    adapterHintAuthoritative: false,
    adapterHint: { classification: hintClassification, confidence: hintConfidence }
  };
}
