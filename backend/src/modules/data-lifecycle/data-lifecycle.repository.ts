import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';

export type LifecycleSemantics = 'immutable' | 'soft-delete' | 'archival' | 'purgeable';
export type LifecycleEntityType = keyof typeof RETENTION_MATRIX;

export const RETENTION_MATRIX = Object.freeze({
  'ledger-entry': { semantics: 'immutable', retentionDays: null, storageBound: false },
  'ledger-line': { semantics: 'immutable', retentionDays: null, storageBound: false },
  'audit-log': { semantics: 'immutable', retentionDays: null, storageBound: false },
  'fiscal-document': { semantics: 'immutable', retentionDays: null, storageBound: true },
  'fiscal-close-evidence': { semantics: 'immutable', retentionDays: null, storageBound: false },
  'client': { semantics: 'soft-delete', retentionDays: null, storageBound: false },
  'supplier': { semantics: 'soft-delete', retentionDays: null, storageBound: false },
  'product': { semantics: 'soft-delete', retentionDays: null, storageBound: true },
  'user-profile': { semantics: 'soft-delete', retentionDays: null, storageBound: true },
  'analytics-event': { semantics: 'purgeable', retentionDays: 180, storageBound: false },
  'notification-log': { semantics: 'purgeable', retentionDays: 180, storageBound: false },
  'address-geocode': { semantics: 'purgeable', retentionDays: 365, storageBound: false },
  'demo-access': { semantics: 'purgeable', retentionDays: 90, storageBound: false },
  'import-batch': { semantics: 'archival', retentionDays: 365, storageBound: false },
  'ai-conversation': { semantics: 'purgeable', retentionDays: 90, storageBound: false },
  'idempotency-record': { semantics: 'purgeable', retentionDays: 30, storageBound: false }
} satisfies Record<string, { semantics: LifecycleSemantics; retentionDays: number | null; storageBound: boolean }>);

const POLICY_SLUG = 'data-lifecycle-policy';
const HOLD_SLUG = 'data-lifecycle-hold';
const JOB_SLUG = 'data-lifecycle-job';

type LifecycleDb = Prisma.TransactionClient;
type PolicyRow = { id: string; payload: unknown; createdAt: Date };
type HoldRow = { id: string };

export function isLifecycleEntityType(value: string): value is LifecycleEntityType {
  return Object.prototype.hasOwnProperty.call(RETENTION_MATRIX, value);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function createRetentionPolicyVersion(input: {
  tenantId: string;
  entityType: LifecycleEntityType;
  retentionDays: number;
  source: string;
  documentation: string;
  actorId?: string | null;
}) {
  const baseline = RETENTION_MATRIX[input.entityType];
  if (baseline.semantics === 'immutable' || baseline.semantics === 'soft-delete') {
    throw new HttpError(409, 'La semántica base de esta entidad no admite purge por una política tenant.', {
      code: 'LIFECYCLE_SEMANTICS_IMMUTABLE', entityType: input.entityType, semantics: baseline.semantics
    });
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ locked: unknown }>>(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${input.entityType}:retention`}, 562)) AS locked
    `);
    const versions = await tx.$queryRaw<Array<{ version: number }>>(Prisma.sql`
      SELECT COALESCE(MAX(("payload"->>'version')::integer), 0)::integer AS version
      FROM public."ModuleRecord"
      WHERE "tenantId"=${input.tenantId}::uuid
        AND "moduleSlug"=${POLICY_SLUG}
        AND "payload"->>'entityType'=${input.entityType}
    `);
    const version = Number(versions[0]?.version || 0) + 1;
    return tx.moduleRecord.create({
      data: {
        tenantId: input.tenantId,
        moduleSlug: POLICY_SLUG,
        title: `${input.entityType}:v${version}`,
        status: 'active',
        payload: {
          entityType: input.entityType,
          version,
          semantics: baseline.semantics,
          retentionDays: input.retentionDays,
          source: input.source,
          documentation: input.documentation,
          actorId: input.actorId || null
        }
      }
    });
  });
}

