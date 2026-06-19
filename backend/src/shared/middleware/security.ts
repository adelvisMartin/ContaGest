import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env, isProd } from '../../config/env.js';
import { HttpError } from '../http.js';

const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = req.header('x-request-id') || randomUUID();
  (req as any).requestId = id;
  res.setHeader('x-request-id', id);
  next();
}

export const corsPolicy = cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin && !isProd) return callback(null, true);
    if (origin && allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new HttpError(403, `Origen CORS no permitido: ${origin || 'sin origin'}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-user-id', 'x-request-id']
});

export const globalRateLimit = rateLimit({
  windowMs: 60_000,
  limit: isProd ? 90 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes. Intenta nuevamente en un minuto.' }
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos de autenticación.' }
});

export function enforceProductionSecrets(_req: Request, _res: Response, next: NextFunction) {
  if (isProd && env.JWT_SECRET.includes('dev_secret')) {
    return next(new HttpError(500, 'JWT_SECRET inseguro en producción.'));
  }
  next();
}


const suspiciousPatterns = [/\.\./, /<script/i, /union\s+select/i, /\$where/i, /\bexec\b/i];
export function suspiciousRequestGuard(req: Request, _res: Response, next: NextFunction) {
  const target = `${req.originalUrl} ${JSON.stringify(req.query || {})}`;
  if (suspiciousPatterns.some((pattern) => pattern.test(target))) {
    return next(new HttpError(400, 'Solicitud bloqueada por patrón sospechoso.'));
  }
  next();
}

export function securityResponseHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  next();
}
