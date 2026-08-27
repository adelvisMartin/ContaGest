import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';

export const INVALID_LOGIN_MESSAGE = 'Credenciales incorrectas.';

export type LoginIdentity = {
  tenantRif: string;
  email: string;
  ipAddress: string;
};

export type LoginThrottlePolicy = {
  failureLimit: number;
  observationWindowMs: number;
  lockDurationMs: number;
  retentionMs: number;
};

type LoginAttemptLike = {
  id: string;
  success: boolean;
  createdAt: Date;
};

export type LoginThrottleState = {
  locked: boolean;
  failureCount: number;
  lockedUntil: Date | null;
  thresholdAttemptId: string | null;
  expiredLockUntil: Date | null;
  shouldEmitExpired: boolean;
};

function boundedInteger(
  source: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number
) {
  const raw = source[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

/**
 * Deployment policy, not an OWASP-mandated threshold. Defaults intentionally align
 * the account observation window and temporary lock with the existing 15-minute
 * transport auth limiter so a lock naturally ages out without permanent state.
 */
export function loadLoginThrottlePolicy(source: NodeJS.ProcessEnv = process.env): LoginThrottlePolicy {
  const isTest = String(source.NODE_ENV || '').toLowerCase() === 'test';
  const minimumSeconds = isTest ? 1 : 60;
  const observationSeconds = boundedInteger(source, 'AUTH_LOGIN_OBSERVATION_WINDOW_SECONDS', 15 * 60, minimumSeconds, 24 * 60 * 60);
  const configuredLockSeconds = boundedInteger(source, 'AUTH_LOGIN_LOCK_SECONDS', 15 * 60, minimumSeconds, 24 * 60 * 60);
  const lockSeconds = Math.max(configuredLockSeconds, minimumSeconds);

  return {
    failureLimit: boundedInteger(source, 'AUTH_LOGIN_FAILURE_LIMIT', 5, 3, 20),
    observationWindowMs: observationSeconds * 1000,
    lockDurationMs: lockSeconds * 1000,
    retentionMs: boundedInteger(source, 'AUTH_LOGIN_ATTEMPT_RETENTION_DAYS', 90, 1, 365) * 24 * 60 * 60 * 1000
  };
}

export function normalizeLoginIdentity(input: {
  tenantRif?: unknown;
  email?: unknown;
  ipAddress?: unknown;
}): LoginIdentity {
  return {
    tenantRif: String(input.tenantRif || '').trim().toUpperCase(),
    email: String(input.email || '').trim().toLowerCase(),
    ipAddress: String(input.ipAddress || 'unknown').trim().slice(0, 120) || 'unknown'
  };
}

export function loginIdentityFromRequest(req: any): LoginIdentity {
  return normalizeLoginIdentity({
    tenantRif: req.body?.tenantRif,
    email: req.body?.email,
    ipAddress: req.ip
  });
}

/**
 * Replays a bounded append-only attempt stream. A successful login resets the
 * account counter. Failures that arrive while an already-derived lock is active
 * (possible with concurrent in-flight requests) do not extend that lock.
 */
export function evaluateLoginThrottle(
  attempts: LoginAttemptLike[],
  now = new Date(),
  policy = loadLoginThrottlePolicy()
): LoginThrottleState {
  const ordered = [...attempts].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  let failures: LoginAttemptLike[] = [];
  let lock: { until: Date; thresholdAttemptId: string } | null = null;
  let lastExpiredLockUntil: Date | null = null;
  let postExpiryAttemptSeen = false;

  for (const attempt of ordered) {
    const attemptAt = attempt.createdAt.getTime();

    if (attempt.success) {
      failures = [];
      lock = null;
      lastExpiredLockUntil = null;
      postExpiryAttemptSeen = false;
      continue;
    }

    if (lock) {
      if (attemptAt < lock.until.getTime()) {
        // This request was already in flight when another request activated the lock.
        continue;
      }
      lastExpiredLockUntil = lock.until;
      postExpiryAttemptSeen = true;
      lock = null;
      failures = [];
    } else if (lastExpiredLockUntil && attemptAt >= lastExpiredLockUntil.getTime()) {
      postExpiryAttemptSeen = true;
    }

    const cutoff = attemptAt - policy.observationWindowMs;
    failures = failures.filter((failure) => failure.createdAt.getTime() > cutoff);
    failures.push(attempt);

    if (failures.length >= policy.failureLimit) {
      lock = {
        until: new Date(attemptAt + policy.lockDurationMs),
        thresholdAttemptId: attempt.id
      };
      failures = [];
    }
  }

  if (lock && lock.until.getTime() <= now.getTime()) {
    lastExpiredLockUntil = lock.until;
    postExpiryAttemptSeen = false;
    lock = null;
    failures = [];
  }

  return {
    locked: Boolean(lock && lock.until.getTime() > now.getTime()),
    failureCount: failures.length,
    lockedUntil: lock?.until || null,
    thresholdAttemptId: lock?.thresholdAttemptId || null,
    expiredLockUntil: lastExpiredLockUntil,
    shouldEmitExpired: Boolean(lastExpiredLockUntil && !postExpiryAttemptSeen)
  };
}

function telemetryIdentityHash(identity: LoginIdentity) {
  return crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(`${identity.tenantRif}\n${identity.email}`)
    .digest('base64url')
    .slice(0, 32);
}

export function logAuthSecurityEvent(
  event: 'auth.login.failed' | 'auth.throttle.activated' | 'auth.throttle.expired' | 'auth.login.succeeded',
  req: any,
  identity: LoginIdentity,
  details: Record<string, unknown> = {}
) {
  const payload = {
    event,
    requestId: String(req.requestId || ''),
    tenantId: typeof details.tenantId === 'string' ? details.tenantId : undefined,
    identityHash: telemetryIdentityHash(identity),
    ...Object.fromEntries(Object.entries(details).filter(([key]) => key !== 'tenantId' || typeof details.tenantId !== 'string'))
  };
  // Never pass req.body, cookies, authorization headers, passwords, CAPTCHA tokens or license keys here.
  console.info('[security:auth]', JSON.stringify(payload));
}

async function attemptsForIdentity(identity: LoginIdentity, now: Date, policy: LoginThrottlePolicy) {
  const horizonStart = new Date(now.getTime() - policy.observationWindowMs - policy.lockDurationMs);
  return prisma.authLoginAttempt.findMany({
    where: {
      tenantRif: identity.tenantRif,
      email: identity.email,
      createdAt: { gt: horizonStart }
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, success: true, createdAt: true }
  });
}

export async function getLoginThrottleState(req: any, now = new Date()) {
  const identity = loginIdentityFromRequest(req);
  const policy = loadLoginThrottlePolicy();
  const attempts = await attemptsForIdentity(identity, now, policy);
  const state = evaluateLoginThrottle(attempts, now, policy);

  if (state.shouldEmitExpired && state.expiredLockUntil) {
    logAuthSecurityEvent('auth.throttle.expired', req, identity, {
      lockedUntil: state.expiredLockUntil.toISOString()
    });
  }

  return { identity, policy, state };
}

export async function recordLoginFailure(
  req: any,
  details: { tenantId?: string; reason: string } = { reason: 'invalid_credentials' },
  now = new Date()
) {
  const identity = loginIdentityFromRequest(req);
  const policy = loadLoginThrottlePolicy();
  const attempt = await prisma.authLoginAttempt.create({
    data: { ...identity, success: false },
    select: { id: true, success: true, createdAt: true }
  });
  const attempts = await attemptsForIdentity(identity, now, policy);
  const state = evaluateLoginThrottle(attempts, now, policy);

  logAuthSecurityEvent('auth.login.failed', req, identity, {
    tenantId: details.tenantId,
    reason: details.reason,
    throttled: state.locked
  });

  if (state.locked && state.thresholdAttemptId === attempt.id && state.lockedUntil) {
    logAuthSecurityEvent('auth.throttle.activated', req, identity, {
      tenantId: details.tenantId,
      lockedUntil: state.lockedUntil.toISOString(),
      failureLimit: policy.failureLimit
    });
  }

  return state;
}

export async function recordLoginSuccess(req: any, tenantId?: string, now = new Date()) {
  const identity = loginIdentityFromRequest(req);
  await prisma.authLoginAttempt.create({ data: { ...identity, success: true } });
  logAuthSecurityEvent('auth.login.succeeded', req, identity, { tenantId });

  const policy = loadLoginThrottlePolicy();
  void prisma.authLoginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - policy.retentionMs) } }
  }).catch(() => undefined);
}
