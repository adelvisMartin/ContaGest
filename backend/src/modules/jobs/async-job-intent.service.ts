import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prepareAsyncJobIntent, planAsyncJobFailure, assertAsyncJobTenantId } from './job-intent-policy.js';

// Caller MUST already be inside its business transaction and authenticated tenant context.
// No implicit second transaction and no network/provider work before business COMMIT.
export async function enqueueAsyncJobIntent(tx: Prisma.TransactionClient, input: {
  tenantId: string;
  handlerKey: string;
  effectKey: string;
  payload: Record<string, unknown>;
  runAt: Date;
  maxAttempts: number;
}) {
  const request = prepareAsyncJobIntent(input);
  const rows = await tx.$queryRaw<Array<{id: string; requestHash: string; status: string}>>(Prisma.sql`
    INSERT INTO public."AsyncJobIntent" (
      "id", "tenantId", "handlerKey", "effectKey", "requestHash", "payload", "runAt", "maxAttempts"
    ) VALUES (
      ${randomUUID()}, ${request.tenantId}, ${request.handlerKey}, ${request.effectKey},
      ${request.requestHash}, ${request.payloadJson}::jsonb, ${request.runAt}, ${request.maxAttempts}
    )
    ON CONFLICT ("tenantId", "effectKey") DO UPDATE
      SET "updatedAt" = public."AsyncJobIntent"."updatedAt"
      WHERE public."AsyncJobIntent"."requestHash" = EXCLUDED."requestHash"
    RETURNING "id", "requestHash", "status"
  `);
  if (!rows[0]) throw new Error('ASYNC_JOB_IDEMPOTENCY_CONFLICT');
  return rows[0];
}

// Only the already tenant-bound worker process can claim. This is NOT an autonomous runner.
// A crashed lease is reclaimable, attempts increment atomically, and SKIP LOCKED avoids two claims.
export async function claimDueAsyncJobs(tx: Prisma.TransactionClient, input: {
  tenantId: string; workerId: string; now: Date; leaseSeconds: number; limit: number;
}) {
  const { tenantId, workerId, now, leaseSeconds, limit } = input;
  assertAsyncJobTenantId(tenantId);
  if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(workerId)) throw new Error('JOB_WORKER_INVALID');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('JOB_CLOCK_INVALID');
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 900) throw new Error('JOB_LEASE_INVALID');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new Error('JOB_BATCH_INVALID');
  // Database time is authoritative for claim expiry; worker clocks cannot
  // steal a live lease early or complete an already-expired claim.
  return tx.$queryRaw<Array<{id: string; handlerKey: string; payload: unknown; attempts: number; maxAttempts: number; leaseOwner: string}>>(Prisma.sql`
    WITH due AS (
      SELECT "id" FROM public."AsyncJobIntent"
      WHERE "tenantId" = ${tenantId}
        AND (("status" IN ('queued','retry') AND "runAt" <= clock_timestamp())
          OR ("status" = 'running' AND "leaseUntil" <= clock_timestamp()))
        AND "attempts" < "maxAttempts"
      ORDER BY "runAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE public."AsyncJobIntent" AS j
    SET "status"='running', "leaseOwner"=${workerId} || ':' || gen_random_uuid()::text, "leaseUntil"=clock_timestamp() + (${leaseSeconds} * INTERVAL '1 second'),
        "attempts"=j."attempts"+1, "updatedAt"=clock_timestamp()
    FROM due WHERE j."id"=due."id" AND j."tenantId"=${tenantId}
    RETURNING j."id", j."handlerKey", j."payload", j."attempts", j."maxAttempts", j."leaseOwner"
  `);
}

export async function completeClaimedAsyncJob(tx: Prisma.TransactionClient, input: {
  tenantId: string; id: string; leaseToken: string; now: Date;
}) {
  const { tenantId, id, leaseToken, now } = input;
  assertAsyncJobTenantId(tenantId);
  if (!/^[a-zA-Z0-9:_-]{1,120}:[0-9a-f-]{36}$/.test(leaseToken)) throw new Error('JOB_LEASE_TOKEN_INVALID');
  const rows = await tx.$queryRaw<Array<{id: string}>>(Prisma.sql`
    UPDATE public."AsyncJobIntent"
    SET "status"='completed', "leaseOwner"=NULL, "leaseUntil"=NULL, "updatedAt"=clock_timestamp()
    WHERE "tenantId" = ${tenantId} AND "id" = ${id}
      AND "status"='running' AND "leaseOwner" = ${leaseToken} AND "leaseUntil" > clock_timestamp()
    RETURNING "id"
  `);
  if (rows.length !== 1) throw new Error('ASYNC_JOB_LEASE_LOST');
  return rows[0];
}

