import crypto, { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';

export type DeleteSemantics = 'mutable' | 'soft_delete' | 'immutable' | 'archive' | 'purge';
export type LifecycleOperation = 'archive' | 'purge' | 'tenant_export' | 'tenant_delete' | 'storage_reconcile';

type RetentionPolicyRow = {
  id: string;
  tenantId: string | null;
  entityType: string;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  retentionDays: number | null;
  archiveAfterDays: number | null;
  deleteSemantics: DeleteSemantics;
  purgeable: boolean;
  source: string;
  documentation: string;
  policy: unknown;
  contentHash: string;
  createdBy: string | null;
  createdAt: Date;
};

type LifecycleJobRow = {
  id: string;
  tenantId: string;
  operation: LifecycleOperation;
  entityType: string | null;
  idempotencyKey: string;
  requestHash: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  cursor: Record<string, unknown>;
  result: Record<string, unknown>;
  attempts: number;
  requestedBy: string | null;
  authorizationRef: string | null;
  lastError: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StorageObjectRow = {
  id: string;
  tenantId: string;
  bucket: string;
  objectKey: string;
  lifecycleEntityType: 'MediaObject' | 'ClinicalMediaObject';
  subjectType: string | null;
  subjectId: string | null;
  checksum: string | null;
  status: 'active' | 'deleted' | 'orphaned';
  createdAt: Date;
  lastVerifiedAt: Date | null;
  deletedAt: Date | null;
};

const PROTECTED_ENTITIES = new Set(['AuditLog', 'LedgerEntry', 'FiscalDocument', 'FiscalCloseEvidence', 'ClinicalMediaObject', 'CarePatient']);
const PURGE_ADAPTER_ENTITIES = new Set(['AnalyticsEvent', 'ImportBatch', 'NotificationLog', 'AddressGeocode']);

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  return String(value);
}

export function lifecycleEvidenceHash(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

export async function createRetentionPolicyVersion(input: {
  tenantId: string;
  entityType: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  retentionDays?: number | null;
  archiveAfterDays?: number | null;
  deleteSemantics: DeleteSemantics;
  purgeable: boolean;
  source: string;
  documentation: string;
  policy?: Record<string, unknown>;
  createdBy?: string | null;
}) {
  if (PROTECTED_ENTITIES.has(input.entityType) && (input.purgeable || input.deleteSemantics === 'purge')) {
    throw new HttpError(409, 'La clasificación protegida no puede convertirse en purgeable mediante una política tenant.', { code: 'PROTECTED_ENTITY_PURGE_FORBIDDEN', entityType: input.entityType });
  }
  if (input.purgeable && input.retentionDays == null && input.entityType !== 'MediaObject') {
    throw new HttpError(422, 'Una política purgeable requiere retentionDays explícito.', { code: 'RETENTION_NOT_CONFIGURED', entityType: input.entityType });
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${input.entityType}`}, 562))
    `);
    const versions = await tx.$queryRaw<Array<{ version: number }>>(Prisma.sql`
      SELECT COALESCE(MAX("version"), 0)::integer AS "version"
      FROM public."DataRetentionPolicyVersion"
      WHERE "tenantId" = ${input.tenantId}::uuid AND "entityType" = ${input.entityType}
    `);
    const version = Number(versions[0]?.version || 0) + 1;
    const id = randomUUID();
    const rows = await tx.$queryRaw<RetentionPolicyRow[]>(Prisma.sql`
      INSERT INTO public."DataRetentionPolicyVersion" (
        "id", "tenantId", "entityType", "version", "effectiveFrom", "effectiveTo",
        "retentionDays", "archiveAfterDays", "deleteSemantics", "purgeable",
        "source", "documentation", "policy", "contentHash", "createdBy"
      ) VALUES (
        ${id}::uuid, ${input.tenantId}::uuid, ${input.entityType}, ${version}, ${input.effectiveFrom}, ${input.effectiveTo || null},
        ${input.retentionDays ?? null}, ${input.archiveAfterDays ?? null}, ${input.deleteSemantics}, ${input.purgeable},
        ${input.source}, ${input.documentation}, ${JSON.stringify(input.policy || {})}::jsonb, 'pending', ${input.createdBy || null}
      ) RETURNING *
    `);
    return rows[0];
  });
}

