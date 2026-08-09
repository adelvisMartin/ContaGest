import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env, isProd, isProductionDeployment, jwtSecretReady, licenseSecretReady } from '../../config/env.js';
import { HttpError } from '../http.js';

function normalizeOrigin(value?: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    return '';
  }
}

const allowedOrigins = new Set(
  env.CORS_ORIGIN
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)
);

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = String(req.header('x-request-id') || '');
  const id = /^[A-Za-z0-9._:-]{8,96}$/.test(incoming) ? incoming : randomUUID();
  (req as any).requestId = id;
  res.setHeader('x-request-id', id);
  next();
}

export const corsPolicy = cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(normalizeOrigin(origin))) return callback(null, true);
    return callback(new HttpError(403, `Origen CORS no permitido: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-admin-register-key'],
  maxAge: 600
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
  limit: isProd ? 20 : 60,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes de autenticación. Espera unos minutos antes de reintentar.' }
});

export function enforceProductionSecrets(_req: Request, _res: Response, next: NextFunction) {
  if (isProductionDeployment && (!jwtSecretReady || !licenseSecretReady)) {
    return next(new HttpError(503, 'La seguridad del servidor no está configurada.'));
  }
  next();
}

const suspiciousPatterns = [/\.\./, /%2e%2e/i, /<script/i, /union\s+select/i, /\$where/i, /\bexec\b/i, /information_schema/i, /pg_sleep\s*\(/i];
export function suspiciousRequestGuard(req: Request, _res: Response, next: NextFunction) {
  const target = `${req.originalUrl} ${JSON.stringify(req.query || {})}`;
  if (target.length > 16_384) return next(new HttpError(414, 'Solicitud demasiado extensa.'));
  if (suspiciousPatterns.some((pattern) => pattern.test(target))) {
    return next(new HttpError(400, 'Solicitud bloqueada por patrón sospechoso.'));
  }

  const unsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
  const fetchSite = String(req.header('sec-fetch-site') || '').toLowerCase();
  if (isProd && unsafeMethod && fetchSite === 'cross-site') {
    return next(new HttpError(403, 'Solicitud cross-site bloqueada.'));
  }
  next();
}

export function securityResponseHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()');
  res.setHeader('cross-origin-opener-policy', 'same-origin');
  res.setHeader('x-permitted-cross-domain-policies', 'none');
  if (req.path.startsWith('/api/') || req.path === '/health') {
    res.setHeader('cache-control', 'no-store, max-age=0');
    res.setHeader('pragma', 'no-cache');
  }
  next();
}
