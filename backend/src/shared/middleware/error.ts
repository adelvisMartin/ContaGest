import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../http.js';
import { requestLogger, requestRouteTemplate, sanitizeLogValue } from '../observability/logger.js';

function databaseError(error: Error) {
  const msg = String(error.message || '');
  if (msg.includes("Can't reach database server") || msg.includes('Timed out fetching a new connection') || msg.includes('P1001') || msg.includes('P2024')) {
    return {
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Servicio de datos temporalmente no disponible.',
      retryable: true
    };
  }
  return null;
}

export function notFound(req: Request, res: Response) {
  const requestId = sanitizeLogValue((req as any).requestId || '', 96);
  res.status(404).json({
    ok: false,
    code: 'ROUTE_NOT_FOUND',
    message: 'Ruta no encontrada.',
    requestId,
    retryable: false
  });
}

export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction) {
  const db = databaseError(error);
  const validation = error instanceof ZodError;
  const http = error instanceof HttpError ? error : null;
  const status = db?.status || http?.status || (validation ? 422 : 500);
  const requestId = sanitizeLogValue((req as any).requestId || '', 96);
  const rawCode = db?.code || http?.code || (validation ? 'VALIDATION_ERROR' : ((error as any)?.code || 'INTERNAL_ERROR'));
  const code = sanitizeLogValue(rawCode, 80) || 'INTERNAL_ERROR';
  const retryable = db?.retryable ?? http?.retryable ?? [429, 502, 503, 504].includes(status);

  const logFields = {
    event: 'http.error',
    requestId: requestId || undefined,
    route: requestRouteTemplate(req),
    method: sanitizeLogValue(req.method || 'UNKNOWN', 12).toUpperCase(),
    status,
    errorType: sanitizeLogValue(error?.name || 'Error', 80),
    errorCode: code
  };
  if (status >= 500) requestLogger(req).error(logFields, 'request failed');
  else requestLogger(req).warn(logFields, 'request rejected');

  const payload: Record<string, unknown> = {
    ok: false,
    code,
    message: validation
      ? 'La solicitud contiene datos inválidos.'
      : (db?.message || (http ? http.message : 'Error interno del servidor.')),
    requestId,
    retryable
  };
  if (validation) payload.details = error.issues;
  if (http?.details) payload.details = http.details;
  res.status(status).json(payload);
}