export async function listRetentionPolicies(tenantId: string, entityType?: string) {
  return prisma.$queryRaw<RetentionPolicyRow[]>(Prisma.sql`
    SELECT *
    FROM public."DataRetentionPolicyVersion"
    WHERE ("tenantId" = ${tenantId}::uuid OR "tenantId" IS NULL)
      AND (${entityType || null}::text IS NULL OR "entityType" = ${entityType || null})
    ORDER BY "entityType" ASC, ("tenantId" IS NOT NULL) DESC, "version" DESC
    LIMIT 1000
  `);
}

export async function resolveRetentionPolicy(tenantId: string, entityType: string, at = new Date()) {
  const rows = await prisma.$queryRaw<RetentionPolicyRow[]>(Prisma.sql`
    SELECT *
    FROM public."DataRetentionPolicyVersion"
    WHERE "entityType" = ${entityType}
      AND ("tenantId" = ${tenantId}::uuid OR "tenantId" IS NULL)
      AND "effectiveFrom" <= ${at}
      AND ("effectiveTo" IS NULL OR "effectiveTo" > ${at})
    ORDER BY ("tenantId" IS NOT NULL) DESC, "effectiveFrom" DESC, "version" DESC
    LIMIT 1
  `);
  if (!rows[0]) throw new HttpError(422, 'No existe política de retención vigente para la entidad.', { code: 'RETENTION_POLICY_MISSING', entityType });
  return rows[0];
}

export async function createLegalHold(input: {
  tenantId: string;
  scopeType: 'tenant' | 'entity' | 'record';
  entityType?: string | null;
  recordId?: string | null;
  reason: string;
  authorizationRef: string;
  createdBy?: string | null;
}) {
  const id = randomUUID();
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO public."DataLegalHold" (
      "id", "tenantId", "scopeType", "entityType", "recordId", "reason", "authorizationRef", "createdBy"
    ) VALUES (
      ${id}::uuid, ${input.tenantId}::uuid, ${input.scopeType}, ${input.entityType || null}, ${input.recordId || null},
      ${input.reason}, ${input.authorizationRef}, ${input.createdBy || null}
    ) RETURNING *
  `);
  return rows[0];
}

export async function listLegalHolds(tenantId: string, activeOnly = true) {
  return prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT * FROM public."DataLegalHold"
    WHERE "tenantId" = ${tenantId}::uuid
      AND (${activeOnly} = false OR "active" = true)
    ORDER BY "createdAt" DESC
    LIMIT 1000
  `);
}

export async function releaseLegalHold(input: {
  tenantId: string;
  holdId: string;
  releasedBy?: string | null;
  authorizationRef: string;
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT set_config('contagest.lifecycle_hold_release', 'true', true)`);
    const rows = await tx.$queryRaw<any[]>(Prisma.sql`
      UPDATE public."DataLegalHold"
      SET "active" = false,
          "releasedAt" = CURRENT_TIMESTAMP,
          "releasedBy" = ${input.releasedBy || null},
          "releaseAuthorizationRef" = ${input.authorizationRef},
          "releaseReason" = ${input.reason}
      WHERE "id" = ${input.holdId}::uuid
        AND "tenantId" = ${input.tenantId}::uuid
        AND "active" = true
      RETURNING *
    `);
    if (!rows[0]) throw new HttpError(404, 'Legal hold activo no encontrado en el tenant.');
    return rows[0];
  });
}

export async function assertNoLegalHold(tenantId: string, entityType: string, recordId?: string | null) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM public."DataLegalHold"
    WHERE "tenantId" = ${tenantId}::uuid
      AND "active" = true
      AND (
        "scopeType" = 'tenant'
        OR ("scopeType" = 'entity' AND "entityType" = ${entityType})
        OR (
          "scopeType" = 'record'
          AND "entityType" = ${entityType}
          AND (${recordId || null}::text IS NULL OR "recordId" = ${recordId || null})
        )
      )
    LIMIT 1
  `);
  if (rows[0]) throw new HttpError(423, 'Existe un legal hold activo que bloquea la operación destructiva.', { code: 'LEGAL_HOLD_ACTIVE', entityType });
}

