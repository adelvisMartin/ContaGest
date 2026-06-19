import { Storage } from './storage.js';
import { BackendApi } from './backendApi.js';

const AUTH_KEY = 'contagest_auth_session_v11';
const DEMO_USER = { id: 'demo-admin', name: 'Administrador Local', fullName: 'Administrador Local', email: 'admin@erp.local', role: 'sysadmin', permissions: ['*'] };

function normalizeSession(payload, fallback = {}) {
  const tenantId = payload.tenantId || payload.tenant?.id || fallback.tenantId || 'demo-tenant';
  BackendApi.setTenantId(tenantId);
  return {
    token: payload.token,
    tenantId,
    tenant: payload.tenant || null,
    user: payload.user || DEMO_USER,
    expiresAt: payload.expiresAt || Date.now() + 1000 * 60 * 60 * 8,
    mode: payload.mode || 'api'
  };
}

export const AuthService = {
  getSession() { return Storage.get(AUTH_KEY, null); },
  isAuthenticated() {
    const session = this.getSession();
    return Boolean(session?.token && (!session.expiresAt || session.expiresAt > Date.now()));
  },
  async captcha() {
    return BackendApi.request('/auth/captcha', { noAuth: true });
  },
  async login({ email, password, tenantRif = '00000000', captchaToken = '', captchaAnswer = '', mode = 'api' }) {
    if (mode === 'api') {
      const payload = await BackendApi.request('/auth/login', {
        method: 'POST',
        body: { email, password, tenantRif, captchaToken, captchaAnswer }
      });
      const session = normalizeSession(payload);
      Storage.set(AUTH_KEY, session);
      return session;
    }
    if (!email || !password) throw new Error('Ingresa email y contraseña.');
    const session = { token: `demo.${Date.now()}`, user: { ...DEMO_USER, email }, tenantId: 'demo-tenant', expiresAt: Date.now() + 1000 * 60 * 60 * 8, mode:'demo' };
    BackendApi.setTenantId(session.tenantId);
    Storage.set(AUTH_KEY, session);
    return session;
  },
  async register({ tenantRif, tenantName, legalName, fullName, email, password, captchaToken = '', captchaAnswer = '' }) {
    const payload = await BackendApi.request('/auth/register', {
      method: 'POST',
      body: { tenantRif, tenantName, legalName, fullName, email, password, captchaToken, captchaAnswer }
    });
    const session = normalizeSession(payload);
    Storage.set(AUTH_KEY, session);
    return session;
  },
  async me() {
    const payload = await BackendApi.request('/auth/me');
    return payload;
  },
  logout() {
    Storage.remove(AUTH_KEY);
  },
  authHeaders() {
    const session = this.getSession();
    return session?.token && !String(session.token).startsWith('demo.') ? { Authorization: `Bearer ${session.token}`, 'x-tenant-id': session.tenantId || 'demo-tenant' } : { 'x-tenant-id': session?.tenantId || 'demo-tenant' };
  }
};
