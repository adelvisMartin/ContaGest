const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

function parseLoopbackHttpUrl(raw) {
  try {
    const url = new URL(raw);
    if (!HTTP_PROTOCOLS.has(url.protocol) || !LOOPBACK_HOSTNAMES.has(url.hostname) ||
        url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** Fail closed before any lab navigation or request interception. */
export function assertLocalLabOrigin(rawBaseUrl) {
  const origin = parseLoopbackHttpUrl(rawBaseUrl);
  if (!origin) throw new Error('PERF1293_REMOTE_ORIGIN_FORBIDDEN');
  return origin.origin;
}

/** Network requests must target exactly the tested local frontend origin. */
export function isAllowedLabRequest(rawRequestUrl, allowedOrigin) {
  const request = parseLoopbackHttpUrl(rawRequestUrl);
  const base = parseLoopbackHttpUrl(allowedOrigin);
  return Boolean(request && base && request.origin === base.origin);
}
