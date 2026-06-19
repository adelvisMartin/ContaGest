const API_BASE_KEY = 'contagest_api_base_url';
const TENANT_KEY = 'contagest_tenant_id';
const DEFAULT_API_BASE = (import.meta?.env?.VITE_API_BASE_URL || 'http://localhost:3030/api/v1').replace(/\/$/, '');
const DEFAULT_TENANT_ID = 'demo-tenant';
const AUTH_KEY = 'contagest_auth_session_v6';

function getAuthSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); }
  catch { return null; }
}

function authHeaders() {
  const session = getAuthSession();
  return {
    ...(session?.token && !String(session.token).startsWith('demo.') ? { Authorization: `Bearer ${session.token}` } : {}),
    ...(session?.tenantId ? { 'x-tenant-id': session.tenantId } : {})
  };
}

function cleanPayload(value) {
  if (Array.isArray(value)) return value.map(cleanPayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== '' && v !== undefined && v !== null)
      .map(([k, v]) => [k, cleanPayload(v)])
  );
}

async function parseResponse(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { message: text || `HTTP ${res.status}` }; }
}

export const BackendApi = {
  get baseUrl() { return localStorage.getItem(API_BASE_KEY) || DEFAULT_API_BASE; },
  setBaseUrl(url) { localStorage.setItem(API_BASE_KEY, String(url || DEFAULT_API_BASE).replace(/\/$/, '')); },
  get tenantId() { return localStorage.getItem(TENANT_KEY) || DEFAULT_TENANT_ID; },
  setTenantId(id) { localStorage.setItem(TENANT_KEY, String(id || DEFAULT_TENANT_ID)); },
  get isReady() { return Boolean(this.baseUrl && this.tenantId); },
  async request(path, options = {}) {
    const noAuth = options.noAuth === true || String(path).startsWith('/auth/login') || String(path).startsWith('/auth/register');
    const body = options.body && typeof options.body !== 'string' ? JSON.stringify(cleanPayload(options.body)) : options.body;
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(this.tenantId ? { 'x-tenant-id': this.tenantId } : {}),
        ...(noAuth ? {} : authHeaders()),
        ...(options.headers || {})
      },
      body
    });
    const json = await parseResponse(res);
    if (!res.ok || json.ok === false) {
      const message = json.message || json.error || `HTTP ${res.status}`;
      throw new Error(message);
    }
    return json.data ?? json;
  },
  list(resource, q='') { return this.request(`/${resource}${q ? `?q=${encodeURIComponent(q)}` : ''}`); },
  create(resource, data) { return this.request(`/${resource}`, { method:'POST', body:data }); },
  update(resource, id, data) { return this.request(`/${resource}/${id}`, { method:'PUT', body:data }); },
  remove(resource, id) { return this.request(`/${resource}/${id}`, { method:'DELETE' }); },
  get(path) { return this.request(path); },
  post(path, data) { return this.request(path.replace(/^\/api\/v1/, ''), { method:'POST', body:data }); },
  put(path, data) { return this.request(path.replace(/^\/api\/v1/, ''), { method:'PUT', body:data }); },
  delete(path) { return this.request(path.replace(/^\/api\/v1/, ''), { method:'DELETE' }); },
  health() { return this.request('/health'); },
  cleanPayload
};
