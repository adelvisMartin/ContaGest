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

// Session storage is UI metadata only; credentials belong to HttpOnly cookies or native Keystore.
const CREDENTIAL_FIELD = /(?:token$|password(?:hash)?$|passphrase$|secret$|(?:api|private|device|license|session|signing|secret)(?:private)?key$|^jwt$|^authorization$|^cookies?$|^credentials?$)/i;

function stripCredentials(value, redaction) {
  if (Array.isArray(value)) return value.map((item) => stripCredentials(item, redaction));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (CREDENTIAL_FIELD.test(key.replace(/[_-]/g, ''))) {
      redaction.removed = true;
      return [];
    }
    return [[key, stripCredentials(item, redaction)]];
  }));
}

function normalize(session, redaction = { removed: false }) {
  if (!session || typeof session !== 'object') return null;
  const tenantId = session.tenantId || session.tenant?.id || null;
  if (!tenantId) return null;
  const sessionMode = session.sessionMode || (session.mode === 'demo' ? 'demo' : 'cookie');
  const accessExpiresAt = Number(session.accessExpiresAt || session.expiresAt || 0) || null;
  const sessionExpiry = session.sessionExpiresAt ? Date.parse(session.sessionExpiresAt) : 0;
  const expiresAt = Number(sessionMode === 'cookie' && sessionExpiry ? sessionExpiry : accessExpiresAt) || null;

  const safe = stripCredentials(session, redaction);
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
    const stored = localStorage.getItem(AUTH_SESSION_KEY);
    const raw = parse(stored);
    const redaction = { removed: false };
    const session = normalize(raw, redaction) || migrateLegacySession();
    if (!session) {
      if (stored) localStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
    // Evict credential-bearing legacy snapshots, including nested token fields.
    if (redaction.removed) localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
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