export async function claimLifecycleJob(input: {
  tenantId: string;
  operation: LifecycleOperation;
  entityType?: string | null;
  idempotencyKey: string;
  requestedBy?: string | null;
  authorizationRef?: string | null;
  request?: Record<string, unknown>;
}) {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) throw new HttpError(400, 'idempotencyKey es obligatorio.');
  const requestHash = lifecycleEvidenceHash({
    tenantId: input.tenantId,
    operation: input.operation,
    entityType: input.entityType || null,
    authorizationRef: input.authorizationRef || null,
    request: input.request || {}
  });
  const id = randomUUID();
  const inserted = await prisma.$queryRaw<LifecycleJobRow[]>(Prisma.sql`
    INSERT INTO public."DataLifecycleJob" (
      "id", "tenantId", "operation", "entityType", "idempotencyKey", "requestHash", "requestedBy", "authorizationRef"
    ) VALUES (
      ${id}::uuid, ${input.tenantId}::uuid, ${input.operation}, ${input.entityType || null}, ${idempotencyKey}, ${requestHash},
      ${input.requestedBy || null}, ${input.authorizationRef || null}
    )
    ON CONFLICT ("tenantId", "operation", "idempotencyKey") DO NOTHING
    RETURNING *
  `);
  if (inserted[0]) return inserted[0];

  const existing = await prisma.$queryRaw<LifecycleJobRow[]>(Prisma.sql`
    SELECT * FROM public."DataLifecycleJob"
    WHERE "tenantId" = ${input.tenantId}::uuid AND "operation" = ${input.operation} AND "idempotencyKey" = ${idempotencyKey}
    LIMIT 1
  `);
  if (!existing[0]) throw new HttpError(500, 'No fue posible recuperar el job idempotente.');
  if (existing[0].requestHash !== requestHash) {
    throw new HttpError(409, 'La misma clave idempotente fue usada con una solicitud diferente.', { code: 'IDEMPOTENCY_CONFLICT' });
  }
  return existing[0];
}

export async function resumeLifecycleJob(tenantId: string, jobId: string) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<LifecycleJobRow[]>(Prisma.sql`
      SELECT * FROM public."DataLifecycleJob"
      WHERE "id" = ${jobId}::uuid AND "tenantId" = ${tenantId}::uuid
      LIMIT 1 FOR UPDATE
    `);
    const job = rows[0];
    if (!job) throw new HttpError(404, 'Job de lifecycle no encontrado en el tenant.');
    if (job.status === 'completed') return job;
    if (job.status === 'blocked') throw new HttpError(423, 'El job está bloqueado y requiere resolver sus prechecks.', { code: 'LIFECYCLE_JOB_BLOCKED' });

    const updated = await tx.$queryRaw<LifecycleJobRow[]>(Prisma.sql`
      UPDATE public."DataLifecycleJob"
      SET "status" = 'running', "attempts" = "attempts" + 1,
          "startedAt" = COALESCE("startedAt", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP, "lastError" = NULL
      WHERE "id" = ${jobId}::uuid AND "tenantId" = ${tenantId}::uuid
      RETURNING *
    `);
    return updated[0];
  });
}

