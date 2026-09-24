import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../http.js';
import { requestLogger, requestRouteTemplate, sanitizeLogValue } from '../observability/logger.js';

function databaseMessage(error: Error) {
  const msg = String(error.message || '');
  if (msg.includes("Can't reach database server") || msg.includes('Timed out fetching a new connection') || msg.includes('P1001') || msg.includes('P2024')) {
    return {
      status: 503,
      message: [
        'Backend no pudo conectarse a Supabase/PostgreSQL.',
        'Corrige backend/.env: DATABASE_URL debe usar el pooler 6543, no 5432, y no debe tener connection_limit=1.',
        'Ejemplo: DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&connection_limit=5&pool_timeout=60&connect_timeout=30&schema=public"',
        'Luego reinicia el backend con Ctrl+C y npm run dev.'
      ].join(' ')
    };
  }
  return null;
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
  const errorCode = sanitizeLogValue((error as any)?.code || '', 80) || undefined;

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

  const payload: Record<string, unknown> = {
    ok: false,
    message: validation ? 'La solicitud contiene datos inválidos.' : (db?.message || error.message || 'Error interno'),
    requestId
  };
  if (validation) payload.details = error.issues;
  if (error instanceof HttpError && error.details) payload.details = error.details;
  if (process.env.NODE_ENV === 'development') payload.stack = error.stack;
  res.status(status).json(payload);
}
