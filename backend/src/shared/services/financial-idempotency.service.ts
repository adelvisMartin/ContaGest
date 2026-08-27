import crypto, { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../http.js';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY_MIN_LENGTH = 8;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 200;
const IDEMPOTENCY_SCOPE_MAX_LENGTH = 80;
const KEY_PATTERN = /^[A-Za-z0-9._~:+/=-]+$/;
const SCOPE_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;

type JsonObject = Record<string, unknown>;
type IdempotencyStatus = 'processing' | 'succeeded' | 'failed';

type StoredRecord = {
  id: string;
  tenantId: string;
  scope: string;
  keyHash: string;
  requestHash: string;
  status: IdempotencyStatus;
  resourceType: string | null;
  resourceId: string | null;
  responseCode: number | null;
  responsePayload: unknown;
  requestId: string | null;
  lastRequestId: string | null;
  hitCount: number;
};

export type FinancialIdempotencyEffect<T> = {
  data: T;
  resourceType?: string;
  resourceId?: string;
  responseCode?: number;
};

export type FinancialIdempotencyReplayRecord = {
  recordId: string;
  resourceType: string | null;
  resourceId: string | null;
  responsePayload: unknown;
  originalRequestId: string | null;
};

export type FinancialIdempotencyExecution<T> = {
  data: T;
  responseCode: number;
  replayed: boolean;
  recordId?: string;
  originalRequestId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  concurrentWaitMs?: number;
};

export type FinancialIdempotencyInput<T = unknown> = {
  tenantId: string;
  scope: string;
  key?: string | null;
  request: unknown;
  requestId?: string | null;
  replay?: (tx: Prisma.TransactionClient, record: FinancialIdempotencyReplayRecord) => Promise<T>;
};

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new HttpError(422, 'El request contiene un número no finito.', { code: 'IDEMPOTENCY_REQUEST_NOT_CANONICAL' });
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: JsonObject = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      result[key] = canonicalize(source[key]);
    }
    return result;
  }
  throw new HttpError(422, 'El request no puede representarse de forma canónica.', { code: 'IDEMPOTENCY_REQUEST_NOT_CANONICAL' });
}

export function canonicalRequestJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function canonicalRequestHash(value: unknown) {
  return crypto.createHash('sha256').update(canonicalRequestJson(value), 'utf8').digest('hex');
}

export function normalizeIdempotencyScope(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized.length > IDEMPOTENCY_SCOPE_MAX_LENGTH || !SCOPE_PATTERN.test(normalized)) {
    throw new HttpError(500, 'Scope de idempotencia financiera inválido.', { code: 'IDEMPOTENCY_SCOPE_INVALID' });
  }
  return normalized;
}

export function normalizeIdempotencyKey(value?: string | null) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.length < IDEMPOTENCY_KEY_MIN_LENGTH || normalized.length > IDEMPOTENCY_KEY_MAX_LENGTH || !KEY_PATTERN.test(normalized)) {
    throw new HttpError(400, `Idempotency-Key debe tener entre ${IDEMPOTENCY_KEY_MIN_LENGTH} y ${IDEMPOTENCY_KEY_MAX_LENGTH} caracteres ASCII seguros.`, { code: 'IDEMPOTENCY_KEY_INVALID' });
  }
  return normalized;
}

export function hashIdempotencyKey(value: string) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function serializeResponse(value: unknown) {
  const json = JSON.stringify(value);
  if (json === undefined) throw new HttpError(500, 'La respuesta de la operación no puede persistirse para replay.', { code: 'IDEMPOTENCY_RESPONSE_NOT_SERIALIZABLE' });
  return json;
}

function emitIdempotencyEvent(event: string, input: { tenantId: string; scope: string; requestId?: string | null; recordId?: string; resourceType?: string | null; resourceId?: string | null; waitMs?: number }) {
  console.info('[financial-idempotency]', JSON.stringify({
    event,
    tenantId: input.tenantId,
    scope: input.scope,
    requestId: input.requestId || undefined,
    recordId: input.recordId,
    resourceType: input.resourceType || undefined,
    resourceId: input.resourceId || undefined,
    waitMs: input.waitMs
  }));
}

async function lookupRecord(tx: Prisma.TransactionClient, tenantId: string, scope: string, keyHash: string) {
  const rows = await tx.$queryRaw<StoredRecord[]>`
    SELECT
      "id", "tenantId", "scope", "keyHash", "requestHash", "status",
      "resourceType", "resourceId", "responseCode", "responsePayload",
      "requestId", "lastRequestId", "hitCount"
    FROM public."IdempotencyRecord"
    WHERE "tenantId" = ${tenantId}
      AND "scope" = ${scope}
      AND "keyHash" = ${keyHash}
    FOR UPDATE
  `;
  return rows[0] || null;
}

