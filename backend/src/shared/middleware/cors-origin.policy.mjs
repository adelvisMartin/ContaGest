/**
 * CORS allowlist policy (#1364).
 * Browser Origin is a serialized scheme://host[:port], not a URL to parse
 * liberally. Reject any credentials, path, query or fragment before comparison.
 * CORS is NOT authentication; tenant/RBAC/session checks stay server-side.
 */
export function canonicalCorsOrigin(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  const raw = value.trim();
  if (!raw || /[\u0000-\u001f\u007f]/u.test(value)) return '';
  try {
    const url = new URL(raw);
    // Browser Origin is already serialized. Re-parsing can erase paths such as
    // /%2e%2e and /./, or strip an explicit default port or surrounding spaces.
    if (url.origin !== value ||
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.username || url.password || url.search || url.hash ||
        url.pathname !== '/') return '';
    return url.origin;
  } catch {
    return '';
  }
}
