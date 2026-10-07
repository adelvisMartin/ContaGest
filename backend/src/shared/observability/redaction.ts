const REDACTION_CENSOR = '[REDACTED]';
const MAX_REDACTION_DEPTH = 6;
const MAX_REDACTION_ITEMS = 64;

const SENSITIVE_FIELD = /(authorization|cookie|password|passphrase|secret|token|api[-_]?key|clientsecret|email|rif|phone|fullname|clinical|subjective|objective|assessment|diagnosis|allergies|conditions|medical|notes|prompt|payload|message(content|text)?)/i;
const SIGNED_QUERY_PARAM = /(token|access_token|refresh_token|api_?key|key|secret|sig|signature|x-amz-signature|x-amz-credential|x-goog-signature|x-goog-credential)/i;

export function sanitizeLogValue(value: unknown, maxLength = 240) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function redactSensitiveString(value: string) {
  const sanitized = sanitizeLogValue(value, 2_000)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(/\b(password|passphrase|secret|token|api[-_]?key)\s*[:=]\s*[^\s,;&]+/gi, '$1=[REDACTED]');

  return sanitized.replace(/([?&])([^=&#\s]+)=([^&#\s]*)/g, (match, separator, rawKey) => {
    let key = String(rawKey);
    try { key = decodeURIComponent(key); } catch { /* keep raw key */ }
    return SIGNED_QUERY_PARAM.test(key)
      ? `${separator}${rawKey}=[REDACTED]`
      : match;
  });
}

export function redactTelemetryValue(value: unknown): unknown {
  const seen = new WeakSet<object>();

  const visit = (current: unknown, depth: number): unknown => {
    if (current === null || current === undefined) return current;
    if (typeof current === 'string') return redactSensitiveString(current);
    if (typeof current === 'number') return Number.isFinite(current) ? current : null;
    if (typeof current === 'boolean') return current;
    if (typeof current === 'bigint') return current.toString();
    if (current instanceof Date) return current.toISOString();
    if (depth >= MAX_REDACTION_DEPTH) return '[TRUNCATED]';
    if (typeof current !== 'object') return sanitizeLogValue(current, 240);
    if (seen.has(current as object)) return '[CIRCULAR]';
    seen.add(current as object);

    if (Array.isArray(current)) {
      return current.slice(0, MAX_REDACTION_ITEMS).map((item) => visit(item, depth + 1));
    }

    const output: Record<string, unknown> = {};
    for (const [rawKey, nested] of Object.entries(current as Record<string, unknown>).slice(0, MAX_REDACTION_ITEMS)) {
      const key = sanitizeLogValue(rawKey, 80);
      if (!key) continue;
      output[key] = SENSITIVE_FIELD.test(key) ? REDACTION_CENSOR : visit(nested, depth + 1);
    }
    return output;
  };

  return visit(value, 0);
}

export const __redactionTest__ = { SENSITIVE_FIELD, SIGNED_QUERY_PARAM };
