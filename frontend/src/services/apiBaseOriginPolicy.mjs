const API_PATH = '/api/v1';

function approvedHttpsOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '';
    return url.origin;
  } catch {
    return '';
  }
}

/** An application setting cannot grant a new origin permission to receive API data. */
export function resolveApprovedApiBase(value, {
  fallback = API_PATH,
  currentOrigin = '',
  configuredOrigins = [],
  development = false,
  native = false
} = {}) {
  // HTTP production documents cannot safely issue credentialed API requests.
  if (!development && !native && currentOrigin && !approvedHttpsOrigin(currentOrigin)) return '';
  const allowed = new Set(configuredOrigins.map(approvedHttpsOrigin).filter(Boolean));

  function resolve(candidate) {
    const raw = String(candidate || '').trim().replace(/\/$/, '');
    if (raw === API_PATH) return native && !development ? '' : API_PATH;
    let url;
    try { url = new URL(raw); } catch { return ''; }
    if (url.username || url.password || url.search || url.hash || url.pathname !== API_PATH) return '';
    if (development && ['localhost', '127.0.0.1'].includes(url.hostname)
      && ['http:', 'https:'].includes(url.protocol)) return url.origin + API_PATH;
    if (url.protocol !== 'https:') return '';
    if (!allowed.has(url.origin) && !(url.origin === currentOrigin && !native)) return '';
    return url.origin + API_PATH;
  }

  return resolve(value) || resolve(fallback) || (native ? '' : API_PATH);
}

/** Legacy sync may use the API origin root, but cannot choose a new host from browser settings. */
export function resolveApprovedSyncBase(value, options = {}) {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (raw === API_PATH) {
    return resolveApprovedApiBase(raw, { ...options, fallback: '' }) === raw ? raw : '';
  }
  let url;
  try { url = new URL(raw); } catch { return ''; }
  if (url.username || url.password || url.search || url.hash ||
      !['/', API_PATH].includes(url.pathname)) return '';
  const canonicalApi = url.origin + API_PATH;
  if (resolveApprovedApiBase(canonicalApi, { ...options, fallback: '' }) !== canonicalApi) return '';
  return url.origin + (url.pathname === API_PATH ? API_PATH : '');
}
