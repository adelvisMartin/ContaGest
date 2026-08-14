import type { Request, Response, NextFunction } from 'express';
import crypto, { randomUUID } from 'node:crypto';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env, isProd, isProductionDeployment, jwtSecretReady, licenseSecretReady } from '../../config/env.js';
import { HttpError } from '../http.js';
import { COOKIE_NAMES, readCookie } from '../auth/sessionCookies.js';

function normalizeOrigin(value?: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    return '';
  }
}

function explicitProductionSecretReady(value?: string) {
  const secret = String(value || '').trim();
  return secret.length >= 32 && !/dev[_-]?(secret|license)|change[_-]?me/i.test(secret);
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
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-admin-register-key', 'x-csrf-token'],
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

// CSP reports are intentionally unauthenticated browser telemetry. Keep the endpoint
// small, bounded and independently rate-limited so reporting cannot become a DoS path.
export const cspReportRateLimit = rateLimit({
  windowMs: 60_000,
  limit: isProd ? 120 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados reportes de seguridad.' }
});

function safeReportUrl(value: unknown) {
  const raw = String(value || '').slice(0, 1200);
  if (!raw || /^(inline|eval|data|blob):?$/i.test(raw)) return raw.slice(0, 160);
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return raw.slice(0, 300);
  }
}

function normalizeCspPayload(input: any) {
  const envelope = Array.isArray(input) ? input[0] : input;
  const report = envelope?.['csp-report'] || envelope?.body || envelope || {};
  return {
    documentUri: safeReportUrl(report['document-uri'] || report.documentURL || report.documentUri),
    blockedUri: safeReportUrl(report['blocked-uri'] || report.blockedURL || report.blockedUri),
    effectiveDirective: String(report['effective-directive'] || report.effectiveDirective || '').slice(0, 120),
    violatedDirective: String(report['violated-directive'] || report.violatedDirective || '').slice(0, 180),
    sourceFile: safeReportUrl(report['source-file'] || report.sourceFile),
    lineNumber: Number(report['line-number'] || report.lineNumber || 0) || undefined,
    columnNumber: Number(report['column-number'] || report.columnNumber || 0) || undefined,
    disposition: String(report.disposition || 'report').slice(0, 40)
  };
}

export function collectCspReport(req: Request, res: Response) {
  const report = normalizeCspPayload(req.body);
  const requestIdValue = String((req as any).requestId || '');
  // Deliberately avoid persisting cookies, request bodies or URL query strings.
  console.warn('[security:csp-report]', JSON.stringify({ requestId: requestIdValue, ...report }));
  res.status(204).end();
}

export function enforceProductionSecrets(_req: Request, _res: Response, next: NextFunction) {
  // Preview/dev may derive ephemeral secrets to keep QA inexpensive. Production commercial
  // must use independent explicit secrets: rotating a DB/service-role credential must never
  // silently change the license hash key and invalidate issued licenses.
  const explicitJwtReady = explicitProductionSecretReady(process.env.JWT_SECRET);
  const explicitLicenseReady = explicitProductionSecretReady(process.env.LICENSE_HASH_SECRET);
  if (isProductionDeployment && (!jwtSecretReady || !licenseSecretReady || !explicitJwtReady || !explicitLicenseReady)) {
    return next(new HttpError(503, 'La seguridad del servidor no está configurada. Producción requiere JWT_SECRET y LICENSE_HASH_SECRET explícitos.'));
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

const csrfExemptPaths = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/login/coordinates'
]);

function timingSafeTextEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Double-submit CSRF protection for browser cookie sessions.
 * Bearer-token API clients are not subject to CSRF because the browser cannot attach their Authorization header cross-site.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method) || csrfExemptPaths.has(req.path)) return next();
  const authHeader = String(req.header('authorization') || '');
  if (/^Bearer\s+/i.test(authHeader)) return next();

  const accessCookie = readCookie(req, COOKIE_NAMES.access);
  const refreshCookie = readCookie(req, COOKIE_NAMES.refresh);
  if (!accessCookie && !refreshCookie) return next();

  const cookieToken = readCookie(req, COOKIE_NAMES.csrf) || '';
  const headerToken = String(req.header('x-csrf-token') || '');
  if (!cookieToken || !headerToken || !timingSafeTextEqual(cookieToken, headerToken)) {
    return next(new HttpError(403, 'Validación CSRF requerida. Recarga la sesión e intenta nuevamente.'));
  }
  next();
}

export function securityResponseHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  // Camera and geolocation are legitimate same-origin ERP capabilities (scanner / delivery map).
  res.setHeader('permissions-policy', 'camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), serial=()');
  res.setHeader('cross-origin-opener-policy', 'same-origin');
  res.setHeader('x-permitted-cross-domain-policies', 'none');
  if (req.path.startsWith('/api/') || req.path === '/health') {
    res.setHeader('cache-control', 'no-store, max-age=0');
    res.setHeader('pragma', 'no-cache');
  }
  next();
}
