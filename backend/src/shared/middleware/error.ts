import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../http.js';
import { errorCorrelation, publicErrorEnvelope } from '../observability/error-contract.js';
import {
  pseudonymizeIdentifier,
  requestLogger,
  requestRouteTemplate,
  sanitizeLogValue
} from '../observability/logger.js';

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

function validationDetails(error: ZodError) {
  return error.issues.slice(0, 32).map((issue) => ({
    code: sanitizeLogValue(issue.code, 80),
    path: issue.path.slice(0, 16).map((segment) => sanitizeLogValue(segment, 80)),
    message: sanitizeLogValue(issue.message, 240)
  }));
}

export function notFound(req: Request, res: Response) {
  res.status(404).json(publicErrorEnvelope(req, 'Ruta no encontrada.'));
}

export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction) {
  const db = databaseMessage(error);
  const validation = error instanceof ZodError;
  const status = db?.status || (error instanceof HttpError ? error.status : validation ? 422 : 500);
  const { requestId, correlationId } = errorCorrelation(req);
  const errorCode = httpErrorCode(error);
  const tenantId = (req as any).context?.tenantId ?? (req as any).auth?.tenantId;
  const userId = (req as any).auth?.userId ?? (req as any).context?.userId;

  const logFields = {
    event: 'http.error',
    requestId: requestId || undefined,
    correlationId: correlationId || undefined,
    route: requestRouteTemplate(req),
    method: sanitizeLogValue(req.method || 'UNKNOWN', 12).toUpperCase(),
    status,
    errorType: sanitizeLogValue(error?.name || 'Error', 80),
    errorCode,
    errorRef: error?.message ? pseudonymizeIdentifier('error', error.message) : undefined,
    tenantRef: tenantId ? pseudonymizeIdentifier('tenant', tenantId) : undefined,
    userRef: userId ? pseudonymizeIdentifier('user', userId) : undefined
  };
  if (status >= 500) requestLogger(req).error(logFields, 'request failed');
  else requestLogger(req).warn(logFields, 'request rejected');

  const publicMessage = validation
    ? 'La solicitud contiene datos inválidos.'
    : db?.message
      || (error instanceof HttpError ? error.message : status >= 500 ? 'Error interno del servidor.' : error.message)
      || 'Error interno del servidor.';

  const details = validation
    ? validationDetails(error)
    : error instanceof HttpError
      ? error.details
      : undefined;

  const payload = publicErrorEnvelope(req, publicMessage, {
    code: errorCode,
    details
  });
  if (process.env.NODE_ENV === 'development') (payload as Record<string, unknown>).stack = error.stack;
  res.status(status).json(payload);
}
