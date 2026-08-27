import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pino, { type DestinationStream, type LoggerOptions } from 'pino';
import { deploymentEnvironment, env } from '../../config/env.js';

const SERVICE_NAME = 'contagest-api';
const REDACTION_CENSOR = '[REDACTED]';

const REDACT_PATHS = [
  'authorization',
  'cookie',
  'cookies',
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'api_key',
  'secret',
  'clientSecret',
  'email',
  'rif',
  'phone',
  'fullName',
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
  'body.password',
  'body.passwordHash',
  'body.token',
  'body.accessToken',
  'body.refreshToken',
  'body.apiKey',
  'body.api_key',
  'body.secret',
  'body.email',
  'body.rif',
  'body.phone',
  'body.fullName',
  'user.email',
  'user.phone',
  'user.fullName',
  'tenant.rif'
];

function packageVersion() {
  const explicit = String(process.env.SERVICE_VERSION || '').trim();
  if (explicit) return explicit.slice(0, 64);

  try {
    // Source execution resolves the repository root package; compiled execution
    // resolves backend/package.json. Both are versioned together by ContaGest.
    const raw = readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    const version = String(parsed.version || '').trim();
    if (version) return version.slice(0, 64);
  } catch {
    // Metadata failure must never bring down the API.
  }

  return String(process.env.npm_package_version || 'unknown').slice(0, 64);
}

function commitSha() {
  const value = String(
    process.env.GIT_COMMIT_SHA
      || process.env.VERCEL_GIT_COMMIT_SHA
      || process.env.GITHUB_SHA
      || process.env.COMMIT_SHA
      || 'unknown'
  ).trim();

  return value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64) || 'unknown';
}

function logLevel() {
  const candidate = String(process.env.LOG_LEVEL || '').trim().toLowerCase();
  return ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(candidate)
    ? candidate
    : 'info';
}

export const deploymentMetadata = Object.freeze({
  service: SERVICE_NAME,
  version: packageVersion(),
  commitSha: commitSha(),
  environment: String(deploymentEnvironment || env.NODE_ENV || 'unknown').slice(0, 48)
});

export function createLogger(destination?: DestinationStream) {
  const options: LoggerOptions = {
    level: logLevel(),
    base: deploymentMetadata,
    redact: {
      paths: REDACT_PATHS,
      censor: REDACTION_CENSOR
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      level(label) {
        return { level: label };
      }
    }
  };

  return destination ? pino(options, destination) : pino(options);
}

export const logger = createLogger();

export function sanitizeLogValue(value: unknown, maxLength = 240) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function requestRouteTemplate(req: any) {
  const routePath = typeof req?.route?.path === 'string' ? req.route.path : '';
  const baseUrl = sanitizeLogValue(req?.baseUrl || '', 160);
  if (routePath) {
    const route = `${baseUrl}${routePath}`;
    return sanitizeLogValue(route || '/', 240) || '/';
  }

  // Before a route is matched (404s and early middleware rejection), never
  // promote the raw URL into logs/metric labels: it may contain IDs or PII and
  // would create unbounded cardinality. Keep only a stable technical bucket.
  return baseUrl || '/__unmatched__';
}

export function pseudonymizeIdentifier(namespace: string, value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;

  return createHmac('sha256', env.JWT_SECRET)
    .update(`${sanitizeLogValue(namespace, 32)}:${raw}`)
    .digest('base64url')
    .slice(0, 24);
}

export function requestLogger(req: any) {
  return req?.log || logger.child({ requestId: sanitizeLogValue(req?.requestId || '', 96) || undefined });
}
