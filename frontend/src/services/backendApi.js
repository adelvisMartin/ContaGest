import { AuthSession } from './authSession.js';

const API_BASE_KEY = 'contagest_api_base_url';
const isBrowser = typeof window !== 'undefined';
const isDevelopmentHost = isBrowser && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const ENV_API_BASE = import.meta?.env?.VITE_API_BASE_URL || '';
const SAME_ORIGIN_API_BASE = '/api/v1';
const DEFAULT_API_BASE = (ENV_API_BASE || (isDevelopmentHost ? 'http://localhost:3030/api/v1' : SAME_ORIGIN_API_BASE)).replace(/\/$/, '');
let refreshInFlight = null;
let authExpiredSignalled = false;
const financialInFlightKeys = new Map();

function normalizeBaseUrl(value) {
  const candidate = String(value || DEFAULT_API_BASE).trim().replace(/\/$/, '');
  if (!isBrowser) return candidate;
  if (!isDevelopmentHost && /localhost|127\.0\.0\.1/i.test(candidate)) return DEFAULT_API_BASE;
  return candidate || DEFAULT_API_BASE;
}

function storedBaseUrl() {
  if (typeof localStorage === 'undefined') return DEFAULT_API_BASE;
  const stored = localStorage.getItem(API_BASE_KEY);
  const normalized = normalizeBaseUrl(stored || DEFAULT_API_BASE);
  if (normalized === DEFAULT_API_BASE && stored && /localhost|127\.0\.0\.1/i.test(stored)) {
    localStorage.removeItem(API_BASE_KEY);
  }
  return normalized;
}

function cleanPayload(value) {
  if (Array.isArray(value)) return value.map(cleanPayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== '' && item !== undefined && item !== null)
      .map(([key, item]) => [key, cleanPayload(item)])
  );
}

function stableRequestValue(value) {
  if (Array.isArray(value)) return value.map(stableRequestValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableRequestValue(value[key])]));
}

function normalizedFinancialPath(path) {
  return String(path || '').split('?')[0].replace(/^\/api\/v1/, '');
}

function needsFinancialIdempotency(method, path, body) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const normalized = normalizedFinancialPath(path);
  if (normalizedMethod === 'POST') {
    if (normalized === '/banking/movements' || normalized === '/accounting/entries') return true;
    if (normalized === '/sales' || normalized === '/purchases') return String(body?.status || 'issued') !== 'draft';
  }
  if (normalizedMethod === 'PATCH' && /^\/(sales|purchases)\/[^/]+\/cancel$/.test(normalized)) return true;
  return false;
}

