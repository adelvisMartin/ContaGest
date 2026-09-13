import { fetchWithTimeout, safeTimeoutMs } from './_shared.js';

const MAX_PROXY_RESPONSE_BYTES = 1024 * 1024;
const ALLOWED_PREFIXES = ['/api/v1/hipico/', '/api/v1/hipico-bot/'];

function productionLike(source) {
  return Boolean(String(source.VERCEL_ENV || '').trim()) || String(source.NODE_ENV || '').trim() === 'production';
}

function localhost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function canonicalBackendOrigin(source = process.env) {
  const explicit = String(source.HIPICO_CANONICAL_API_BASE_URL || '').trim();
  const vercelHost = String(source.VERCEL_URL || '').trim();
  const candidate = explicit || (vercelHost ? `https://${vercelHost}` : '');
  if (!candidate) {
    if (productionLike(source)) return '';
    const port = Number(source.HIPICO_BACKEND_PORT || 3030);
    const safePort = Number.isInteger(port) && port > 0 && port <= 65535 ? port : 3030;
    return `http://127.0.0.1:${safePort}`;
  }

  try {
    const url = new URL(candidate);
    if (url.username || url.password || url.search || url.hash) return '';
    if (url.pathname && url.pathname !== '/') return '';
    if (productionLike(source) && url.protocol !== 'https:') return '';
    if (!productionLike(source) && url.protocol === 'http:' && !localhost(url.hostname)) return '';
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function buildCanonicalUrl(path, source = process.env) {
  const origin = canonicalBackendOrigin(source);
  if (!origin) {
    throw Object.assign(new Error('HIPICO_CANONICAL_BACKEND_NOT_CONFIGURED'), {
      code: 'HIPICO_CANONICAL_BACKEND_NOT_CONFIGURED'
    });
  }
  const value = String(path || '').trim();
  if (!ALLOWED_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    throw Object.assign(new Error('HIPICO_CANONICAL_PATH_NOT_ALLOWED'), {
      code: 'HIPICO_CANONICAL_PATH_NOT_ALLOWED'
    });
  }
  const url = new URL(value, `${origin}/`);
  if (url.origin !== origin) {
    throw Object.assign(new Error('HIPICO_CANONICAL_PATH_NOT_ALLOWED'), {
      code: 'HIPICO_CANONICAL_PATH_NOT_ALLOWED'
    });
  }
  return url.toString();
}

export async function proxyCanonicalRequest({ path, method = 'GET', headers = {}, body = undefined, source = process.env }) {
  const url = buildCanonicalUrl(path, source);
  const timeoutMs = safeTimeoutMs(source.HIPICO_CANONICAL_API_TIMEOUT_MS, 10000);
  const response = await fetchWithTimeout(url, { method, redirect: 'error', headers, body }, timeoutMs);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_PROXY_RESPONSE_BYTES) {
    throw Object.assign(new Error('HIPICO_CANONICAL_RESPONSE_TOO_LARGE'), { code: 'HIPICO_CANONICAL_RESPONSE_TOO_LARGE' });
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_PROXY_RESPONSE_BYTES) {
    throw Object.assign(new Error('HIPICO_CANONICAL_RESPONSE_TOO_LARGE'), { code: 'HIPICO_CANONICAL_RESPONSE_TOO_LARGE' });
  }
  return {
    status: response.status,
    contentType: String(response.headers.get('content-type') || 'application/json; charset=utf-8'),
    retryAfter: response.headers.get('retry-after'),
    requestId: response.headers.get('x-request-id'),
    body: bytes
  };
}

export function relayCanonicalResponse(res, upstream) {
  res.statusCode = upstream.status;
  res.setHeader('Content-Type', upstream.contentType);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (upstream.retryAfter) res.setHeader('Retry-After', upstream.retryAfter);
  if (upstream.requestId) res.setHeader('X-Request-Id', upstream.requestId);
  return res.end(upstream.body);
}
