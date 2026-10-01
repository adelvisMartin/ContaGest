const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/;

function safeReference(value) {
  const candidate = String(value || '').trim().slice(0, 96);
  return SAFE_REFERENCE.test(candidate) ? candidate : '';
}

function safeMessage(value, status) {
  return String(value || `HTTP ${status}`)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240) || `HTTP ${status}`;
}

async function responseError(response) {
  let payload = {};
  try { payload = await response.json(); } catch { /* bounded fallback below */ }
  const correlationId = safeReference(payload?.correlationId || response.headers.get('x-correlation-id'));
  const requestId = safeReference(payload?.requestId || response.headers.get('x-request-id'));
  const reference = correlationId || requestId;
  const message = safeMessage(payload?.message || payload?.error, response.status);
  const error = new Error(reference ? `${message} Referencia: ${reference}` : message);
  error.status = response.status;
  error.code = String(payload?.code || '').replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 80) || undefined;
  error.correlationId = correlationId || undefined;
  error.requestId = requestId || undefined;
  return error;
}

export async function apiGet(baseUrl, path) {
  const base = (baseUrl || '').replace(/\/$/, '');
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function apiPost(baseUrl, path, body) {
  const base = (baseUrl || '').replace(/\/$/, '');
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw await responseError(response);
  return response.json();
}
