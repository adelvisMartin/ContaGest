import type { Request, Response, NextFunction } from 'express';
import {
  buildErrorEnvelope,
  normalizeOperationalError,
  structuredErrorFields
} from '../observability/contract.js';
import { createTelemetryContext, currentCorrelationId } from '../observability/context.js';
import { requestLogger, requestRouteTemplate, sanitizeLogValue } from '../observability/logger.js';

function responseContext(req: Request) {
  const requestId = sanitizeLogValue((req as any).requestId || '', 96);
  const correlationId = sanitizeLogValue(
    (req as any).correlationId
      || (req as any).telemetry?.correlationId
      || currentCorrelationId()
      || createTelemetryContext({ requestId }).correlationId,
    96
  );
  const instance = sanitizeLogValue(String(req.originalUrl || req.path || '/').split('?')[0], 240);
  return { requestId, correlationId, instance };
}

export function notFound(req: Request, res: Response) {
  const context = responseContext(req);
  const normalized = normalizeOperationalError(Object.assign(new Error('Ruta no encontrada.'), {
    status: 404,
    code: 'NOT_FOUND'
  }));
  return res.status(normalized.status).json(buildErrorEnvelope(normalized, context));
}

export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction) {
  const normalized = normalizeOperationalError(error);
  const context = responseContext(req);
  const logFields = {
    event: 'http.error',
    requestId: context.requestId || undefined,
    correlationId: context.correlationId,
    route: requestRouteTemplate(req),
    method: sanitizeLogValue(req.method || 'UNKNOWN', 12).toUpperCase(),
    ...structuredErrorFields(normalized)
  };

  if (normalized.status >= 500) requestLogger(req).error(logFields, 'request failed');
  else requestLogger(req).warn(logFields, 'request rejected');

  return res.status(normalized.status).json(buildErrorEnvelope(normalized, context));
}
