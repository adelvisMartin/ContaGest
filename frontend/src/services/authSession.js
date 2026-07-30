const AUTH_SESSION_KEY = 'contagest_auth_session';
const LEGACY_AUTH_KEYS = [
  'contagest_auth_session_v11',
  'contagest_auth_session_v6'
];
const LEGACY_TENANT_KEY = 'contagest_tenant_id';

function storageAvailable() {
  return typeof localStorage !== 'undefined';
}

function parse(value) {
  try { return value ? JSON.parse(value) : null; }
  catch { return null; }
}

function normalize(session) {
  if (!session || typeof session !== 'object') return null;
  const tenantId = session.tenantId || session.tenant?.id || null;
  const token = typeof session.token === 'string' ? session.token.trim() : '';
  if (!token || !tenantId) return null;
  return {
    ...session,
    token,
    tenantId,
    expiresAt: Number(session.expiresAt || 0) || null,
    mode: session.mode || 'api'
  };
}

function removeLegacyKeys() {
  if (!storageAvailable()) return;
  LEGACY_AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(LEGACY_TENANT_KEY);
}

function migrateLegacySession() {
  if (!storageAvailable()) return null;
  for (const key of LEGACY_AUTH_KEYS) {
    const session = normalize(parse(localStorage.getItem(key)));
    if (session) {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
      removeLegacyKeys();
      return session;
    }
  }
  removeLegacyKeys();
  return null;
}

export const AuthSession = {
  key: AUTH_SESSION_KEY,

  get() {
    if (!storageAvailable()) return null;
    const session = normalize(parse(localStorage.getItem(AUTH_SESSION_KEY))) || migrateLegacySession();
    if (!session) return null;
    if (session.expiresAt && session.expiresAt <= Date.now()) {
      this.clear();
      return null;
    }
    return session;
  },

  set(session) {
    const normalized = normalize(session);
    if (!normalized) throw new Error('La sesión recibida no contiene token y tenant firmados.');
    if (!storageAvailable()) return normalized;
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(normalized));
    removeLegacyKeys();
    return normalized;
  },

  clear() {
    if (!storageAvailable()) return;
    localStorage.removeItem(AUTH_SESSION_KEY);
    removeLegacyKeys();
  },

  token() {
    return this.get()?.token || null;
  },

  tenantId() {
    return this.get()?.tenantId || null;
  },

  isAuthenticated() {
    return Boolean(this.get()?.token);
  },

  authHeaders() {
    const token = this.token();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
};
