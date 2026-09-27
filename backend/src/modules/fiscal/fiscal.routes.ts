import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { runFinancialIdempotentMutation } from '../../shared/services/financial-idempotency.service.js';
import {
  allocateFiscalNumber,
  assertFiscalClosePreconditions,
  buildCloseEvidence,
  createFiscalRuleVersion,
  fiscalEvidenceHash,
  getCloseEvidence,
  getDocumentRuleSnapshots,
  listFiscalRuleVersions,
  persistCloseEvidence,
  recordDocumentRuleSnapshots,
  resolveFiscalRules
} from './fiscal.repository.js';

const router = Router();
router.use(requireTenant);

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Usa formato AAAA-MM.');
const moduleSchema = z.enum(['fiscal', 'iva', 'islr', 'igtf', 'retiva', 'municipal']);
const documentKindSchema = z.enum(['invoice', 'credit_note', 'debit_note', 'withholding', 'tax_return', 'supporting_document', 'other']);
const createPeriodSchema = z.object({ period: periodSchema, module: moduleSchema, note: z.string().trim().max(500).optional() }).strict();
const closeSchema = z.object({ period: periodSchema, module: moduleSchema, note: z.string().trim().max(500).optional() }).strict();
const reopenSchema = z.object({ period: periodSchema, module: moduleSchema, reason: z.string().trim().min(5).max(500) }).strict();
const fiscalSchema = z.object({
  kind: documentKindSchema,
  number: z.string().trim().min(1).max(120),
  period: periodSchema,
  module: moduleSchema,
  payload: z.record(z.string(), z.unknown()).default({})
}).strict();
const fiscalRuleSchema = z.object({
  ruleKey: z.string().trim().regex(/^[a-z0-9][a-z0-9._:-]{1,79}$/i),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable().optional(),
  source: z.string().trim().min(3).max(240),
  documentation: z.string().trim().min(3).max(1000),
  definition: z.record(z.string(), z.unknown())
}).strict().superRefine((value, ctx) => {
  if (value.effectiveTo && value.effectiveTo <= value.effectiveFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveTo'], message: 'effectiveTo debe ser posterior a effectiveFrom.' });
  }
});
const issueDocumentSchema = z.object({
  kind: documentKindSchema,
  period: periodSchema,
  module: moduleSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  ruleKeys: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
  effectiveAt: z.coerce.date().optional(),
  prefix: z.string().trim().max(20).optional(),
  width: z.number().int().min(1).max(18).default(8)
}).strict();

type RequestContext = { tenantId: string; userId?: string; ip?: string; userAgent?: string; requestId?: string };
const context = (req: Request) => (req as Request & { context: RequestContext }).context;

async function hasPermission(tenantId: string, userId: string | undefined, key: string) {
  if (!userId) return false;
  return (await prisma.userRole.count({ where: { userId, role: { tenantId, permissions: { some: { permission: { key } } } } } })) > 0;
}

async function capabilities(ctx: RequestContext) {
  const [read, manageDocuments, close, reopen] = await Promise.all([
    hasPermission(ctx.tenantId, ctx.userId, 'fiscal.read'),
    hasPermission(ctx.tenantId, ctx.userId, 'fiscal.manage_documents'),
    hasPermission(ctx.tenantId, ctx.userId, 'fiscal.close'),
    hasPermission(ctx.tenantId, ctx.userId, 'fiscal.reopen')
  ]);
  return { read, manageDocuments, close, reopen };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, stable(record[key])]));
  }
  return value;
}

function documentHash(input: { tenantId: string; kind: string; number: string; period: string; module: string; payload: Record<string, unknown> }) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(input))).digest('hex');
}

function defaultSequencePrefix(kind: string) {
  return `${kind.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')}-`;
}

function assertPayloadSize(payload: Record<string, unknown>) {
  const payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (payloadSize > 256_000) throw new HttpError(413, 'El payload del documento fiscal supera 256 KB.', { code: 'FISCAL_DOCUMENT_PAYLOAD_TOO_LARGE' });
}