export async function failClaimedAsyncJob(tx: Prisma.TransactionClient, input: {
  tenantId: string; id: string; leaseToken: string; now: Date;
  attempts: number; maxAttempts: number; retryable: boolean; safeErrorCode: string;
}) {
  const { tenantId, id, leaseToken, now, attempts, maxAttempts, retryable, safeErrorCode } = input;
  assertAsyncJobTenantId(tenantId);
  if (!/^[a-zA-Z0-9:_-]{1,120}:[0-9a-f-]{36}$/.test(leaseToken)) throw new Error('JOB_LEASE_TOKEN_INVALID');
  if (!/^[A-Z0-9_]{1,100}$/.test(safeErrorCode)) throw new Error('JOB_ERROR_CODE_INVALID');
  const decision = planAsyncJobFailure({attempts,maxAttempts,retryable,now});
  // Compute only the bounded delay from the policy; the actual retry instant is
  // owned by PostgreSQL, never by the worker's potentially skewed wall clock.
  const retryDelaySeconds = decision.runAt === null ? null : Math.round((decision.runAt.getTime() - now.getTime()) / 1000);
  const rows = await tx.$queryRaw<Array<{id: string; status: string}>>(Prisma.sql`
    UPDATE public."AsyncJobIntent"
    SET "status"=${decision.status},
        "runAt"=CASE WHEN ${decision.status} = 'retry'
          THEN clock_timestamp() + (${retryDelaySeconds}::integer * INTERVAL '1 second')
          ELSE "runAt" END,
        "leaseOwner"=NULL, "leaseUntil"=NULL, "lastErrorCode"=${safeErrorCode}, "updatedAt"=clock_timestamp()
    WHERE "tenantId"=${tenantId} AND "id"=${id}
      AND "status"='running' AND "leaseOwner"=${leaseToken} AND "leaseUntil">clock_timestamp()
      AND "attempts"=${attempts} AND "maxAttempts"=${maxAttempts}
    RETURNING "id", "status"
  `);
  if (rows.length !== 1) throw new Error('ASYNC_JOB_LEASE_LOST');
  return rows[0];
}

// Heartbeat is a fenced compare-and-set extension, NOT a lease transfer.
// A restarted worker has a fresh claim token and cannot revive its predecessor.
// PostgreSQL clock prevents caller skew from reviving already expired claims.
export async function heartbeatClaimedAsyncJob(tx: Prisma.TransactionClient, input: {
  tenantId: string; id: string; leaseToken: string; leaseSeconds: number;
}) {
  const { tenantId, id, leaseToken, leaseSeconds } = input;
  assertAsyncJobTenantId(tenantId);
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('JOB_ID_INVALID');
  }
  if (!/^[a-zA-Z0-9:_-]{1,120}:[0-9a-f-]{36}$/.test(leaseToken)) throw new Error('JOB_LEASE_TOKEN_INVALID');
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 900) {
    throw new Error('JOB_LEASE_INVALID');
  }
  const rows = await tx.$queryRaw<Array<{id: string; leaseUntil: Date}>>(Prisma.sql`
    UPDATE public."AsyncJobIntent"
    SET "leaseUntil"=GREATEST("leaseUntil", clock_timestamp() + (${leaseSeconds} * INTERVAL '1 second')),
        "updatedAt"=clock_timestamp()
    WHERE "tenantId"=${tenantId} AND "id"=${id}
      AND "status"='running' AND "leaseOwner"=${leaseToken}
      AND "leaseUntil">clock_timestamp()
    RETURNING "id", "leaseUntil"
  `);
  if (rows.length !== 1) throw new Error('ASYNC_JOB_LEASE_LOST');
  return rows[0];
}

// Read-only reconciler view: safe aggregates only, never exposes payload or error text.
// Requires the same tenant-bound transaction/RLS context as claims and heartbeats.
// PostgreSQL bigint counts are returned as decimal strings (no precision loss).
export async function inspectTenantAsyncJobHealth(tx: Prisma.TransactionClient, input: {tenantId: string}) {
  assertAsyncJobTenantId(input.tenantId);
  const tenantId = input.tenantId;
  const rows = await tx.$queryRaw<Array<{
    queued: string; retry: string; running: string; dead: string;
    staleRunning: string; exhaustedRunning: string; oldestDueAt: Date | null;
  }>>(Prisma.sql`
    SELECT
      count(*) FILTER (WHERE "status"='queued')::text AS "queued",
      count(*) FILTER (WHERE "status"='retry')::text AS "retry",
      count(*) FILTER (WHERE "status"='running')::text AS "running",
      count(*) FILTER (WHERE "status"='dead')::text AS "dead",
      count(*) FILTER (WHERE "status"='running' AND "leaseUntil" <= statement_timestamp())::text AS "staleRunning",
      count(*) FILTER (WHERE "status"='running' AND "leaseUntil" <= statement_timestamp()
        AND "attempts" >= "maxAttempts")::text AS "exhaustedRunning",
      min("runAt") FILTER (WHERE "status" IN ('queued','retry')
        AND "runAt" <= statement_timestamp()) AS "oldestDueAt"
    FROM public."AsyncJobIntent"
    WHERE "tenantId"=${tenantId}
  `);
  if (rows.length !== 1) throw new Error('ASYNC_JOB_HEALTH_UNAVAILABLE');
  return rows[0];
}

// Expired last-attempt claims must not remain permanently stuck as running.
// A future tenant-scoped reconciler should run this periodically after binding tenant RLS.
export async function quarantineExhaustedAsyncJobLeases(tx: Prisma.TransactionClient, input: {
  tenantId: string; now: Date; limit: number;
}) {
  const { tenantId, now, limit } = input;
  assertAsyncJobTenantId(tenantId);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('JOB_CLOCK_INVALID');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new Error('JOB_BATCH_INVALID');
  return tx.$queryRaw<Array<{id: string}>>(Prisma.sql`
    WITH exhausted AS (
      SELECT "id" FROM public."AsyncJobIntent"
      WHERE "tenantId" = ${tenantId} AND "status" = 'running'
        AND "leaseUntil" <= clock_timestamp() AND "attempts" >= "maxAttempts"
      ORDER BY "leaseUntil" ASC
      FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE public."AsyncJobIntent" AS j
    SET "status"='dead', "leaseOwner"=NULL, "leaseUntil"=NULL,
        "lastErrorCode"='JOB_LEASE_EXHAUSTED', "updatedAt"=clock_timestamp()
    FROM exhausted WHERE j."id"=exhausted."id" AND j."tenantId"=${tenantId}
    RETURNING j."id"
  `);
}
