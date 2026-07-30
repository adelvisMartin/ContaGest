import { AuthSession } from './authSession.js';

const API_BASE_KEY = 'contagest_api_base_url';
const isBrowser = typeof window !== 'undefined';
const isDevelopmentHost = isBrowser && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const ENV_API_BASE = import.meta?.env?.VITE_API_BASE_URL || '';
const DEFAULT_API_BASE = (ENV_API_BASE || (isDevelopmentHost ? 'http://localhost:3030/api/v1' : '/api/v1')).replace(/\/$/, '');

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
    || normalized.startsWith('/auth/password/');
}

function apiError(message, status, payload) {
  const error = new Error(message);
  error.status = status;
  error.payload = payload;
  return error;
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
  get authHeaders() { return AuthSession.authHeaders(); },

  async request(path, options = {}) {
    const { noAuth = false, raw = false, headers: customHeaders = {}, ...fetchOptions } = options;
    const publicRequest = noAuth || isPublicRequest(path);
    const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
    const body = fetchOptions.body && typeof fetchOptions.body !== 'string' && !isFormData
      ? JSON.stringify(cleanPayload(fetchOptions.body))
      : fetchOptions.body;
    const headers = {
      ...(!isFormData && body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(publicRequest ? {} : AuthSession.authHeaders()),
      ...customHeaders
    };

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...fetchOptions,
      headers,
      body
    });

    if (raw) {
      if (!response.ok) {
        const payload = await parseResponse(response);
        if (response.status === 401 && !publicRequest) AuthSession.clear();
        throw apiError(payload.message || payload.error || `HTTP ${response.status}`, response.status, payload);
      }
      return response;
    }

    const payload = await parseResponse(response);
    if (!response.ok || payload.ok === false) {
      if (response.status === 401 && !publicRequest) AuthSession.clear();
      throw apiError(payload.message || payload.error || `HTTP ${response.status}`, response.status, payload);
    }
    return payload.data ?? payload;
  },

  list(resource, q = '') { return this.request(`/${resource}${q ? `?q=${encodeURIComponent(q)}` : ''}`); },
  create(resource, data) { return this.request(`/${resource}`, { method: 'POST', body: data }); },
  update(resource, id, data) { return this.request(`/${resource}/${id}`, { method: 'PUT', body: data }); },
  remove(resource, id) { return this.request(`/${resource}/${id}`, { method: 'DELETE' }); },
  get(path) { return this.request(path); },
  post(path, data) { return this.request(path.replace(/^\/api\/v1/, ''), { method: 'POST', body: data }); },
  put(path, data) { return this.request(path.replace(/^\/api\/v1/, ''), { method: 'PUT', body: data }); },
  delete(path) { return this.request(path.replace(/^\/api\/v1/, ''), { method: 'DELETE' }); },
  health() { return this.request('/health', { noAuth: true }); },
  cleanPayload
};
