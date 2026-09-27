import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { runFinancialIdempotentMutation } from '../../shared/services/financial-idempotency.service.js';
import {
  RETENTION_MATRIX,
  createLegalHold,
  createRetentionPolicyVersion,
  executeLifecyclePurge,
  isLifecycleEntityType,
  listRetentionPolicies,
  releaseLegalHold,
  type LifecycleEntityType
} from './data-lifecycle.repository.js';

const router = Router();
router.use(requireTenant, requirePermission('platform.manage'));

type RequestContext = { tenantId: string; userId?: string; ip?: string; userAgent?: string; requestId?: string };
const context = (req: Request) => (req as Request & { context: RequestContext }).context;

const entityTypeSchema = z.string().trim().min(2).max(80).refine(isLifecycleEntityType, 'entityType no pertenece a la matriz lifecycle.');
const policySchema = z.object({
  entityType: entityTypeSchema,
  retentionDays: z.number().int().min(1).max(36500),
  source: z.string().trim().min(3).max(240),
  documentation: z.string().trim().min(3).max(1000)
}).strict();
const holdSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.string().trim().min(1).max(180).optional().nullable(),
  reason: z.string().trim().min(5).max(1000)
}).strict();
const releaseHoldSchema = z.object({ reason: z.string().trim().min(5).max(1000) }).strict();
const purgeSchema = z.object({ entityType: entityTypeSchema, execute: z.boolean().default(false) }).strict();

function lifecycleEntity(value: unknown): LifecycleEntityType {
  const parsed = entityTypeSchema.parse(value);
  return parsed as LifecycleEntityType;
}

router.get('/matrix', asyncHandler(async (_req, res) => {
  ok(res, RETENTION_MATRIX);
}));

router.get('/policies', asyncHandler(async (req, res) => {
  const ctx = context(req);
  ok(res, await listRetentionPolicies(ctx.tenantId));
}));

router.post('/policies', validateBody(policySchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const created = await createRetentionPolicyVersion({
    tenantId: ctx.tenantId,
    entityType: lifecycleEntity(req.body.entityType),
    retentionDays: req.body.retentionDays,
    source: req.body.source,
    documentation: req.body.documentation,
    actorId: ctx.userId || null
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: 'data.lifecycle.policy.version.created',
    entity: 'DataLifecyclePolicy',
    entityId: created.id,
    after: { title: created.title, status: created.status },
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent
  });
  res.status(201).json({ ok: true, data: created });
}));

router.post('/legal-holds', validateBody(holdSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const hold = await createLegalHold({
    tenantId: ctx.tenantId,
    entityType: lifecycleEntity(req.body.entityType),
    entityId: req.body.entityId || null,
    reason: req.body.reason,
    actorId: ctx.userId || null
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: 'data.lifecycle.legal_hold.created',
    entity: 'DataLegalHold',
    entityId: hold.id,
    after: { title: hold.title, status: hold.status },
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent
  });
  res.status(201).json({ ok: true, data: hold });
}));

router.post('/legal-holds/:id/release', validateBody(releaseHoldSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const hold = await releaseLegalHold({ tenantId: ctx.tenantId, holdId: req.params.id, actorId: ctx.userId || null, reason: req.body.reason });
  await writeAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: 'data.lifecycle.legal_hold.released',
    entity: 'DataLegalHold',
    entityId: hold.id,
    after: { title: hold.title, status: hold.status },
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent
  });
  ok(res, hold);
}));

router.post('/purge', validateBody(purgeSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const idempotencyKey = req.header('Idempotency-Key');
  if (!idempotencyKey) throw new HttpError(400, 'Idempotency-Key es obligatorio para purge.', { code: 'LIFECYCLE_IDEMPOTENCY_REQUIRED' });
  const entityType = lifecycleEntity(req.body.entityType);
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope: `data.lifecycle.purge.${entityType}`,
    key: idempotencyKey,
    request: { entityType, execute: req.body.execute },
    requestId: ctx.requestId || null
  }, async (tx) => {
    const result = await executeLifecyclePurge(tx, { tenantId: ctx.tenantId, entityType, execute: req.body.execute, actorId: ctx.userId || null });
    return { data: result, resourceType: 'DataLifecycleJob', resourceId: result.jobId };
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: req.body.execute ? 'data.lifecycle.purge.executed' : 'data.lifecycle.purge.previewed',
    entity: 'DataLifecycleJob',
    entityId: execution.resourceId || undefined,
    after: execution.data,
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent
  });
  res.status(execution.responseCode).json({ ok: true, data: execution.data, meta: { replayed: execution.replayed } });
}));

export default router;
