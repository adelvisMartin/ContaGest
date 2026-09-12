import { fetchWithTimeout, safeTimeoutMs } from './_shared.js';

const ALLOWED_PREFIXES = ['/api/v1/hipico', '/api/v1/hipico-bot'];
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED_FORWARD_HEADERS = new Set([
  'content-type',
  'x-hub-signature-256',
  'x-hipico-bridge-token',
  'x-hipico-operator-token',
  'x-hipico-group-key',
  'authorization'
]);

function normalizeOrigin(value) {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    if (url.protocol === 'http:' && !loopback) return '';
    if (url.username || url.password || url.hash || url.search || (url.pathname && url.pathname !== '/')) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function canonicalBackendOrigin(source = process.env) {
  const configured = normalizeOrigin(source.HIPICO_CANONICAL_API_BASE_URL);
  if (!configured) return '';
  const vercelHost = String(source.VERCEL_URL || '').trim().toLowerCase();
  if (vercelHost) {
    try {
      const configuredHost = new URL(configured).host.toLowerCase();
      if (configuredHost === vercelHost) return '';
    } catch { return ''; }
  }
  return configured;
}

export function canonicalPathAllowed(path) {
  const value = String(path || '');
  if (!value.startsWith('/') || value.includes('\\') || /[\r\n]/.test(value)) return false;
  let parsed;
  try { parsed = new URL(value, 'https://hipico.invalid'); } catch { return false; }
  if (parsed.origin !== 'https://hipico.invalid') return false;
  const pathname = parsed.pathname;
  return ALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function buildCanonicalUrl(path, source = process.env) {
  if (!canonicalPathAllowed(path)) throw new Error('HIPICO_CANONICAL_PATH_NOT_ALLOWED');
  const origin = canonicalBackendOrigin(source);
  if (!origin) throw new Error('HIPICO_CANONICAL_BACKEND_NOT_CONFIGURED');
  return `${origin}${String(path)}`;
}

export async function proxyCanonicalRequest({ path, method = 'GET', headers = {}, body, source = process.env, timeoutMs } = {}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(normalizedMethod)) throw new Error('HIPICO_CANONICAL_METHOD_NOT_ALLOWED');
  const url = buildCanonicalUrl(path, source);
  const outboundHeaders = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const normalized = String(key || '').trim().toLowerCase();
    if (!ALLOWED_FORWARD_HEADERS.has(normalized)) continue;
    const text = String(value ?? '').trim();
    if (text && text.length <= 8192) outboundHeaders[normalized] = text;
  }
  return fetchWithTimeout(url, {
    method: normalizedMethod,
    headers: outboundHeaders,
    ...(body === undefined || normalizedMethod === 'GET' ? {} : { body })
  }, safeTimeoutMs(timeoutMs ?? source.HIPICO_CANONICAL_FETCH_TIMEOUT_MS));
}

export async function relayCanonicalResponse(res, upstream) {
  const status = Number(upstream?.status || 502);
  const contentType = String(upstream?.headers?.get?.('content-type') || '').trim();
  const retryAfter = String(upstream?.headers?.get?.('retry-after') || '').trim();
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (contentType && contentType.length <= 200) res.setHeader('Content-Type', contentType);
  if (retryAfter && retryAfter.length <= 100) res.setHeader('Retry-After', retryAfter);
  const data = Buffer.from(await upstream.arrayBuffer());
  return res.status(status).send(data);
}

export const __test__ = { normalizeOrigin, ALLOWED_PREFIXES, ALLOWED_METHODS, ALLOWED_FORWARD_HEADERS };
