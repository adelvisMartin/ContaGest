import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import {
  buildTenantDeletionPrecheck,
  createLegalHold,
  createRetentionPolicyVersion,
  executePurgeBatch,
  listLegalHolds,
  listRetentionPolicies,
  listStorageObjects,
  releaseLegalHold,
  requestPurgeJob,
  requestTenantDeletion,
  requestTenantExport
} from './data-lifecycle.service.js';

const router = Router();
router.use(requireTenant);
router.use(requirePermission('admin.manage'));

type RequestContext = { tenantId: string; userId?: string; ip?: string; userAgent?: string | string[] };
const context = (req: Request) => (req as Request & { context: RequestContext }).context;

const policySchema = z.object({
  entityType: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{1,79}$/),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable().optional(),
  retentionDays: z.number().int().min(0).max(36500).nullable().optional(),
  archiveAfterDays: z.number().int().min(0).max(36500).nullable().optional(),
  deleteSemantics: z.enum(['mutable','soft_delete','immutable','archive','purge']),
  purgeable: z.boolean(),
  source: z.string().trim().min(3).max(240),
  documentation: z.string().trim().min(3).max(2000),
  policy: z.record(z.string(), z.unknown()).default({})
}).strict();

const legalHoldSchema = z.object({
  scopeType: z.enum(['tenant','entity','record']),
  entityType: z.string().trim().min(2).max(80).nullable().optional(),
  recordId: z.string().trim().min(1).max(240).nullable().optional(),
  reason: z.string().trim().min(3).max(1000),
  authorizationRef: z.string().trim().min(3).max(240)
}).strict().superRefine((value, ctx) => {
  if (value.scopeType === 'tenant' && (value.entityType || value.recordId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scopeType'], message: 'Tenant hold no acepta entityType/recordId.' });
  if (value.scopeType === 'entity' && (!value.entityType || value.recordId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entityType'], message: 'Entity hold requiere entityType y no acepta recordId.' });
  if (value.scopeType === 'record' && (!value.entityType || !value.recordId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recordId'], message: 'Record hold requiere entityType y recordId.' });
});

const releaseHoldSchema = z.object({ authorizationRef: z.string().trim().min(3).max(240), reason: z.string().trim().min(3).max(1000) }).strict();
const purgeJobSchema = z.object({
  entityType: z.enum(['AnalyticsEvent','ImportBatch','NotificationLog','AddressGeocode']),
  idempotencyKey: z.string().trim().min(8).max(180),
  authorizationRef: z.string().trim().min(3).max(240),
  batchSize: z.number().int().min(1).max(1000).default(250)
}).strict();
const runJobSchema = z.object({ batchSize: z.number().int().min(1).max(1000).default(250) }).strict();
const idempotentSchema = z.object({ idempotencyKey: z.string().trim().min(8).max(180) }).strict();
const tenantDeleteSchema = idempotentSchema.extend({ authorizationRef: z.string().trim().min(3).max(240) }).strict();

router.get('/policies', asyncHandler(async (req, res) => {
  const ctx = context(req);
  ok(res, await listRetentionPolicies(ctx.tenantId, req.query.entityType ? String(req.query.entityType) : undefined));
}));

router.post('/policies', validateBody(policySchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const created = await createRetentionPolicyVersion({ tenantId: ctx.tenantId, createdBy: ctx.userId || null, ...req.body });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'data.lifecycle.policy.created', entity: 'DataRetentionPolicyVersion', entityId: created.id, after: { entityType: created.entityType, version: created.version, contentHash: created.contentHash }, ipAddress: ctx.ip, userAgent: Array.isArray(ctx.userAgent) ? ctx.userAgent[0] : ctx.userAgent });
  ok(res, created, 201);
}));

router.get('/legal-holds', asyncHandler(async (req, res) => {
  const ctx = context(req);
  ok(res, await listLegalHolds(ctx.tenantId, req.query.all !== 'true'));
}));

router.post('/legal-holds', validateBody(legalHoldSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const hold = await createLegalHold({ tenantId: ctx.tenantId, createdBy: ctx.userId || null, ...req.body });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'data.lifecycle.legal_hold.created', entity: 'DataLegalHold', entityId: hold.id, after: { scopeType: hold.scopeType, entityType: hold.entityType, active: true }, ipAddress: ctx.ip, userAgent: Array.isArray(ctx.userAgent) ? ctx.userAgent[0] : ctx.userAgent });
  ok(res, hold, 201);
}));

router.post('/legal-holds/:id/release', validateBody(releaseHoldSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const hold = await releaseLegalHold({ tenantId: ctx.tenantId, holdId: req.params.id, releasedBy: ctx.userId || null, authorizationRef: req.body.authorizationRef, reason: req.body.reason });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'data.lifecycle.legal_hold.released', entity: 'DataLegalHold', entityId: hold.id, after: { active: false, releasedAt: hold.releasedAt }, ipAddress: ctx.ip, userAgent: Array.isArray(ctx.userAgent) ? ctx.userAgent[0] : ctx.userAgent });
  ok(res, hold);
}));

router.post('/purge-jobs', validateBody(purgeJobSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const job = await requestPurgeJob({ tenantId: ctx.tenantId, requestedBy: ctx.userId || null, ...req.body });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'data.lifecycle.purge.requested', entity: 'DataLifecycleJob', entityId: job.id, after: { entityType: job.entityType, status: job.status }, ipAddress: ctx.ip, userAgent: Array.isArray(ctx.userAgent) ? ctx.userAgent[0] : ctx.userAgent });
  ok(res, job, 202);
}));

router.post('/purge-jobs/:id/run', validateBody(runJobSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const job = await executePurgeBatch({ tenantId: ctx.tenantId, jobId: req.params.id, batchSize: req.body.batchSize });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'data.lifecycle.purge.batch', entity: 'DataLifecycleJob', entityId: job.id, after: { status: job.status, result: job.result }, ipAddress: ctx.ip, userAgent: Array.isArray(ctx.userAgent) ? ctx.userAgent[0] : ctx.userAgent });
  ok(res, job);
}));

router.post('/tenant-export', validateBody(idempotentSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const job = await requestTenantExport({ tenantId: ctx.tenantId, idempotencyKey: req.body.idempotencyKey, requestedBy: ctx.userId || null });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'data.lifecycle.tenant_export.manifest', entity: 'DataLifecycleJob', entityId: job.id, after: { status: job.status }, ipAddress: ctx.ip, userAgent: Array.isArray(ctx.userAgent) ? ctx.userAgent[0] : ctx.userAgent });
  ok(res, job);
}));

router.get('/tenant-delete/precheck', asyncHandler(async (req, res) => {
  const ctx = context(req);
  ok(res, await buildTenantDeletionPrecheck(ctx.tenantId));
}));

router.post('/tenant-delete', validateBody(tenantDeleteSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const job = await requestTenantDeletion({ tenantId: ctx.tenantId, idempotencyKey: req.body.idempotencyKey, authorizationRef: req.body.authorizationRef, requestedBy: ctx.userId || null });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'data.lifecycle.tenant_delete.requested', entity: 'DataLifecycleJob', entityId: job.id, after: { status: job.status, result: job.result }, ipAddress: ctx.ip, userAgent: Array.isArray(ctx.userAgent) ? ctx.userAgent[0] : ctx.userAgent });
  ok(res, job, 202);
}));

router.get('/storage-objects', asyncHandler(async (req, res) => {
  const ctx = context(req);
  ok(res, await listStorageObjects(ctx.tenantId, req.query.bucket ? String(req.query.bucket) : undefined));
}));

export default router;
