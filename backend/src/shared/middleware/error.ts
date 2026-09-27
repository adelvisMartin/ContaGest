import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../http.js';
import { requestLogger, requestRouteTemplate, sanitizeLogValue } from '../observability/logger.js';

function databaseMessage(error: Error) {
  const msg = String(error.message || '');
  if (msg.includes("Can't reach database server") || msg.includes('Timed out fetching a new connection') || msg.includes('P1001') || msg.includes('P2024')) {
    return {
      status: 503,
      message: 'El servicio de datos no está disponible temporalmente. Intenta nuevamente en unos minutos.'
    };
  }
  return null;
}

function httpErrorCode(error: Error) {
  const direct = (error as any)?.code;
  if (direct) return sanitizeLogValue(direct, 80) || undefined;
  if (error instanceof HttpError && error.details && typeof error.details === 'object') {
    const nested = (error.details as Record<string, unknown>).code;
    if (nested) return sanitizeLogValue(nested, 80) || undefined;
  }
  return undefined;
}

export function notFound(req: Request, res: Response) {
  const requestId = sanitizeLogValue((req as any).requestId || '', 96);
  res.status(404).json({
    ok: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    requestId
  });
}

export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction) {
  const db = databaseMessage(error);
  const validation = error instanceof ZodError;
  const status = db?.status || (error instanceof HttpError ? error.status : validation ? 422 : 500);
  const requestId = sanitizeLogValue((req as any).requestId || '', 96);
  const errorCode = httpErrorCode(error);

  const logFields = {
    event: 'http.error',
    requestId: requestId || undefined,
    route: requestRouteTemplate(req),
    method: sanitizeLogValue(req.method || 'UNKNOWN', 12).toUpperCase(),
    status,
    errorType: sanitizeLogValue(error?.name || 'Error', 80),
    errorCode
  };
  if (status >= 500) requestLogger(req).error(logFields, 'request failed');
  else requestLogger(req).warn(logFields, 'request rejected');

  const publicMessage = validation
    ? 'La solicitud contiene datos inválidos.'
    : db?.message
      || (error instanceof HttpError ? error.message : status >= 500 ? 'Error interno del servidor.' : error.message)
      || 'Error interno del servidor.';

  const payload: Record<string, unknown> = {
    ok: false,
    message: publicMessage,
    requestId
  };
  if (errorCode) payload.code = errorCode;
  if (validation) payload.details = error.issues;
  if (error instanceof HttpError && error.details) payload.details = error.details;
  if (process.env.NODE_ENV === 'development') payload.stack = error.stack;
  res.status(status).json(payload);
}
