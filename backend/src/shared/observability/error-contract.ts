import { sanitizeLogValue } from './logger.js';
import { redactSensitiveText } from './sensitive.js';

const SENSITIVE_DETAIL_KEY = /(authorization|cookie|password|passphrase|token|secret|api[-_]?key|clientsecret|smtp|email|phone|rif|session|signed[-_]?url|url)/i;
const MAX_DETAIL_DEPTH = 4;
const MAX_DETAIL_KEYS = 32;
const MAX_DETAIL_ITEMS = 32;

function safeDetailValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DETAIL_DEPTH) return undefined;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return redactSensitiveText(value, 240);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_DETAIL_ITEMS)
      .map((item) => safeDetailValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof value === 'object' && value) {
    const output: Record<string, unknown> = {};
    for (const [rawKey, rawValue] of Object.entries(value).slice(0, MAX_DETAIL_KEYS)) {
      const key = sanitizeLogValue(rawKey, 80);
      if (!key || SENSITIVE_DETAIL_KEY.test(key)) continue;
      const safeValue = safeDetailValue(rawValue, depth + 1);
      if (safeValue !== undefined) output[key] = safeValue;
    }
    return output;
  }

  return undefined;
}

export function safePublicErrorDetails(value: unknown) {
  if (value === undefined) return undefined;
  return safeDetailValue(value, 0);
}

export function errorCorrelation(req: any) {
  return {
    requestId: sanitizeLogValue(req?.requestId || '', 96),
    correlationId: sanitizeLogValue(req?.correlationId || req?.telemetry?.correlationId || '', 96)
  };
}

export function publicErrorEnvelope(
  req: any,
  message: string,
  options: { code?: unknown; details?: unknown } = {}
) {
  const { requestId, correlationId } = errorCorrelation(req);
  const code = options.code ? sanitizeLogValue(options.code, 80) : '';
  const details = safePublicErrorDetails(options.details);

  return {
    ok: false as const,
    message: redactSensitiveText(message || 'Error interno del servidor.', 500) || 'Error interno del servidor.',
    requestId,
    correlationId,
    ...(code ? { code } : {}),
    ...(details === undefined ? {} : { details })
  };
}

export const __test__ = { SENSITIVE_DETAIL_KEY, MAX_DETAIL_DEPTH, MAX_DETAIL_KEYS, MAX_DETAIL_ITEMS };