async function executeWithinTransaction<T>(
  tx: Prisma.TransactionClient,
  input: FinancialIdempotencyInput<T>,
  effect: (tx: Prisma.TransactionClient) => Promise<FinancialIdempotencyEffect<T>>
): Promise<FinancialIdempotencyExecution<T>> {
  const key = normalizeIdempotencyKey(input.key);
  if (!key) {
    const result = await effect(tx);
    return {
      data: result.data,
      responseCode: result.responseCode || 200,
      replayed: false,
      resourceType: result.resourceType || null,
      resourceId: result.resourceId || null
    };
  }

  const scope = normalizeIdempotencyScope(input.scope);
  const keyHash = hashIdempotencyKey(key);
  const requestHash = canonicalRequestHash(input.request);
  const recordId = randomUUID();
  const reservationStartedAt = Date.now();
  const inserted = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO public."IdempotencyRecord" (
      "id", "tenantId", "scope", "keyHash", "requestHash", "status",
      "requestId", "lastRequestId", "hitCount", "createdAt", "lastSeenAt"
    ) VALUES (
      ${recordId}, ${input.tenantId}, ${scope}, ${keyHash}, ${requestHash}, 'processing',
      ${input.requestId || null}, ${input.requestId || null}, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("tenantId", "scope", "keyHash") DO NOTHING
    RETURNING "id"
  `;
  const reservationWaitMs = Date.now() - reservationStartedAt;

  if (!inserted.length) {
    const existing = await lookupRecord(tx, input.tenantId, scope, keyHash);
    if (!existing) throw new HttpError(409, 'No fue posible resolver el estado de la operación idempotente.', { code: 'IDEMPOTENCY_STATE_UNAVAILABLE' });
    if (existing.requestHash !== requestHash) {
      throw new HttpError(409, 'Idempotency-Key ya fue utilizada con un request diferente.', {
        code: 'IDEMPOTENCY_KEY_REUSED',
        scope
      });
    }
    if (existing.status !== 'succeeded') {
      throw new HttpError(409, 'La operación idempotente todavía no tiene un resultado reutilizable.', {
        code: existing.status === 'processing' ? 'IDEMPOTENCY_OPERATION_IN_PROGRESS' : 'IDEMPOTENCY_PREVIOUS_FAILURE',
        scope
      });
    }

    const replayRecord: FinancialIdempotencyReplayRecord = {
      recordId: existing.id,
      resourceType: existing.resourceType,
      resourceId: existing.resourceId,
      responsePayload: existing.responsePayload,
      originalRequestId: existing.requestId
    };
    let replayData: T;
    if (input.replay) {
      replayData = await input.replay(tx, replayRecord);
    } else {
      if (existing.responsePayload === null || existing.responsePayload === undefined) {
        throw new HttpError(409, 'El resultado original ya no puede reconstruirse.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', scope });
      }
      replayData = existing.responsePayload as T;
    }

    await tx.$executeRaw`
      UPDATE public."IdempotencyRecord"
      SET "lastRequestId" = ${input.requestId || null},
          "hitCount" = "hitCount" + 1,
          "lastSeenAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${existing.id}
    `;

    return {
      data: replayData,
      responseCode: existing.responseCode || 200,
      replayed: true,
      recordId: existing.id,
      originalRequestId: existing.requestId,
      resourceType: existing.resourceType,
      resourceId: existing.resourceId,
      concurrentWaitMs: reservationWaitMs
    };
  }

  const result = await effect(tx);
  const responseCode = result.responseCode || 200;
  const responseJson = input.replay ? null : serializeResponse(result.data);
  await tx.$executeRaw`
    UPDATE public."IdempotencyRecord"
    SET "status" = 'succeeded',
        "resourceType" = ${result.resourceType || null},
        "resourceId" = ${result.resourceId || null},
        "responseCode" = ${responseCode},
        "responsePayload" = ${responseJson}::jsonb,
        "completedAt" = CURRENT_TIMESTAMP,
        "lastSeenAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${recordId}
  `;

  return {
    data: result.data,
    responseCode,
    replayed: false,
    recordId,
    originalRequestId: input.requestId || null,
    resourceType: result.resourceType || null,
    resourceId: result.resourceId || null
  };
}

export async function runFinancialIdempotentMutation<T>(
  input: FinancialIdempotencyInput<T>,
  effect: (tx: Prisma.TransactionClient) => Promise<FinancialIdempotencyEffect<T>>
): Promise<FinancialIdempotencyExecution<T>> {
  const scope = normalizeIdempotencyScope(input.scope);
  const key = normalizeIdempotencyKey(input.key);
  try {
    const execution = await prisma.$transaction((tx) => executeWithinTransaction(tx, { ...input, scope, key }, effect));
    if (key && execution.replayed && execution.concurrentWaitMs && execution.concurrentWaitMs >= 25) {
      emitIdempotencyEvent('idempotency.concurrent_wait', {
        tenantId: input.tenantId,
        scope,
        requestId: input.requestId,
        recordId: execution.recordId,
        resourceType: execution.resourceType,
        resourceId: execution.resourceId,
        waitMs: execution.concurrentWaitMs
      });
    }
    emitIdempotencyEvent(key ? (execution.replayed ? 'idempotency.hit' : 'idempotency.miss') : 'idempotency.missing', {
      tenantId: input.tenantId,
      scope,
      requestId: input.requestId,
      recordId: execution.recordId,
      resourceType: execution.resourceType,
      resourceId: execution.resourceId
    });
    return execution;
  } catch (error) {
    const code = error instanceof HttpError && error.details && typeof error.details === 'object'
      ? String((error.details as Record<string, unknown>).code || '')
      : '';
    emitIdempotencyEvent(code === 'IDEMPOTENCY_KEY_REUSED' ? 'idempotency.conflict' : 'idempotency.failed', {
      tenantId: input.tenantId,
      scope,
      requestId: input.requestId
    });
    throw error;
  }
}