router.get('/periods', requirePermission('fiscal.read'), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const periods = await prisma.closingPeriod.findMany({
    where: { tenantId: ctx.tenantId, module: { in: moduleSchema.options } },
    orderBy: [{ period: 'desc' }, { module: 'asc' }],
    take: 240
  });
  ok(res, { periods, modules: moduleSchema.options, capabilities: await capabilities(ctx) });
}));

router.post('/periods', requirePermission('fiscal.close'), validateBody(createPeriodSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const existing = await prisma.closingPeriod.findFirst({ where: { tenantId: ctx.tenantId, period: req.body.period, module: req.body.module } });
  if (existing) throw new HttpError(409, 'El período fiscal ya está registrado.', { code: 'FISCAL_PERIOD_EXISTS', status: existing.status });
  const created = await prisma.closingPeriod.create({ data: { tenantId: ctx.tenantId, period: req.body.period, module: req.body.module, status: 'open', note: req.body.note || null } });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'fiscal.period.created', entity: 'ClosingPeriod', entityId: created.id, after: created, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, created);
}));

router.get('/rules', requirePermission('fiscal.read'), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const ruleKey = req.query.ruleKey ? String(req.query.ruleKey).trim() : undefined;
  ok(res, await listFiscalRuleVersions(ctx.tenantId, ruleKey));
}));

router.post('/rules', requirePermission('fiscal.close'), validateBody(fiscalRuleSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const created = await createFiscalRuleVersion({
    tenantId: ctx.tenantId,
    ruleKey: req.body.ruleKey,
    effectiveFrom: req.body.effectiveFrom,
    effectiveTo: req.body.effectiveTo || null,
    source: req.body.source,
    documentation: req.body.documentation,
    definition: req.body.definition,
    createdBy: ctx.userId || null
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: 'fiscal.rule.version.created',
    entity: 'FiscalRuleVersion',
    entityId: created.id,
    after: { ruleKey: created.ruleKey, version: created.version, effectiveFrom: created.effectiveFrom, effectiveTo: created.effectiveTo, source: created.source, documentation: created.documentation, hash: created.hash },
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent
  });
  res.status(201).json({ ok: true, data: created });
}));

router.post('/close-period', requirePermission('fiscal.close'), validateBody(closeSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope: `fiscal.close.${req.body.module}`,
    key: req.header('Idempotency-Key'),
    request: req.body,
    requestId: ctx.requestId || null
  }, async (tx) => {
    const existing = await tx.closingPeriod.findFirst({ where: { tenantId: ctx.tenantId, period: req.body.period, module: req.body.module } });
    if (!existing) throw new HttpError(404, 'Período fiscal no encontrado; créalo abierto antes de cerrar.', { code: 'FISCAL_PERIOD_NOT_FOUND' });
    if (existing.status !== 'open') throw new HttpError(409, 'Transición fiscal inválida: sólo un período abierto puede cerrarse.', { code: 'FISCAL_INVALID_TRANSITION', from: existing.status, to: 'closed' });

    const prechecks = await buildCloseEvidence(tx, { tenantId: ctx.tenantId, period: req.body.period, module: req.body.module });
    assertFiscalClosePreconditions(prechecks);
    const updated = await tx.closingPeriod.update({
      where: { id: existing.id },
      data: { status: 'closed', closedAt: new Date(), closedBy: ctx.userId || 'session-user', note: req.body.note || existing.note || null }
    });
    const postCloseReport = {
      ...prechecks,
      status: updated.status,
      closingPeriodId: updated.id,
      closedAt: updated.closedAt?.toISOString() || null,
      closedBy: updated.closedBy
    };
    const postCloseHash = fiscalEvidenceHash({ tenantId: ctx.tenantId, ...postCloseReport });
    const evidence = await persistCloseEvidence(tx, {
      tenantId: ctx.tenantId,
      closingPeriodId: updated.id,
      period: req.body.period,
      module: req.body.module,
      prechecks,
      postCloseReport,
      postCloseHash,
      closedBy: ctx.userId || null
    });
    return { data: { ...updated, prechecks, postCloseReport, postCloseHash, evidenceId: evidence.id }, resourceType: 'ClosingPeriod', resourceId: updated.id };
  });

  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'fiscal.period.closed', entity: 'ClosingPeriod', entityId: execution.resourceId || undefined, after: execution.data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  res.status(execution.responseCode).json({ ok: true, data: execution.data, meta: { replayed: execution.replayed } });
}));

