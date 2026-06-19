import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../http.js';

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
  res.status(404).json({ ok: false, message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction) {
  const db = databaseMessage(error);
  const status = db?.status || (error instanceof HttpError ? error.status : 500);
  const payload: Record<string, unknown> = { ok: false, message: db?.message || error.message || 'Error interno' };
  if (error instanceof HttpError && error.details) payload.details = error.details;
  if (process.env.NODE_ENV === 'development') payload.stack = error.stack;
  res.status(status).json(payload);
}
