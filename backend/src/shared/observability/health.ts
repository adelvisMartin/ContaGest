import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { prisma } from '../../database/prisma.js';
import { isProductionDeployment } from '../../config/env.js';
import { deploymentMetadata, logger, requestLogger } from './logger.js';
import { recordDatabaseProbe, renderPrometheusMetrics } from './metrics.js';

type DatabaseProbeOutcome = 'ok' | 'error' | 'timeout';
type DatabaseProbeResult = {
  outcome: DatabaseProbeOutcome;
  durationMs: number;
};

export type ReadinessResult = {
  ready: boolean;
  configuration: 'ok' | 'failed';
  database: 'ok' | 'failed' | 'not_checked';
};

export type ReadinessCheck = () => Promise<ReadinessResult>;

const DEFAULT_DB_PROBE_TIMEOUT_MS = 1_500;
const DEFAULT_READINESS_CACHE_MS = 2_000;

function boundedMs(source: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number) {
  const parsed = Number(source[name]);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? Math.round(parsed) : fallback;
}

function explicitSecretReady(value?: string) {
  const secret = String(value || '').trim();
  return secret.length >= 32 && !/dev[_-]?(secret|license)|change[_-]?me|replace[_-]?with/i.test(secret);
}

function databaseConfigured(source: NodeJS.ProcessEnv, productionLike: boolean) {
  if (productionLike) return Boolean(String(source.DATABASE_RUNTIME_URL || '').trim());
  return Boolean(
    source.DATABASE_RUNTIME_URL
      || source.DATABASE_URL
      || source.POSTGRES_PRISMA_URL
      || source.POSTGRES_URL
      || source.SUPABASE_DB_URL
      || source.DIRECT_DATABASE_URL
      || source.DIRECT_URL
      || source.POSTGRES_URL_NON_POOLING
  );
}

export function evaluateReadinessConfiguration(
  source: NodeJS.ProcessEnv = process.env,
  productionLike = isProductionDeployment
) {
  const database = databaseConfigured(source, productionLike);
  const jwt = !productionLike || explicitSecretReady(source.JWT_SECRET);
  const license = !productionLike || explicitSecretReady(source.LICENSE_HASH_SECRET);

  return {
    ok: database && jwt && license,
    checks: { database, jwt, license }
  };
}

async function defaultDatabaseProbe(): Promise<DatabaseProbeResult> {
  const timeoutMs = boundedMs(process.env, 'READINESS_DB_TIMEOUT_MS', DEFAULT_DB_PROBE_TIMEOUT_MS, 100, 10_000);
  const startedAt = process.hrtime.bigint();
  let timer: NodeJS.Timeout | undefined;

  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('database_probe_timeout'), { code: 'READINESS_DB_TIMEOUT' })), timeoutMs);
      timer.unref?.();
    });

    await Promise.race([
      prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`,
      timeout
    ]);

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    recordDatabaseProbe('ok', durationMs);
    return { outcome: 'ok', durationMs };
  } catch (error: any) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const outcome: DatabaseProbeOutcome = error?.code === 'READINESS_DB_TIMEOUT' ? 'timeout' : 'error';
    recordDatabaseProbe(outcome, durationMs);
    logger.warn({
      event: 'readiness.database_failed',
      outcome,
      durationMs: Number(durationMs.toFixed(3)),
      errorType: String(error?.name || 'Error').slice(0, 80)
    }, 'database readiness probe failed');
    return { outcome, durationMs };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runReadinessCheck(options: {
  source?: NodeJS.ProcessEnv;
  productionLike?: boolean;
  dbProbe?: () => Promise<DatabaseProbeResult>;
} = {}): Promise<ReadinessResult> {
  const source = options.source || process.env;
  const productionLike = options.productionLike ?? isProductionDeployment;
  const configuration = evaluateReadinessConfiguration(source, productionLike);

  if (!configuration.ok) {
    return { ready: false, configuration: 'failed', database: 'not_checked' };
  }

  const probe = await (options.dbProbe || defaultDatabaseProbe)();
  return {
    ready: probe.outcome === 'ok',
    configuration: 'ok',
    database: probe.outcome === 'ok' ? 'ok' : 'failed'
  };
}

let readinessCache: { expiresAt: number; result: ReadinessResult } | null = null;
let readinessInFlight: Promise<ReadinessResult> | null = null;

async function cachedReadiness() {
  const now = Date.now();
  if (readinessCache && readinessCache.expiresAt > now) return readinessCache.result;
  if (readinessInFlight) return readinessInFlight;

  readinessInFlight = runReadinessCheck()
    .then((result) => {
      readinessCache = {
        result,
        expiresAt: Date.now() + boundedMs(process.env, 'READINESS_CACHE_MS', DEFAULT_READINESS_CACHE_MS, 250, 30_000)
      };
      return result;
    })
    .finally(() => {
      readinessInFlight = null;
    });

  return readinessInFlight;
}

function identityPayload() {
  return {
    service: deploymentMetadata.service,
    version: deploymentMetadata.version,
    buildCommit: deploymentMetadata.commitSha,
    environment: deploymentMetadata.environment,
    timestamp: new Date().toISOString()
  };
}

function livePayload() {
  return {
    ok: true,
    status: 'live',
    ...identityPayload()
  };
}

function legacyHealthPayload() {
  return {
    ok: true,
    status: 'healthy',
    liveness: 'live',
    ...identityPayload()
  };
}

function metricsTokenMatches(req: Request) {
  if (!isProductionDeployment) return true;
  const expected = String(process.env.OBSERVABILITY_METRICS_TOKEN || '').trim();
  if (expected.length < 32) return false;

  const authorization = String(req.header('authorization') || '');
  const supplied = /^Bearer\s+/i.test(authorization)
    ? authorization.replace(/^Bearer\s+/i, '').trim()
    : String(req.header('x-observability-token') || '').trim();

  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function registerHealthRoutes(
  app: Express,
  options: { readinessCheck?: ReadinessCheck } = {}
) {
  const readinessCheck = options.readinessCheck || cachedReadiness;

  app.get('/health/live', (_req, res) => {
    res.status(200).json(livePayload());
  });

  app.get('/health/ready', async (req, res) => {
    const result = await readinessCheck();
    const status = result.ready ? 200 : 503;
    const fields = {
      event: 'readiness.checked',
      requestId: (req as any).requestId,
      ready: result.ready,
      configuration: result.configuration,
      database: result.database
    };
    if (result.ready) requestLogger(req).debug(fields, 'service ready');
    else requestLogger(req).warn(fields, 'service not ready');

    res.status(status).json({
      ok: result.ready,
      status: result.ready ? 'ready' : 'not_ready',
      checks: {
        configuration: result.configuration,
        database: result.database
      },
      ...identityPayload()
    });
  });

  // Backward-compatible liveness aliases. They intentionally do not imply readiness.
  app.get('/health', (_req, res) => res.status(200).json(legacyHealthPayload()));
  app.get('/api/health', (_req, res) => res.status(200).json(legacyHealthPayload()));
  app.get('/api/v1/health', (_req, res) => res.status(200).json(legacyHealthPayload()));

  app.get('/metrics', (req: Request, res: Response) => {
    if (!metricsTokenMatches(req)) {
      return res.status(404).json({ ok: false, message: 'Recurso no disponible.', requestId: (req as any).requestId });
    }
    res.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return res.status(200).send(renderPrometheusMetrics());
  });
}

export function resetReadinessCacheForTests() {
  readinessCache = null;
  readinessInFlight = null;
}