function createFinancialIdempotencyKey() {
  if (!isBrowser || !globalThis.crypto) return '';
  if (typeof globalThis.crypto.randomUUID === 'function') return `cg-${globalThis.crypto.randomUUID()}`;
  if (typeof globalThis.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    return `cg-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
  }
  return '';
}

function financialRequestSignature(method, path, body) {
  return `${String(method || 'GET').toUpperCase()}:${normalizedFinancialPath(path)}:${JSON.stringify(stableRequestValue(body))}`;
}

function acquireFinancialIdempotencyKey(signature) {
  const existing = financialInFlightKeys.get(signature);
  if (existing) {
    existing.refs += 1;
    return existing.key;
  }
  const key = createFinancialIdempotencyKey();
  if (key) financialInFlightKeys.set(signature, { key, refs:1 });
  return key;
}

function releaseFinancialIdempotencyKey(signature, key) {
  if (!signature || !key) return;
  const existing = financialInFlightKeys.get(signature);
  if (!existing || existing.key !== key) return;
  existing.refs -= 1;
  if (existing.refs <= 0) financialInFlightKeys.delete(signature);
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json().catch(() => ({}));
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { message: text || `HTTP ${response.status}` }; }
}

function isPublicRequest(path) {
  const normalized = String(path || '').split('?')[0];
  return normalized === '/health'
    || normalized === '/auth/captcha'
    || normalized === '/auth/login'
    || normalized === '/auth/register'
    || normalized === '/auth/login/coordinates'
    || normalized.startsWith('/auth/password/');
}

function apiError(message, status, payload) {
  const error = new Error(message);
  error.status = status;
  error.payload = payload;
  return error;
}

function cookieValue(...names) {
  if (typeof document === 'undefined') return '';
  const cookies = Object.fromEntries(document.cookie.split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    const key = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    try { return [key, decodeURIComponent(raw)]; }
    catch { return [key, raw]; }
  }).filter(([key]) => key));
  for (const name of names) if (cookies[name]) return cookies[name];
  return '';
}

function csrfToken() {
  return cookieValue('__Host-cg_csrf', 'cg_csrf');
}

function isUnsafeMethod(method = 'GET') {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase());
}

function sameOriginFallback(baseUrl) {
  if (!isBrowser || isDevelopmentHost) return '';
  const normalized = String(baseUrl || '');
  if (normalized === SAME_ORIGIN_API_BASE || normalized.endsWith(SAME_ORIGIN_API_BASE) && normalized.startsWith(window.location.origin)) return '';
  return SAME_ORIGIN_API_BASE;
}

function markAuthHealthy() {
  authExpiredSignalled = false;
}

function expireBrowserSession(reason = 'session_expired') {
  const hadSession = Boolean(AuthSession.get()?.tenantId);
  AuthSession.clear();
  if (!isBrowser || !hadSession || authExpiredSignalled) return;
  authExpiredSignalled = true;
  window.dispatchEvent(new CustomEvent('cg:auth-expired', { detail:{ reason } }));
}

function signalLegalAcceptanceRequired(path, payload = {}) {
  if (!isBrowser || String(path || '').startsWith('/legal/')) return;
  window.dispatchEvent(new CustomEvent('cg:legal-required', {
    detail: {
      path: String(path || ''),
      pendingCodes: Array.isArray(payload?.pendingCodes) ? payload.pendingCodes : []
    }
  }));
}

async function fetchApi(baseUrl, path, options) {
  try {
    return await fetch(`${baseUrl}${path}`, options);
  } catch (error) {
    const fallback = sameOriginFallback(baseUrl);
    if (!fallback) throw error;
    localStorage.removeItem(API_BASE_KEY);
    return fetch(`${fallback}${path}`, options);
  }
}

async function refreshCookieSession(api) {
  const csrf = csrfToken();
  if (!csrf) throw apiError('La sesión no se puede renovar sin token CSRF.', 401, {});
  const response = await fetchApi(api.baseUrl, '/auth/refresh', {
    method:'POST',
    credentials:'include',
    headers:{ 'x-csrf-token':csrf }
  });
  const payload = await parseResponse(response);
  if (!response.ok || payload.ok === false) throw apiError(payload.message || payload.error || 'No se pudo renovar la sesión.', response.status, payload);
  const data = payload.data ?? payload;
  if (data?.tenantId) AuthSession.set(data);
  markAuthHealthy();
  return data;
}

function refreshCookieSessionSingleFlight(api) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = refreshCookieSession(api).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export const BackendApi = {
  get baseUrl() { return storedBaseUrl(); },
  setBaseUrl(url) {
    if (typeof localStorage === 'undefined') return;
    const normalized = normalizeBaseUrl(url);
    if (!url || normalized === DEFAULT_API_BASE) localStorage.removeItem(API_BASE_KEY);
    else localStorage.setItem(API_BASE_KEY, normalized);
  },
  resetBaseUrl() {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(API_BASE_KEY);
  },
  get tenantId() { return AuthSession.tenantId(); },
  setTenantId() { return false; },
  get isReady() { return Boolean(this.baseUrl && AuthSession.isAuthenticated()); },
  get authHeaders() { return {}; },

  async request(path, options = {}) {
    const { noAuth = false, raw = false, skipRefresh = false, headers: customHeaders = {}, ...fetchOptions } = options;
    const publicRequest = noAuth || isPublicRequest(path);
    const method = String(fetchOptions.method || 'GET').toUpperCase();
    const rawBody = fetchOptions.body;
    const isFormData = typeof FormData !== 'undefined' && rawBody instanceof FormData;
    const isBlob = typeof Blob !== 'undefined' && rawBody instanceof Blob;
    const isArrayBuffer = typeof ArrayBuffer !== 'undefined' && rawBody instanceof ArrayBuffer;
    const isArrayBufferView = typeof ArrayBuffer !== 'undefined' && rawBody && ArrayBuffer.isView(rawBody);
    const isBinaryBody = isBlob || isArrayBuffer || isArrayBufferView;
    const cleanedBody = rawBody && typeof rawBody !== 'string' && !isFormData && !isBinaryBody ? cleanPayload(rawBody) : rawBody;
    const body = cleanedBody && typeof cleanedBody !== 'string' && !isFormData && !isBinaryBody
      ? JSON.stringify(cleanedBody)
      : cleanedBody;
    const csrf = isUnsafeMethod(method) && !publicRequest ? csrfToken() : '';
    const explicitIdempotencyKey = customHeaders['Idempotency-Key'] || customHeaders['idempotency-key'] || '';
    const shouldProtect = !explicitIdempotencyKey && needsFinancialIdempotency(method, path, cleanedBody);
    const idempotencySignature = shouldProtect ? financialRequestSignature(method, path, cleanedBody) : '';
    const generatedIdempotencyKey = shouldProtect ? acquireFinancialIdempotencyKey(idempotencySignature) : '';
    const idempotencyKey = explicitIdempotencyKey || generatedIdempotencyKey;
    const headers = {
      ...(!isFormData && !isBinaryBody && body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(csrf ? { 'x-csrf-token':csrf } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key':idempotencyKey } : {}),
      ...customHeaders
    };
    const requestOptions = {
      ...fetchOptions,
      method,
      credentials:'include',
      headers,
      body
    };

    try {
      let response;
      try {
        response = await fetchApi(this.baseUrl, path, requestOptions);
      } catch (error) {
        if (idempotencyKey) {
          try {
            response = await fetchApi(this.baseUrl, path, requestOptions);
          } catch (retryError) {
            throw apiError('No se pudo conectar con la API. Revisa la conexión y vuelve a intentar.', 0, { cause:String(retryError?.message || retryError), idempotent:true });
          }
        } else {
          throw apiError('No se pudo conectar con la API. Revisa la conexión y vuelve a intentar.', 0, { cause:String(error?.message || error) });
        }
      }

      if (response.status === 401 && !publicRequest && !skipRefresh && path !== '/auth/refresh') {
        try {
          await refreshCookieSessionSingleFlight(this);
          const nextCsrf = isUnsafeMethod(method) ? csrfToken() : '';
          response = await fetchApi(this.baseUrl, path, {
            ...requestOptions,
            headers:{ ...headers, ...(nextCsrf ? { 'x-csrf-token':nextCsrf } : {}) }
          });
        } catch (error) {
          expireBrowserSession(error?.message || 'refresh_failed');
        }
      }

      if (raw) {
        if (!response.ok) {
          const payload = await parseResponse(response);
          if (response.status === 401 && !publicRequest) expireBrowserSession(payload.message || payload.error || 'unauthorized');
          if (response.status === 428 && !publicRequest) signalLegalAcceptanceRequired(path, payload);
          throw apiError(payload.message || payload.error || `HTTP ${response.status}`, response.status, payload);
        }
        return response;
      }

      const payload = await parseResponse(response);
      if (!response.ok || payload.ok === false) {
        if (response.status === 401 && !publicRequest) expireBrowserSession(payload.message || payload.error || 'unauthorized');
        if (response.status === 428 && !publicRequest) signalLegalAcceptanceRequired(path, payload);
        throw apiError(payload.message || payload.error || `HTTP ${response.status}`, response.status, payload);
      }
      const data = payload.data ?? payload;
      if (String(path).startsWith('/auth/') && data?.tenantId && data?.sessionMode) {
        AuthSession.set(data);
        markAuthHealthy();
      }
      return data;
    } finally {
      if (generatedIdempotencyKey) releaseFinancialIdempotencyKey(idempotencySignature, generatedIdempotencyKey);
    }
  },

  list(resource, q = '') { return this.request(`/${resource}${q ? `?q=${encodeURIComponent(q)}` : ''}`); },
  create(resource, data) { return this.request(`/${resource}`, { method: 'POST', body: data }); },
  update(resource, id, data) { return this.request(`/${resource}/${id}`, { method: 'PUT', body: data }); },
  remove(resource, id) { return this.request(`/${resource}/${id}`, { method: 'DELETE' }); },
  get(path) { return this.request(path); },
  post(path, data) { return this.request(path.replace(/^\/api\/v1/, ''), { method: 'POST', body: data }); },
  put(path, data) { return this.request(path.replace(/^\/api\/v1/, ''), { method: 'PUT', body: data }); },
  patch(path, data) { return this.request(path.replace(/^\/api\/v1/, ''), { method: 'PATCH', body: data }); },
  delete(path) { return this.request(path.replace(/^\/api\/v1/, ''), { method: 'DELETE' }); },
  health() { return this.request('/health', { noAuth: true }); },
  cleanPayload
};