export async function resolveRetentionPolicy(db: LifecycleDb, tenantId: string, entityType: LifecycleEntityType) {
  const rows = await db.$queryRaw<PolicyRow[]>(Prisma.sql`
    SELECT "id", "payload", "createdAt"
    FROM public."ModuleRecord"
    WHERE "tenantId"=${tenantId}::uuid
      AND "moduleSlug"=${POLICY_SLUG}
      AND "status"='active'
      AND "payload"->>'entityType'=${entityType}
    ORDER BY (("payload"->>'version')::integer) DESC, "createdAt" DESC
    LIMIT 1
  `);
  const baseline = RETENTION_MATRIX[entityType];
  const stored = rows[0] ? asObject(rows[0].payload) : null;
  return {
    entityType,
    semantics: baseline.semantics,
    retentionDays: stored?.retentionDays == null ? baseline.retentionDays : Number(stored.retentionDays),
    version: stored?.version == null ? 0 : Number(stored.version),
    source: stored?.source == null ? 'builtin:RETENTION_MATRIX' : String(stored.source),
    documentation: stored?.documentation == null ? 'Baseline técnico de #562; la validación legal externa sigue separada.' : String(stored.documentation)
  };
}

export async function listRetentionPolicies(tenantId: string) {
  return Promise.all(Object.keys(RETENTION_MATRIX).map((entityType) => resolveRetentionPolicy(prisma as unknown as LifecycleDb, tenantId, entityType as LifecycleEntityType)));
}

export async function createLegalHold(input: {
  tenantId: string;
  entityType: LifecycleEntityType;
  entityId?: string | null;
  reason: string;
  actorId?: string | null;
}) {
  return prisma.moduleRecord.create({
    data: {
      tenantId: input.tenantId,
      moduleSlug: HOLD_SLUG,
      title: input.entityId ? `${input.entityType}:${input.entityId}` : `${input.entityType}:all`,
      status: 'active',
      payload: {
        legalHold: true,
        entityType: input.entityType,
        entityId: input.entityId || null,
        reason: input.reason,
        createdBy: input.actorId || null,
        createdAt: new Date().toISOString()
      }
    }
  });
}

export async function releaseLegalHold(input: { tenantId: string; holdId: string; actorId?: string | null; reason: string }) {
  const hold = await prisma.moduleRecord.findFirst({ where: { id: input.holdId, tenantId: input.tenantId, moduleSlug: HOLD_SLUG, status: 'active' } });
  if (!hold) throw new HttpError(404, 'Legal hold activo no encontrado.', { code: 'LEGAL_HOLD_NOT_FOUND' });
  const payload = asObject(hold.payload);
  return prisma.moduleRecord.update({
    where: { id: hold.id },
    data: {
      status: 'released',
      payload: { ...payload, releasedBy: input.actorId || null, releasedReason: input.reason, releasedAt: new Date().toISOString() }
    }
  });
}

export async function assertNoLegalHold(db: LifecycleDb, tenantId: string, entityType: LifecycleEntityType) {
  const rows = await db.$queryRaw<HoldRow[]>(Prisma.sql`
    SELECT "id"
    FROM public."ModuleRecord"
    WHERE "tenantId"=${tenantId}::uuid
      AND "moduleSlug"=${HOLD_SLUG}
      AND "status"='active'
      AND "payload"->>'entityType'=${entityType}
      AND COALESCE(("payload"->>'legalHold')::boolean, false)=true
    LIMIT 1
  `);
  if (rows.length) {
    throw new HttpError(409, 'La purga está bloqueada por un legal hold activo.', {
      code: 'LEGAL_HOLD_ACTIVE', entityType, legalHoldId: rows[0].id
    });
  }
}

function cutoffDate(retentionDays: number, now = new Date()) {
  return new Date(now.getTime() - retentionDays * 86_400_000);
}

async function countCandidates(db: LifecycleDb, tenantId: string, entityType: LifecycleEntityType, before: Date) {
  switch (entityType) {
    case 'analytics-event': return db.analyticsEvent.count({ where: { tenantId, createdAt: { lt: before } } });
    case 'notification-log': return db.notificationLog.count({ where: { tenantId, createdAt: { lt: before } } });
    case 'address-geocode': return db.addressGeocode.count({ where: { tenantId, createdAt: { lt: before } } });
    case 'demo-access': return db.demoAccess.count({ where: { tenantId, createdAt: { lt: before }, expiresAt: { lt: new Date() } } });
    case 'ai-conversation': return db.aiConversation.count({ where: { tenantId, updatedAt: { lt: before } } });
    case 'idempotency-record': return db.idempotencyRecord.count({ where: { tenantId, createdAt: { lt: before }, expiresAt: { lt: new Date() } } });
    default: return 0;
  }
}

