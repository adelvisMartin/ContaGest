const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function validateSoakHealthUrl(value: string): string {
  const raw = String(value || '').trim();
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) throw new Error('HIPICO_SOAK_HEALTH_URL_INVALID');
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error('HIPICO_SOAK_HEALTH_URL_INVALID'); }
  if (url.username || url.password || url.search || url.hash) throw new Error('HIPICO_SOAK_HEALTH_URL_UNSAFE_COMPONENTS');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname.toLowerCase()))) {
    throw new Error('HIPICO_SOAK_HEALTH_URL_INSECURE');
  }
  return url.toString();
}

export type SoakHealthResult = {
  ok: boolean;
  status: number;
  reason: 'READY_SHADOW' | 'HEALTH_HTTP_FAILURE' | 'HEALTH_BODY_INVALID' | 'HEALTH_NOT_READY' |
    'HEALTH_MODE_MISMATCH' | 'SOURCE_WRITE_POSSIBLE' | 'HEALTH_REQUEST_FAILED';
};

export function classifySoakHealth(status: number, body: unknown): SoakHealthResult {
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    return { ok: false, status, reason: 'HEALTH_HTTP_FAILURE' };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status, reason: 'HEALTH_BODY_INVALID' };
  }
  const value = body as Record<string, unknown>;
  if (value.sourceSendPossible !== false) {
    return { ok: false, status, reason: 'SOURCE_WRITE_POSSIBLE' };
  }
  if (value.mode !== 'shadow') {
    return { ok: false, status, reason: 'HEALTH_MODE_MISMATCH' };
  }
  if (value.ready !== true) {
    return { ok: false, status, reason: 'HEALTH_NOT_READY' };
  }
  return { ok: true, status, reason: 'READY_SHADOW' };
}

export async function probeSoakHealth(
  healthUrl: string,
  bridgeToken = '',
  request: typeof fetch = fetch
): Promise<SoakHealthResult> {
  const url = validateSoakHealthUrl(healthUrl);
  try {
    const response = await request(url, {
      method: 'GET',
      headers: bridgeToken ? { 'x-hipico-bridge-token': bridgeToken } : {},
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return classifySoakHealth(response.status, null);
    const body: unknown = await response.json().catch(() => null);
    return classifySoakHealth(response.status, body);
  } catch {
    // Never return a fetch error, URL, response body, or token in evidence.
    return { ok: false, status: 0, reason: 'HEALTH_REQUEST_FAILED' };
  }
}