router.get('/close-period/evidence', requirePermission('fiscal.read'), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const period = periodSchema.parse(String(req.query.period || ''));
  const moduleName = moduleSchema.parse(String(req.query.module || ''));
  const evidence = await getCloseEvidence(ctx.tenantId, period, moduleName);
  if (!evidence) throw new HttpError(404, 'Evidencia de cierre no encontrada.', { code: 'FISCAL_CLOSE_EVIDENCE_NOT_FOUND' });
  ok(res, evidence);
}));

router.post('/reopen-period', requirePermission('fiscal.reopen'), validateBody(reopenSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const existing = await prisma.closingPeriod.findFirst({ where: { tenantId: ctx.tenantId, period: req.body.period, module: req.body.module } });
  if (!existing) throw new HttpError(404, 'Período fiscal no encontrado.', { code: 'FISCAL_PERIOD_NOT_FOUND' });
  if (existing.status !== 'closed') throw new HttpError(409, 'Transición fiscal inválida: sólo un período cerrado puede reabrirse.', { code: 'FISCAL_INVALID_TRANSITION', from: existing.status, to: 'open' });
  const updated = await prisma.closingPeriod.update({ where: { id: existing.id }, data: { status: 'open', closedAt: null, closedBy: null, note: req.body.reason } });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'fiscal.period.reopened', entity: 'ClosingPeriod', entityId: updated.id, before: existing, after: { ...updated, reopenReason: req.body.reason, workflowCapability: 'fiscal.reopen' }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, { ...updated, reopenReason: req.body.reason, workflowCapability: 'fiscal.reopen' });
}));

router.post('/documents/issue', requirePermission('fiscal.manage_documents'), validateBody(issueDocumentSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  assertPayloadSize(req.body.payload);
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope: `fiscal.document.issue.${req.body.kind}`,
    key: req.header('Idempotency-Key'),
    request: req.body,
    requestId: ctx.requestId || null
  }, async (tx) => {
    const closedPeriod = await tx.closingPeriod.findFirst({
      where: { tenantId: ctx.tenantId, period: req.body.period, module: { in: req.body.module === 'fiscal' ? ['fiscal'] : [req.body.module, 'fiscal'] }, status: 'closed' }
    });
    if (closedPeriod) throw new HttpError(409, `El período ${req.body.period} está cerrado para ${closedPeriod.module}.`, { code: 'FISCAL_PERIOD_CLOSED', period: req.body.period, module: closedPeriod.module });

    const effectiveAt = req.body.effectiveAt || new Date();
    const ruleKeys = [...new Set(req.body.ruleKeys)].sort();
    const rules = await resolveFiscalRules(tx, { tenantId: ctx.tenantId, ruleKeys, effectiveAt });
    const number = await allocateFiscalNumber(tx, {
      tenantId: ctx.tenantId,
      kind: req.body.kind,
      prefix: req.body.prefix || defaultSequencePrefix(req.body.kind),
      width: req.body.width
    });
    const controlledPayload = { ...req.body.payload, _fiscalModule: req.body.module, _effectiveAt: effectiveAt.toISOString(), _ruleKeys: ruleKeys };
    const hash = documentHash({ tenantId: ctx.tenantId, kind: req.body.kind, number, period: req.body.period, module: req.body.module, payload: controlledPayload });
    const record = await tx.fiscalDocument.create({ data: { tenantId: ctx.tenantId, kind: req.body.kind, number, period: req.body.period, status: 'issued', payload: controlledPayload, hash } });
    await recordDocumentRuleSnapshots(tx, { tenantId: ctx.tenantId, fiscalDocumentId: record.id, rules });
    const snapshots = await tx.$queryRaw<Array<{ ruleKey: string; ruleVersion: number; ruleHash: string }>>`
      SELECT "ruleKey", "ruleVersion", "ruleHash" FROM public."FiscalDocumentRuleSnapshot"
      WHERE "tenantId"=${ctx.tenantId}::uuid AND "fiscalDocumentId"=${record.id}::uuid ORDER BY "ruleKey"
    `;
    return { data: { ...record, module: req.body.module, appliedRules: snapshots }, responseCode: 201, resourceType: 'FiscalDocument', resourceId: record.id };
  });

  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'fiscal.document.issued', entity: 'FiscalDocument', entityId: execution.resourceId || undefined, after: execution.data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  res.status(execution.responseCode).json({ ok: true, data: execution.data, meta: { replayed: execution.replayed } });
}));