export async function requestPurgeJob(input: {
  tenantId: string;
  entityType: string;
  idempotencyKey: string;
  authorizationRef: string;
  requestedBy?: string | null;
  batchSize?: number;
}) {
  if (!PURGE_ADAPTER_ENTITIES.has(input.entityType)) {
    throw new HttpError(422, 'La entidad no tiene un adapter de purge explícito.', { code: 'PURGE_ADAPTER_MISSING', entityType: input.entityType });
  }
  const policy = await resolveRetentionPolicy(input.tenantId, input.entityType);
  if (!policy.purgeable || policy.retentionDays == null) {
    throw new HttpError(422, 'La política vigente no autoriza purge o no define retentionDays.', { code: 'RETENTION_NOT_CONFIGURED', entityType: input.entityType });
  }
  await assertNoLegalHold(input.tenantId, input.entityType);
  const batchSize = Math.min(Math.max(Number(input.batchSize || 250), 1), 1000);
  return claimLifecycleJob({
    tenantId: input.tenantId,
    operation: 'purge',
    entityType: input.entityType,
    idempotencyKey: input.idempotencyKey,
    requestedBy: input.requestedBy,
    authorizationRef: input.authorizationRef,
    request: { batchSize, policyId: policy.id, policyHash: policy.contentHash }
  });
}

async function deletePurgeableRows(tenantId: string, entityType: string, cutoff: Date, batchSize: number) {
  if (entityType === 'AnalyticsEvent') {
    return prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH target AS (
        SELECT "id" FROM public."AnalyticsEvent"
        WHERE "tenantId" = ${tenantId}::uuid AND "createdAt" < ${cutoff}
        ORDER BY "createdAt", "id" LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM public."AnalyticsEvent" e USING target t
      WHERE e."id" = t."id" AND e."tenantId" = ${tenantId}::uuid
      RETURNING e."id"
    `);
  }
  if (entityType === 'ImportBatch') {
    return prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH target AS (
        SELECT "id" FROM public."ImportBatch"
        WHERE "tenantId" = ${tenantId}::uuid AND "createdAt" < ${cutoff}
        ORDER BY "createdAt", "id" LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM public."ImportBatch" e USING target t
      WHERE e."id" = t."id" AND e."tenantId" = ${tenantId}::uuid
      RETURNING e."id"
    `);
  }
  if (entityType === 'NotificationLog') {
    return prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH target AS (
        SELECT "id" FROM public."NotificationLog"
        WHERE "tenantId" = ${tenantId}::uuid AND "createdAt" < ${cutoff}
        ORDER BY "createdAt", "id" LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM public."NotificationLog" e USING target t
      WHERE e."id" = t."id" AND e."tenantId" = ${tenantId}::uuid
      RETURNING e."id"
    `);
  }
  if (entityType === 'AddressGeocode') {
    return prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH target AS (
        SELECT "id" FROM public."AddressGeocode"
        WHERE "tenantId" = ${tenantId}::uuid AND "createdAt" < ${cutoff}
        ORDER BY "createdAt", "id" LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM public."AddressGeocode" e USING target t
      WHERE e."id" = t."id" AND e."tenantId" = ${tenantId}::uuid
      RETURNING e."id"
    `);
  }
  throw new HttpError(422, 'Adapter de purge no disponible.', { code: 'PURGE_ADAPTER_MISSING', entityType });
}

