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
  if (!tenantId) return null;
  const sessionMode = session.sessionMode || (session.mode === 'demo' ? 'demo' : 'cookie');
  const accessExpiresAt = Number(session.accessExpiresAt || session.expiresAt || 0) || null;
  const sessionExpiry = session.sessionExpiresAt ? Date.parse(session.sessionExpiresAt) : 0;
  const expiresAt = Number(sessionMode === 'cookie' && sessionExpiry ? sessionExpiry : accessExpiresAt) || null;

  // Never persist a production bearer/access token. HttpOnly cookies are the browser credential.
  const { token: _discardedToken, ...safe } = session;
  return {
    ...safe,
    sessionMode,
    mode: sessionMode,
    tenantId,
    accessExpiresAt,
    expiresAt
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
    const raw = parse(localStorage.getItem(AUTH_SESSION_KEY));
    const session = normalize(raw) || migrateLegacySession();
    if (!session) return null;
    // Rewrite any legacy object that still contained a bearer token.
    if (raw?.token) localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    if (session.expiresAt && session.expiresAt <= Date.now()) {
      this.clear();
      return null;
    }
    return session;
  },

  set(session) {
    const normalized = normalize(session);
    if (!normalized) throw new Error('La sesión recibida no contiene una empresa activa.');
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
    return null;
  },

  tenantId() {
    return this.get()?.tenantId || null;
  },

  isAuthenticated() {
    return Boolean(this.get()?.tenantId);
  },

  authHeaders() {
    return {};
  }
};