async function deleteCandidates(db: LifecycleDb, tenantId: string, entityType: LifecycleEntityType, before: Date) {
  switch (entityType) {
    case 'analytics-event': return (await db.analyticsEvent.deleteMany({ where: { tenantId, createdAt: { lt: before } } })).count;
    case 'notification-log': return (await db.notificationLog.deleteMany({ where: { tenantId, createdAt: { lt: before } } })).count;
    case 'address-geocode': return (await db.addressGeocode.deleteMany({ where: { tenantId, createdAt: { lt: before } } })).count;
    case 'demo-access': return (await db.demoAccess.deleteMany({ where: { tenantId, createdAt: { lt: before }, expiresAt: { lt: new Date() } } })).count;
    case 'ai-conversation': return (await db.aiConversation.deleteMany({ where: { tenantId, updatedAt: { lt: before } } })).count;
    case 'idempotency-record': return (await db.idempotencyRecord.deleteMany({ where: { tenantId, createdAt: { lt: before }, expiresAt: { lt: new Date() } } })).count;
    default: throw new HttpError(409, 'La entidad no admite purge físico.', { code: 'LIFECYCLE_PURGE_NOT_ALLOWED', entityType });
  }
}

export async function executeLifecyclePurge(db: LifecycleDb, input: {
  tenantId: string;
  entityType: LifecycleEntityType;
  execute: boolean;
  actorId?: string | null;
}) {
  const policy = await resolveRetentionPolicy(db, input.tenantId, input.entityType);
  if (policy.semantics !== 'purgeable') {
    throw new HttpError(409, 'La matriz de lifecycle no permite purge físico para esta entidad.', {
      code: 'LIFECYCLE_PURGE_NOT_ALLOWED', entityType: input.entityType, semantics: policy.semantics
    });
  }
  if (!policy.retentionDays || policy.retentionDays < 1) {
    throw new HttpError(409, 'La política no define una retención válida para purge.', { code: 'LIFECYCLE_RETENTION_INVALID' });
  }
  await assertNoLegalHold(db, input.tenantId, input.entityType);
  const before = cutoffDate(policy.retentionDays);
  const candidates = await countCandidates(db, input.tenantId, input.entityType, before);
  const deleted = input.execute ? await deleteCandidates(db, input.tenantId, input.entityType, before) : 0;
  const evidence = {
    entityType: input.entityType,
    policyVersion: policy.version,
    retentionDays: policy.retentionDays,
    cutoff: before.toISOString(),
    candidates,
    deleted,
    executed: input.execute,
    evidenceOnly: true
  };
  const jobId = randomUUID();
  await db.moduleRecord.create({
    data: {
      id: jobId,
      tenantId: input.tenantId,
      moduleSlug: JOB_SLUG,
      title: `${input.entityType}:${jobId}`,
      status: input.execute ? 'completed' : 'preview',
      payload: {
        ...evidence,
        actorId: input.actorId || null,
        recordIdentityPolicy: 'counts-and-cutoff-only'
      }
    }
  });
  return { jobId, ...evidence };
}

export type LifecycleStorageAdapter = {
  list(prefix: string): Promise<string[]>;
  remove(paths: string[]): Promise<void>;
};

export async function reconcileStorageOrphans(input: {
  tenantId: string;
  referencedPaths: string[];
  adapter: LifecycleStorageAdapter;
  execute: boolean;
}) {
  const prefix = `${input.tenantId}/`;
  const referenced = new Set(input.referencedPaths.filter((path) => path.startsWith(prefix)));
  const listed = await input.adapter.list(prefix);
  const foreign = listed.filter((path) => !path.startsWith(prefix));
  if (foreign.length) throw new HttpError(502, 'El storage adapter devolvió objetos fuera del tenant solicitado.', { code: 'LIFECYCLE_STORAGE_SCOPE_VIOLATION' });
  const orphans = listed.filter((path) => !referenced.has(path));
  if (input.execute && orphans.length) await input.adapter.remove(orphans);
  return { tenantId: input.tenantId, prefix, referenced: referenced.size, scanned: listed.length, orphanCount: orphans.length, orphans, removed: input.execute ? orphans.length : 0 };
}