async function persistLifecycleEvidence(input: {
  tenantId: string;
  jobId: string;
  action: string;
  entityType: string;
  ids: string[];
  details: Record<string, unknown>;
}) {
  const sortedDigests = input.ids.map((id) => lifecycleEvidenceHash({ entityType: input.entityType, id })).sort();
  const subjectDigest = lifecycleEvidenceHash(sortedDigests);
  const evidenceHash = lifecycleEvidenceHash({
    tenantId: input.tenantId,
    jobId: input.jobId,
    action: input.action,
    entityType: input.entityType,
    subjectDigest,
    recordCount: input.ids.length,
    details: input.details
  });
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO public."DataLifecycleEvidence" (
      "tenantId", "jobId", "action", "entityType", "subjectDigest", "recordCount", "details", "evidenceHash"
    ) VALUES (
      ${input.tenantId}::uuid, ${input.jobId}::uuid, ${input.action}, ${input.entityType}, ${subjectDigest}, ${input.ids.length},
      ${JSON.stringify(input.details)}::jsonb, ${evidenceHash}
    )
  `);
  return { subjectDigest, evidenceHash };
}

export async function executePurgeBatch(input: { tenantId: string; jobId: string; batchSize?: number }) {
  const job = await resumeLifecycleJob(input.tenantId, input.jobId);
  if (job.status === 'completed') return job;
  const entityType = job.entityType || '';
  const batchSize = Math.min(Math.max(Number(input.batchSize || 250), 1), 1000);

  try {
    const policy = await resolveRetentionPolicy(input.tenantId, entityType);
    if (!policy.purgeable || policy.retentionDays == null) {
      throw new HttpError(422, 'La política vigente ya no autoriza purge.', { code: 'RETENTION_NOT_CONFIGURED', entityType });
    }
    await assertNoLegalHold(input.tenantId, entityType);
    const cutoff = new Date(Date.now() - policy.retentionDays * 86_400_000);
    const deleted = await deletePurgeableRows(input.tenantId, entityType, cutoff, batchSize);
    const details = { cutoff: cutoff.toISOString(), batchSize, policyId: policy.id, policyHash: policy.contentHash };
    const evidence = await persistLifecycleEvidence({ tenantId: input.tenantId, jobId: job.id, action: 'purge', entityType, ids: deleted.map((row) => String(row.id)), details });
    const completed = deleted.length < batchSize;
    const result = { deletedCount: deleted.length, ...evidence, ...details };
    const rows = await prisma.$queryRaw<LifecycleJobRow[]>(Prisma.sql`
      UPDATE public."DataLifecycleJob"
      SET "status" = ${completed ? 'completed' : 'pending'},
          "cursor" = ${JSON.stringify({ lastRunAt: new Date().toISOString(), deletedCount: deleted.length })}::jsonb,
          "result" = ${JSON.stringify(result)}::jsonb,
          "completedAt" = ${completed ? new Date() : null},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${job.id}::uuid AND "tenantId" = ${input.tenantId}::uuid
      RETURNING *
    `);
    return rows[0];
  } catch (error) {
    const blocked = error instanceof HttpError && error.details && typeof error.details === 'object' && (error.details as any).code === 'LEGAL_HOLD_ACTIVE';
    await prisma.$executeRaw(Prisma.sql`
      UPDATE public."DataLifecycleJob"
      SET "status" = ${blocked ? 'blocked' : 'failed'}, "lastError" = ${error instanceof Error ? error.message.slice(0, 1000) : 'unknown error'}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${job.id}::uuid AND "tenantId" = ${input.tenantId}::uuid
    `);
    throw error;
  }
}

export async function registerStorageObject(input: {
  tenantId: string;
  bucket: string;
  objectKey: string;
  lifecycleEntityType: 'MediaObject' | 'ClinicalMediaObject';
  subjectType?: string | null;
  subjectId?: string | null;
  checksum?: string | null;
}) {
  const rows = await prisma.$queryRaw<StorageObjectRow[]>(Prisma.sql`
    INSERT INTO public."DataStorageObject" (
      "tenantId", "bucket", "objectKey", "lifecycleEntityType", "subjectType", "subjectId", "checksum", "status", "lastVerifiedAt"
    ) VALUES (
      ${input.tenantId}::uuid, ${input.bucket}, ${input.objectKey}, ${input.lifecycleEntityType}, ${input.subjectType || null}, ${input.subjectId || null}, ${input.checksum || null}, 'active', CURRENT_TIMESTAMP
    )
    ON CONFLICT ("tenantId", "bucket", "objectKey") DO UPDATE SET
      "lifecycleEntityType" = EXCLUDED."lifecycleEntityType",
      "subjectType" = EXCLUDED."subjectType",
      "subjectId" = EXCLUDED."subjectId",
      "checksum" = COALESCE(EXCLUDED."checksum", public."DataStorageObject"."checksum"),
      "status" = 'active', "deletedAt" = NULL, "lastVerifiedAt" = CURRENT_TIMESTAMP
    RETURNING *
  `);
  return rows[0];
}

export async function markStorageObjectDeleted(input: { tenantId: string; bucket: string; objectKey: string }) {
  const rows = await prisma.$queryRaw<StorageObjectRow[]>(Prisma.sql`
    UPDATE public."DataStorageObject"
    SET "status" = 'deleted', "deletedAt" = COALESCE("deletedAt", CURRENT_TIMESTAMP), "lastVerifiedAt" = CURRENT_TIMESTAMP
    WHERE "tenantId" = ${input.tenantId}::uuid AND "bucket" = ${input.bucket} AND "objectKey" = ${input.objectKey}
    RETURNING *
  `);
  if (rows[0]) return rows[0];
  const inserted = await prisma.$queryRaw<StorageObjectRow[]>(Prisma.sql`
    INSERT INTO public."DataStorageObject" (
      "tenantId", "bucket", "objectKey", "lifecycleEntityType", "subjectType", "status", "deletedAt", "lastVerifiedAt"
    ) VALUES (
      ${input.tenantId}::uuid, ${input.bucket}, ${input.objectKey}, 'MediaObject', 'legacy', 'deleted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) RETURNING *
  `);
  return inserted[0];
}

export async function listStorageObjects(tenantId: string, bucket?: string) {
  return prisma.$queryRaw<StorageObjectRow[]>(Prisma.sql`
    SELECT * FROM public."DataStorageObject"
    WHERE "tenantId" = ${tenantId}::uuid
      AND (${bucket || null}::text IS NULL OR "bucket" = ${bucket || null})
    ORDER BY "createdAt", "objectKey"
  `);
}

export function detectStorageOrphans(registered: Array<Pick<StorageObjectRow, 'objectKey' | 'status'>>, existingObjectKeys: Iterable<string>) {
  const activeRegistered = new Set(registered.filter((row) => row.status === 'active').map((row) => row.objectKey));
  const existing = new Set(Array.from(existingObjectKeys, String));
  const missingObjects = [...activeRegistered].filter((key) => !existing.has(key)).sort();
  const unregisteredObjects = [...existing].filter((key) => !activeRegistered.has(key)).sort();
  const alignedObjects = [...activeRegistered].filter((key) => existing.has(key)).sort();
  return { missingObjects, unregisteredObjects, alignedObjects };
}

export async function assertStorageDeletionAllowed(input: { tenantId: string; bucket: string; objectKey: string }) {
  await assertNoLegalHold(input.tenantId, 'MediaObject', input.objectKey);
  const policy = await resolveRetentionPolicy(input.tenantId, 'MediaObject');
  if (!policy.purgeable || policy.retentionDays == null) {
    throw new HttpError(422, 'La política vigente no autoriza eliminar media.', { code: 'RETENTION_NOT_CONFIGURED', entityType: 'MediaObject' });
  }
  if (policy.retentionDays === 0) return policy;

  const rows = await prisma.$queryRaw<Array<{ createdAt: Date }>>(Prisma.sql`
    SELECT "createdAt" FROM public."DataStorageObject"
    WHERE "tenantId" = ${input.tenantId}::uuid AND "bucket" = ${input.bucket} AND "objectKey" = ${input.objectKey} AND "status" = 'active'
    LIMIT 1
  `);
  if (!rows[0]) throw new HttpError(409, 'No existe evidencia de antigüedad para autorizar el borrado de media legacy.', { code: 'STORAGE_RETENTION_AGE_UNKNOWN' });
  const eligibleAt = rows[0].createdAt.getTime() + policy.retentionDays * 86_400_000;
  if (eligibleAt > Date.now()) throw new HttpError(423, 'El objeto aún está dentro de su ventana de retención.', { code: 'RETENTION_WINDOW_ACTIVE', eligibleAt: new Date(eligibleAt).toISOString() });
  return policy;
}

async function countRows(sql: Prisma.Sql) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(sql);
  return Number(rows[0]?.count || 0n);
}

export async function buildTenantExportManifest(tenantId: string) {
  const [users, clients, suppliers, products, sales, purchases, ledger, audit, fiscal, storage] = await Promise.all([
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."UserProfile" WHERE "tenantId" = ${tenantId}::uuid`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."Client" WHERE "tenantId" = ${tenantId}::uuid`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."Supplier" WHERE "tenantId" = ${tenantId}::uuid`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."Product" WHERE "tenantId" = ${tenantId}::uuid`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."SalesInvoice" WHERE "tenantId" = ${tenantId}::uuid`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."PurchaseInvoice" WHERE "tenantId" = ${tenantId}::uuid`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."LedgerEntry" WHERE "tenantId" = ${tenantId}::uuid`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."AuditLog" WHERE "tenantId" = ${tenantId}::uuid`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."FiscalDocument" WHERE "tenantId" = ${tenantId}::uuid`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."DataStorageObject" WHERE "tenantId" = ${tenantId}::uuid AND "status" = 'active'`)
  ]);
  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    counts: { users, clients, suppliers, products, sales, purchases, ledger, audit, fiscal, storage },
    note: 'Lifecycle export manifest only; payload export remains delegated to explicit domain export adapters.'
  };
}

export async function requestTenantExport(input: { tenantId: string; idempotencyKey: string; requestedBy?: string | null }) {
  const job = await claimLifecycleJob({ tenantId: input.tenantId, operation: 'tenant_export', idempotencyKey: input.idempotencyKey, requestedBy: input.requestedBy, request: { kind: 'manifest' } });
  if (job.status === 'completed') return job;
  const manifest = await buildTenantExportManifest(input.tenantId);
  const rows = await prisma.$queryRaw<LifecycleJobRow[]>(Prisma.sql`
    UPDATE public."DataLifecycleJob"
    SET "status" = 'completed', "result" = ${JSON.stringify(manifest)}::jsonb, "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${job.id}::uuid AND "tenantId" = ${input.tenantId}::uuid
    RETURNING *
  `);
  return rows[0];
}

export async function buildTenantDeletionPrecheck(tenantId: string) {
  const [holds, ledger, audit, fiscalDocuments, closeEvidence, activeStorage, unfinishedJobs] = await Promise.all([
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."DataLegalHold" WHERE "tenantId" = ${tenantId}::uuid AND "active" = true`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."LedgerEntry" WHERE "tenantId" = ${tenantId}::uuid`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."AuditLog" WHERE "tenantId" = ${tenantId}::uuid`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."FiscalDocument" WHERE "tenantId" = ${tenantId}::uuid`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."FiscalCloseEvidence" WHERE "tenantId" = ${tenantId}::uuid`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."DataStorageObject" WHERE "tenantId" = ${tenantId}::uuid AND "status" = 'active'`),
    countRows(Prisma.sql`SELECT count(*)::bigint AS count FROM public."DataLifecycleJob" WHERE "tenantId" = ${tenantId}::uuid AND "status" IN ('pending','running','failed') AND "operation" <> 'tenant_delete'`)
  ]);
  const blockers = { holds, ledger, audit, fiscalDocuments, closeEvidence, activeStorage, unfinishedJobs };
  return { allowed: Object.values(blockers).every((value) => value === 0), blockers };
}

export async function requestTenantDeletion(input: {
  tenantId: string;
  idempotencyKey: string;
  authorizationRef: string;
  requestedBy?: string | null;
}) {
  const precheck = await buildTenantDeletionPrecheck(input.tenantId);
  const job = await claimLifecycleJob({
    tenantId: input.tenantId,
    operation: 'tenant_delete',
    idempotencyKey: input.idempotencyKey,
    requestedBy: input.requestedBy,
    authorizationRef: input.authorizationRef,
    request: { precheck }
  });
  if (!precheck.allowed && job.status !== 'completed') {
    const rows = await prisma.$queryRaw<LifecycleJobRow[]>(Prisma.sql`
      UPDATE public."DataLifecycleJob"
      SET "status" = 'blocked', "result" = ${JSON.stringify({ precheck, destructiveExecutionAvailable: false })}::jsonb,
          "lastError" = 'Tenant deletion prechecks are not satisfied.', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${job.id}::uuid AND "tenantId" = ${input.tenantId}::uuid
      RETURNING *
    `);
    return rows[0];
  }
  return job;
}
