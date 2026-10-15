import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prepareAsyncJobIntent, planAsyncJobFailure } from './job-intent-policy.js';

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
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error('JOB_TENANT_INVALID');
  if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(workerId)) throw new Error('JOB_WORKER_INVALID');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('JOB_CLOCK_INVALID');
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 900) throw new Error('JOB_LEASE_INVALID');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new Error('JOB_BATCH_INVALID');
  const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000);
  return tx.$queryRaw<Array<{id: string; handlerKey: string; payload: unknown; attempts: number; maxAttempts: number; leaseOwner: string}>>(Prisma.sql`
    WITH due AS (
      SELECT "id" FROM public."AsyncJobIntent"
      WHERE "tenantId" = ${tenantId}
        AND (("status" IN ('queued','retry') AND "runAt" <= ${now})
          OR ("status" = 'running' AND "leaseUntil" <= ${now}))
        AND "attempts" < "maxAttempts"
      ORDER BY "runAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE public."AsyncJobIntent" AS j
    SET "status"='running', "leaseOwner"=${workerId} || ':' || gen_random_uuid()::text, "leaseUntil"=${leaseUntil},
        "attempts"=j."attempts"+1, "updatedAt"=${now}
    FROM due WHERE j."id"=due."id" AND j."tenantId"=${tenantId}
    RETURNING j."id", j."handlerKey", j."payload", j."attempts", j."maxAttempts", j."leaseOwner"
  `);
}

export async function completeClaimedAsyncJob(tx: Prisma.TransactionClient, input: {
  tenantId: string; id: string; leaseToken: string; now: Date;
}) {
  const { tenantId, id, leaseToken, now } = input;
  if (!/^[a-zA-Z0-9:_-]{1,120}:[0-9a-f-]{36}$/.test(leaseToken)) throw new Error('JOB_LEASE_TOKEN_INVALID');
  const rows = await tx.$queryRaw<Array<{id: string}>>(Prisma.sql`
    UPDATE public."AsyncJobIntent"
    SET "status"='completed', "leaseOwner"=NULL, "leaseUntil"=NULL, "updatedAt"=${now}
    WHERE "tenantId" = ${tenantId} AND "id" = ${id}
      AND "status"='running' AND "leaseOwner" = ${leaseToken} AND "leaseUntil" > ${now}
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
  if (!/^[a-zA-Z0-9:_-]{1,120}:[0-9a-f-]{36}$/.test(leaseToken)) throw new Error('JOB_LEASE_TOKEN_INVALID');
  if (!/^[A-Z0-9_]{1,100}$/.test(safeErrorCode)) throw new Error('JOB_ERROR_CODE_INVALID');
  const decision = planAsyncJobFailure({attempts,maxAttempts,retryable,now});
  const rows = await tx.$queryRaw<Array<{id: string; status: string}>>(Prisma.sql`
    UPDATE public."AsyncJobIntent"
    SET "status"=${decision.status}, "runAt"=COALESCE(${decision.runAt}, "runAt"),
        "leaseOwner"=NULL, "leaseUntil"=NULL, "lastErrorCode"=${safeErrorCode}, "updatedAt"=${now}
    WHERE "tenantId"=${tenantId} AND "id"=${id}
      AND "status"='running' AND "leaseOwner"=${leaseToken} AND "leaseUntil">${now}
      AND "attempts"=${attempts} AND "maxAttempts"=${maxAttempts}
    RETURNING "id", "status"
  `);
  if (rows.length !== 1) throw new Error('ASYNC_JOB_LEASE_LOST');
  return rows[0];
}

// Expired last-attempt claims must not remain permanently stuck as running.
// A future tenant-scoped reconciler should run this periodically after binding tenant RLS.
export async function quarantineExhaustedAsyncJobLeases(tx: Prisma.TransactionClient, input: {
  tenantId: string; now: Date; limit: number;
}) {
  const { tenantId, now, limit } = input;
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error('JOB_TENANT_INVALID');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('JOB_CLOCK_INVALID');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new Error('JOB_BATCH_INVALID');
  return tx.$queryRaw<Array<{id: string}>>(Prisma.sql`
    WITH exhausted AS (
      SELECT "id" FROM public."AsyncJobIntent"
      WHERE "tenantId" = ${tenantId} AND "status" = 'running'
        AND "leaseUntil" <= ${now} AND "attempts" >= "maxAttempts"
      ORDER BY "leaseUntil" ASC
      FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE public."AsyncJobIntent" AS j
    SET "status"='dead', "leaseOwner"=NULL, "leaseUntil"=NULL,
        "lastErrorCode"='JOB_LEASE_EXHAUSTED', "updatedAt"=${now}
    FROM exhausted WHERE j."id"=exhausted."id" AND j."tenantId"=${tenantId}
    RETURNING j."id"
  `);
}
