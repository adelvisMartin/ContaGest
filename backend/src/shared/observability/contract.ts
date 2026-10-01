import { ZodError } from 'zod';
import { redactTelemetryValue, sanitizeLogValue } from './logger.js';

export const OBSERVABILITY_CONTRACT = Object.freeze({
  version: 1,
  correlationHeader: 'x-correlation-id',
  traceHeader: 'traceparent',
  errorEnvelopeVersion: 1,
  persistedErrorMaxLength: 320,
  sensitivePayloadRetention: 'forbidden' as const
});

export type ErrorClass =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limit'
  | 'dependency'
  | 'client'
  | 'internal';

export type NormalizedOperationalError = {
  status: number;
  code: string;
  errorClass: ErrorClass;
  safeMessage: string;
  retryable: boolean;
  internalType: string;
  internalCode?: string;
  details?: unknown;
};

const DEPENDENCY_CODES = new Set([
  'P1001',
  'P1002',
  'P2024',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EAI_AGAIN',
  'READINESS_DB_TIMEOUT'
]);

const FALLBACK_CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  423: 'LOCKED',
  429: 'RATE_LIMITED',
  502: 'DEPENDENCY_UNAVAILABLE',
  503: 'DEPENDENCY_UNAVAILABLE',
  504: 'DEPENDENCY_UNAVAILABLE'
};

function boundedStatus(value: unknown) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined;
}

function safeCode(value: unknown, fallback: string) {
  const sanitized = sanitizeLogValue(value, 80).replace(/[^A-Za-z0-9._:-]/g, '_');
  return sanitized || fallback;
}

function errorCode(error: any) {
  const nested = error?.details && typeof error.details === 'object'
    ? (error.details as Record<string, unknown>).code
    : undefined;
  return error?.code ?? nested;
}

function isDependencyError(error: any) {
  const code = safeCode(errorCode(error), '');
  if (DEPENDENCY_CODES.has(code)) return true;
  const message = String(error?.message || '');
  return /can['’]?t reach database server|timed out fetching a new connection|connection (?:refused|reset|timed out)|database_probe_timeout|upstream.*unavailable/i.test(message);
}

function errorClassForStatus(status: number): ErrorClass {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limit';
  if ([502, 503, 504].includes(status)) return 'dependency';
  if (status >= 500) return 'internal';
  return 'client';
}

function safePublicMessage(error: any, status: number, validation: boolean) {
  if (validation) return 'La solicitud contiene datos inválidos.';
  if (status >= 500) {
    if ([502, 503, 504].includes(status)) {
      return 'El servicio de datos no está disponible temporalmente. Intenta nuevamente en unos minutos.';
    }
    return 'Error interno del servidor.';
  }

  const redacted = redactTelemetryValue(error?.message || 'Solicitud rechazada.');
  const message = typeof redacted === 'string' ? sanitizeLogValue(redacted, 240) : '';
  return message || 'Solicitud rechazada.';
}

export function normalizeOperationalError(error: unknown): NormalizedOperationalError {
  const source: any = error instanceof Error || (error && typeof error === 'object')
    ? error
    : new Error('unknown error');
  const validation = source instanceof ZodError;
  const dependency = isDependencyError(source);
  const explicitStatus = boundedStatus(source?.status);
  const status = dependency ? 503 : validation ? 422 : explicitStatus || 500;
  const errorClass = validation ? 'validation' : errorClassForStatus(status);
  const fallbackCode = dependency
    ? 'DEPENDENCY_UNAVAILABLE'
    : validation
      ? 'VALIDATION_ERROR'
      : FALLBACK_CODE_BY_STATUS[status] || (status >= 500 ? 'INTERNAL_ERROR' : 'CLIENT_ERROR');
  const code = dependency ? 'DEPENDENCY_UNAVAILABLE' : safeCode(errorCode(source), fallbackCode);
  const internalCode = errorCode(source) ? safeCode(errorCode(source), fallbackCode) : undefined;
  const details = status < 500
    ? redactTelemetryValue(validation ? source.issues : source?.details)
    : undefined;

  return {
    status,
    code,
    errorClass,
    safeMessage: safePublicMessage(source, status, validation),
    retryable: status === 429 || [502, 503, 504].includes(status),
    internalType: safeCode(source?.name || 'Error', 'Error'),
    ...(internalCode ? { internalCode } : {}),
    ...(details === undefined ? {} : { details })
  };
}

export function buildErrorEnvelope(
  error: NormalizedOperationalError,
  context: { correlationId: string; requestId?: string }
) {
  const correlationId = sanitizeLogValue(context.correlationId, 96);
  const requestId = sanitizeLogValue(context.requestId || '', 96);
  return {
    ok: false as const,
    code: error.code,
    message: error.safeMessage,
    correlationId,
    ...(requestId ? { requestId } : {}),
    ...(error.details === undefined ? {} : { details: error.details })
  };
}

export function structuredErrorFields(error: NormalizedOperationalError) {
  return {
    status: error.status,
    errorClass: error.errorClass,
    errorCode: error.code,
    retryable: error.retryable,
    errorType: error.internalType,
    ...(error.internalCode ? { internalCode: error.internalCode } : {})
  };
}

export function safePersistedError(error: unknown) {
  if (error instanceof Error || (error && typeof error === 'object')) {
    const normalized = normalizeOperationalError(error);
    return sanitizeLogValue(`${normalized.code}: ${normalized.safeMessage}`, OBSERVABILITY_CONTRACT.persistedErrorMaxLength);
  }

  const redacted = redactTelemetryValue(error);
  const safe = typeof redacted === 'string' ? sanitizeLogValue(redacted, OBSERVABILITY_CONTRACT.persistedErrorMaxLength - 17) : '';
  return sanitizeLogValue(`OPERATION_ERROR: ${safe || 'unknown error'}`, OBSERVABILITY_CONTRACT.persistedErrorMaxLength);
}
