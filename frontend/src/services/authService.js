import { AuthSession } from './authSession.js';
import { BackendApi } from './backendApi.js';

const DEMO_USER = {
  id: 'demo-admin',
  name: 'Administrador Local',
  fullName: 'Administrador Local',
  email: 'admin@erp.local',
  role: 'sysadmin',
  permissions: ['*']
};

const demoModeEnabled = () => import.meta?.env?.DEV === true && import.meta?.env?.VITE_ENABLE_DEMO_MODE === 'true';

function normalizeSession(payload) {
  const tenantId = payload?.tenantId || payload?.tenant?.id;
  if (!payload?.token || !tenantId) throw new Error('El backend no devolvió una sesión firmada completa.');
  return AuthSession.set({
    token: payload.token,
    tenantId,
    tenant: payload.tenant || null,
    user: payload.user || null,
    expiresAt: payload.expiresAt || Date.now() + 1000 * 60 * 60 * 8,
    mode: 'api'
  });
}

export const AuthService = {
  getSession() { return AuthSession.get(); },
  isAuthenticated() { return AuthSession.isAuthenticated(); },
  isDemoEnabled() { return demoModeEnabled(); },

  async captcha() {
    return BackendApi.request('/auth/captcha', { noAuth: true });
  },

  async login({ email, password, tenantRif = '00000000', captchaToken = '', captchaAnswer = '', mode = 'api' }) {
    if (mode === 'demo') {
      if (!demoModeEnabled()) throw new Error('El modo demo local está deshabilitado en esta compilación.');
      if (!email || !password) throw new Error('Ingresa email y contraseña.');
      return AuthSession.set({
        token: `demo.${Date.now()}`,
        user: { ...DEMO_USER, email },
        tenantId: 'demo-tenant',
        tenant: { id: 'demo-tenant', name: 'Demo local', rif: '00000000', plan: 'development' },
        expiresAt: Date.now() + 1000 * 60 * 60 * 8,
        mode: 'demo'
      });
    }

    const payload = await BackendApi.request('/auth/login', {
      method: 'POST',
      noAuth: true,
      body: { email, password, tenantRif, captchaToken, captchaAnswer }
    });
    return normalizeSession(payload);
  },

  async register({ tenantRif, tenantName, legalName, fullName, email, password, captchaToken = '', captchaAnswer = '' }) {
    const payload = await BackendApi.request('/auth/register', {
      method: 'POST',
      noAuth: true,
      body: { tenantRif, tenantName, legalName, fullName, email, password, captchaToken, captchaAnswer }
    });
    return normalizeSession(payload);
  },

  async me() {
    return BackendApi.request('/auth/me');
  },

  async refresh() {
    const payload = await BackendApi.request('/auth/refresh', { method: 'POST' });
    return normalizeSession(payload);
  },

  logout() {
    AuthSession.clear();
  },

  authHeaders() {
    return AuthSession.authHeaders();
  }
};
