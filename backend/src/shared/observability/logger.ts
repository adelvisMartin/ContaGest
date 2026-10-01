import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pino, { type DestinationStream, type LoggerOptions } from 'pino';
import { deploymentEnvironment, env } from '../../config/env.js';

const SERVICE_NAME = 'contagest-api';
const REDACTION_CENSOR = '[REDACTED]';
const MAX_REDACTION_DEPTH = 6;
const MAX_REDACTION_ITEMS = 64;

const SENSITIVE_FIELD = /(authorization|cookie|password|passphrase|secret|token|api[-_]?key|clientsecret|email|rif|phone|fullname|clinical|subjective|objective|assessment|diagnosis|allergies|conditions|medical|notes|prompt|payload|message(content|text)?)/i;
const SIGNED_QUERY_PARAM = /(token|access_token|refresh_token|api_?key|key|secret|sig|signature|x-amz-signature|x-amz-credential|x-goog-signature|x-goog-credential)/i;

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
  'clinicalData',
  'subjective',
  'objective',
  'assessment',
  'plan',
  'diagnosisCodes',
  'allergies',
  'conditions',
  'medicalNotes',
  'notes',
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
  'body.clinicalData',
  'body.subjective',
  'body.objective',
  'body.assessment',
  'body.plan',
  'body.diagnosisCodes',
  'body.allergies',
  'body.conditions',
  'body.medicalNotes',
  'body.notes',
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

function redactSensitiveString(value: string) {
  const sanitized = sanitizeLogValue(value, 2_000)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(/\b(password|passphrase|secret|token|api[-_]?key)\s*[:=]\s*[^\s,;&]+/gi, '$1=[REDACTED]');

  return sanitized.replace(/([?&])([^=&#\s]+)=([^&#\s]*)/g, (match, separator, rawKey) => {
    let key = String(rawKey);
    try { key = decodeURIComponent(key); } catch { /* keep raw key */ }
    return SIGNED_QUERY_PARAM.test(key)
      ? `${separator}${rawKey}=[REDACTED]`
      : match;
  });
}

export function redactTelemetryValue(value: unknown): unknown {
  const seen = new WeakSet<object>();

  const visit = (current: unknown, depth: number): unknown => {
    if (current === null || current === undefined) return current;
    if (typeof current === 'string') return redactSensitiveString(current);
    if (typeof current === 'number') return Number.isFinite(current) ? current : null;
    if (typeof current === 'boolean') return current;
    if (typeof current === 'bigint') return current.toString();
    if (current instanceof Date) return current.toISOString();
    if (depth >= MAX_REDACTION_DEPTH) return '[TRUNCATED]';
    if (typeof current !== 'object') return sanitizeLogValue(current, 240);
    if (seen.has(current as object)) return '[CIRCULAR]';
    seen.add(current as object);

    if (Array.isArray(current)) {
      return current.slice(0, MAX_REDACTION_ITEMS).map((item) => visit(item, depth + 1));
    }

    const output: Record<string, unknown> = {};
    for (const [rawKey, nested] of Object.entries(current as Record<string, unknown>).slice(0, MAX_REDACTION_ITEMS)) {
      const key = sanitizeLogValue(rawKey, 80);
      if (!key) continue;
      output[key] = SENSITIVE_FIELD.test(key) ? REDACTION_CENSOR : visit(nested, depth + 1);
    }
    return output;
  };

  return visit(value, 0);
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
