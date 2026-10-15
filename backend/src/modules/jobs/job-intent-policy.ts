import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HANDLER_KEY = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+\.v[1-9][0-9]*$/;
const EFFECT_KEY = /^[a-zA-Z0-9][a-zA-Z0-9:_./-]{0,159}$/;

function canonicalJson(value: unknown, depth = 0): unknown {
  if (depth > 12) throw new Error('JOB_PAYLOAD_DEPTH_EXCEEDED');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => canonicalJson(item, depth + 1));
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson((value as Record<string, unknown>)[key], depth + 1)]));
  }
  throw new Error('JOB_PAYLOAD_NON_JSON');
}

export function assertAsyncJobTenantId(tenantId: unknown): asserts tenantId is string {
  if (typeof tenantId !== 'string' || !UUID.test(tenantId)) throw new Error('JOB_TENANT_INVALID');
}

export function prepareAsyncJobIntent(input: {tenantId: string; handlerKey: string; effectKey: string; payload: Record<string, unknown>; maxAttempts: number; runAt: Date}) {
  if (!input) throw new Error('JOB_TENANT_INVALID');
  assertAsyncJobTenantId(input.tenantId);
  if (typeof input.handlerKey !== 'string' || input.handlerKey.length > 100 || !HANDLER_KEY.test(input.handlerKey)) {
    throw new Error('JOB_HANDLER_KEY_INVALID');
  }
  if (typeof input.effectKey !== 'string' || !EFFECT_KEY.test(input.effectKey)) throw new Error('JOB_EFFECT_KEY_INVALID');
  if (!Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 20) {
    throw new Error('JOB_MAX_ATTEMPTS_INVALID');
  }
  if (!(input.runAt instanceof Date) || !Number.isFinite(input.runAt.getTime())) throw new Error('JOB_RUN_AT_INVALID');
  if (!input.payload || Array.isArray(input.payload) || Object.getPrototypeOf(input.payload) !== Object.prototype) {
    throw new Error('JOB_PAYLOAD_NON_JSON');
  }
  const serialized = JSON.stringify(canonicalJson(input.payload));
  if (Buffer.byteLength(serialized, 'utf8') > 16 * 1024) throw new Error('JOB_PAYLOAD_TOO_LARGE');
  const requestHash = createHash('sha256').update(JSON.stringify({
    handlerKey: input.handlerKey,
    runAt: input.runAt.toISOString(),
    maxAttempts: input.maxAttempts,
    payload: serialized
  })).digest('hex');
  return Object.freeze({
    tenantId: input.tenantId,
    handlerKey: input.handlerKey,
    effectKey: input.effectKey,
    runAt: input.runAt,
    maxAttempts: input.maxAttempts,
    payloadJson: serialized,
    requestHash
  });
}

export function planAsyncJobFailure({ attempts, maxAttempts, retryable, now }: {attempts: number; maxAttempts: number; retryable: boolean; now: Date}) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new Error('JOB_ATTEMPTS_INVALID');
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('JOB_CLOCK_INVALID');
  if (typeof retryable !== 'boolean') throw new Error('JOB_RETRY_CLASSIFICATION_REQUIRED');
  if (!retryable || attempts >= maxAttempts) return Object.freeze({ status: 'dead', runAt: null });
  const delaySeconds = Math.min(3600, 5 * 2 ** Math.min(19, attempts - 1));
  return Object.freeze({ status: 'retry', runAt: new Date(now.getTime() + delaySeconds * 1000) });
}