router.post('/documents', requirePermission('fiscal.manage_documents'), validateBody(fiscalSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  assertPayloadSize(req.body.payload);
  const period = await prisma.closingPeriod.findFirst({ where: { tenantId: ctx.tenantId, period: req.body.period, module: { in: req.body.module === 'fiscal' ? ['fiscal'] : [req.body.module, 'fiscal'] }, status: 'closed' } });
  if (period) throw new HttpError(409, `El período ${req.body.period} está cerrado para ${period.module}.`, { code: 'FISCAL_PERIOD_CLOSED', period: req.body.period, module: period.module });
  const existing = await prisma.fiscalDocument.findUnique({ where: { tenantId_kind_number: { tenantId: ctx.tenantId, kind: req.body.kind, number: req.body.number } } });
  if (existing) throw new HttpError(409, 'Documento fiscal duplicado.', { code: 'FISCAL_DOCUMENT_DUPLICATE' });
  const controlledPayload = { ...req.body.payload, _fiscalModule: req.body.module, _numberingAuthority: 'external/manual' };
  const hash = documentHash({ tenantId: ctx.tenantId, kind: req.body.kind, number: req.body.number, period: req.body.period, module: req.body.module, payload: controlledPayload });
  const record = await prisma.fiscalDocument.create({ data: { tenantId: ctx.tenantId, kind: req.body.kind, number: req.body.number, period: req.body.period, status: 'issued', payload: controlledPayload, hash } });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'fiscal.document.created.external', entity: 'FiscalDocument', entityId: record.id, after: { id: record.id, kind: record.kind, number: record.number, period: record.period, module: req.body.module, status: record.status, hash: record.hash }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  res.status(201).json({ ok: true, data: { ...record, module: req.body.module } });
}));

router.get('/documents', requirePermission('fiscal.read'), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const period = req.query.period ? String(req.query.period) : undefined;
  if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new HttpError(422, 'Período inválido.', { code: 'FISCAL_PERIOD_INVALID' });
  const rows = await prisma.fiscalDocument.findMany({ where: { tenantId: ctx.tenantId, ...(period ? { period } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
  ok(res, rows.map((row) => {
    const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload as Record<string, unknown> : {};
    return { ...row, module: payload._fiscalModule || 'fiscal' };
  }));
}));

router.get('/documents/:id/rules', requirePermission('fiscal.read'), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const document = await prisma.fiscalDocument.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!document) throw new HttpError(404, 'Documento fiscal no encontrado.', { code: 'FISCAL_DOCUMENT_NOT_FOUND' });
  ok(res, await getDocumentRuleSnapshots(ctx.tenantId, document.id));
}));

export default router;
