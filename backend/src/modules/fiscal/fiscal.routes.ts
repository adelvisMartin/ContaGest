import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { runFinancialIdempotentMutation } from '../../shared/services/financial-idempotency.service.js';
import { assertBalanced } from '../accounting/accounting.service.js';
import { resolveSemanticPostingAccounts } from '../chart-accounts/account-role.repository.js';
import { planReviewedTaxEvent, type AppliedRatio } from './ve-tax-posting-plan.js';
import { assertFiscalDocumentRuleFamily } from './fiscal-event-rule-family.js';
import { assertUntrustedFiscalPayload, assertExternalFiscalRecordAllowed } from './fiscal-document-authority-policy.js';
import fiscalBookReadinessRoutes from './fiscal-book-readiness.routes.js';
import fiscalComplianceReadinessRoutes from './fiscal-compliance-readiness.routes.js';
import { captureTaxpayerProfileDraft, listTaxpayerProfileDrafts, transitionTaxpayerProfile, getEffectiveTaxpayerProfile } from './taxpayer-profile.repository.js';
import { prepareFiscalLegalSourceDraft } from './fiscal-legal-source-policy.js';
import { createFiscalLegalSourceDraft, listFiscalLegalSources, reviewFiscalLegalSource } from './fiscal-legal-source.repository.js';
import {
  allocateFiscalNumber,
  assertFiscalClosePreconditions,
  buildCloseEvidence,
  createFiscalRuleVersion,
  transitionFiscalRule,
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
router.use('/books', fiscalBookReadinessRoutes);
router.use('/compliance', fiscalComplianceReadinessRoutes);

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
// Uniform UTC contract: no locale parsing or implicit timezone on legal effectivity.
const utcInstantSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const at = new Date(value);
  return Number.isFinite(at.getTime()) &&
    at.toISOString().slice(0, 19) === value.slice(0, 19);
}, 'Requiere instante UTC ISO-8601 con Z, sin fechas normalizadas.').transform(value => new Date(value));

const fiscalRuleSchema = z.object({
  ruleKey: z.string().trim().regex(/^[a-z0-9][a-z0-9._:-]{1,79}$/i),
  effectiveFrom: utcInstantSchema,
  effectiveTo: utcInstantSchema.nullable().optional(),
  source: z.string().trim().min(3).max(240),
  documentation: z.string().trim().min(3).max(1000),
  definition: z.record(z.string(), z.unknown()),
  legalSourceId: z.string().uuid().nullable().optional(),
  supersedesId: z.string().uuid().nullable().optional()
}).strict().superRefine((value, ctx) => {
  if (value.effectiveTo && value.effectiveTo <= value.effectiveFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveTo'], message: 'effectiveTo debe ser posterior a effectiveFrom.' });
  }
});
const fiscalRuleDecisionSchema = z.object({
  reason: z.string().trim().min(15).max(500)
}).strict();

const verifiedTaxPreviewSchema = z.object({
  kind:z.enum(['sale','purchase']),
  effectiveAt:utcInstantSchema,
  taxableMinor:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  exemptMinor:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  notSubjectMinor:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  vatRuleKey:z.string().regex(/^iva[.:][a-z0-9._:-]{1,60}$/i),
  retainedVatRuleKey:z.string().regex(/^ret_iva[.:][a-z0-9._:-]{1,60}$/i).optional(),
  retainedIslrRuleKey:z.string().regex(/^islr[.:][a-z0-9._:-]{1,60}$/i).optional()
}).strict();

const taxpayerProfileDraftSchema = z.object({
  effectiveFrom:z.string(),
  effectiveTo:z.string().nullable().optional(),
  jurisdiction:z.string().trim().min(3).max(120),
  taxpayerCategory:z.string().trim().min(3).max(80),
  activityCodes:z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,59}$/)).min(1).max(20),
  sourceReference:z.string().trim().min(3).max(240),
  sourceContentSha256:z.string().regex(/^[a-f0-9]{64}$/i)
}).strict();
const fiscalLegalSourceSchema = z.object({
  sourceType: z.enum(['official_gazette', 'statute', 'regulation', 'administrative_ruling', 'other']),
  reference: z.string().trim().min(3).max(160),
  title: z.string().trim().min(3).max(240),
  sourceUrl: z.string().max(2048).nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/i),
  snapshotMetadata: z.object({
    captureMethod: z.enum(['manual', 'archive']),
    contentBytes: z.number().int().min(0).max(50_000_000).optional()
  }).strict().optional()
}).strict();
const fiscalLegalSourceReviewSchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().min(15).max(500)
}).strict();
const issueDocumentSchema = z.object({
  kind: documentKindSchema,
  period: periodSchema,
  module: moduleSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  ruleKeys: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
  effectiveAt: utcInstantSchema.optional(),
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
  const [read, manageDocuments, close, reopen, activateRules, activateProfiles] = await Promise.all([
    hasPermission(ctx.tenantId, ctx.userId, 'fiscal.read'),
    hasPermission(ctx.tenantId, ctx.userId, 'fiscal.manage_documents'),
    hasPermission(ctx.tenantId, ctx.userId, 'fiscal.close'),
    hasPermission(ctx.tenantId, ctx.userId, 'fiscal.reopen'),
    hasPermission(ctx.tenantId, ctx.userId, 'fiscal.activate_rules'),
    hasPermission(ctx.tenantId, ctx.userId, 'fiscal.activate_profiles')
  ]);
  return { read, manageDocuments, close, reopen, activateRules, activateProfiles };
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

// Legal evidence is operator-supplied DRAFT only. No rule activation or tax rates.
router.get('/legal-sources', requirePermission('fiscal.read'), asyncHandler(async (req, res) => {
  const ctx = context(req);
  ok(res, await listFiscalLegalSources(ctx.tenantId));
}));

router.post('/legal-sources', requirePermission('fiscal.close'), validateBody(fiscalLegalSourceSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  if (!ctx.userId) throw new HttpError(401, 'Se requiere un usuario autenticado.', { code: 'FISCAL_LEGAL_SOURCE_ACTOR_REQUIRED' });
  const draft = prepareFiscalLegalSourceDraft(req.body, { tenantId: ctx.tenantId, userId: ctx.userId });
  const created = await createFiscalLegalSourceDraft(draft);
  await writeAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: 'fiscal.legal_source.draft_created',
    entity: 'FiscalLegalSource', entityId: created.id,
    after: { id: created.id, sourceType: created.sourceType, reference: created.reference, contentSha256: created.contentSha256, status: created.status },
    ipAddress: ctx.ip, userAgent: ctx.userAgent
  });
  res.status(201).json({ ok: true, data: created });
}));

router.post('/legal-sources/:id/review', requirePermission('fiscal.close'), validateBody(fiscalLegalSourceReviewSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  if (!ctx.userId) throw new HttpError(401, 'Se requiere un revisor autenticado.', { code: 'FISCAL_LEGAL_SOURCE_REVIEW_ACTOR_REQUIRED' });
  const sourceId = z.string().uuid().parse(req.params.id);
  const reviewed = await reviewFiscalLegalSource({
    tenantId: ctx.tenantId, userId: ctx.userId, sourceId,
    approved: req.body.approved, reason: req.body.reason
  });
  ok(res, reviewed);
}));

router.get('/rules', requirePermission('fiscal.read'), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const ruleKey = req.query.ruleKey ? String(req.query.ruleKey).trim() : undefined;
  ok(res, await listFiscalRuleVersions(ctx.tenantId, ruleKey));
}));

router.post('/rules', requirePermission('fiscal.close'), validateBody(fiscalRuleSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  if (!ctx.userId) throw new HttpError(401, 'La captura de reglas fiscales requiere un operador autenticado.');
  const created = await createFiscalRuleVersion({
    tenantId: ctx.tenantId,
    ruleKey: req.body.ruleKey,
    effectiveFrom: req.body.effectiveFrom,
    effectiveTo: req.body.effectiveTo || null,
    source: req.body.source,
    documentation: req.body.documentation,
    definition: req.body.definition,
    createdBy: ctx.userId || null,
    legalSourceId: req.body.legalSourceId || null,
    supersedesId: req.body.supersedesId || null
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

router.post('/rules/:id/review', requirePermission('fiscal.close'),
  validateBody(fiscalRuleDecisionSchema), asyncHandler(async (req, res) => {
    const ctx = context(req);
    if (!ctx.userId) throw new HttpError(401, 'La revisión requiere sesión de un usuario real.');
    const ruleId = z.string().uuid().parse(req.params.id);
    ok(res, await transitionFiscalRule({
      tenantId: ctx.tenantId, ruleId, actorId: ctx.userId, action: 'REVIEW',
      reason: req.body.reason
    }));
  }));

router.post('/rules/:id/activate', requirePermission('fiscal.activate_rules'),
  validateBody(fiscalRuleDecisionSchema), asyncHandler(async (req, res) => {
    const ctx = context(req);
    if (!ctx.userId) throw new HttpError(401, 'La activación requiere sesión de un usuario real.');
    const ruleId = z.string().uuid().parse(req.params.id);
    ok(res, await transitionFiscalRule({
      tenantId: ctx.tenantId, ruleId, actorId: ctx.userId, action: 'ACTIVATE',
      reason: req.body.reason
    }));
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

// NON-POSTING tax estimate. Values supplied by the caller never create a ledger,
// a certificate or a statutory claim. Effective rules, profile and accounts are
// resolved from the same authenticated, read-only transaction.
router.post('/tax-events/preview', requirePermission('fiscal.read'),
  validateBody(verifiedTaxPreviewSchema), asyncHandler(async (req,res) => {
  const ctx=context(req);
  const body=req.body as z.infer<typeof verifiedTaxPreviewSchema>;
  const output=await prisma.$transaction(async tx=>{
    const profile=await getEffectiveTaxpayerProfile(tx,ctx.tenantId,body.effectiveAt);
    const keys=[body.vatRuleKey,body.retainedVatRuleKey,body.retainedIslrRuleKey].filter((x):x is string=>!!x);
    const found=await resolveFiscalRules(tx,{tenantId:ctx.tenantId,ruleKeys:keys,effectiveAt:body.effectiveAt});
    const map=new Map(found.map(rule=>[rule.ruleKey,rule]));
    const applied=(key:string):AppliedRatio=>{
      const row=map.get(key);
      if(!row||!row.legalSourceId||!row.legalSourceSha256)
        throw new HttpError(409,'Falta evidencia normativa efectiva.',{code:'FISCAL_TAX_RULE_UNVERIFIED'});
      return {ruleId:row.id,ruleKey:row.ruleKey,ruleHash:row.hash,
        legalSourceId:row.legalSourceId,legalSourceSha256:row.legalSourceSha256,
        definition:row.definition as AppliedRatio['definition']};
    };
    let plan:ReturnType<typeof planReviewedTaxEvent>;
    try{plan=planReviewedTaxEvent({
      kind:body.kind,taxableMinor:body.taxableMinor,
      exemptMinor:body.exemptMinor,notSubjectMinor:body.notSubjectMinor,
      vat:applied(body.vatRuleKey),
      retainedVat:body.retainedVatRuleKey?applied(body.retainedVatRuleKey):null,
      retainedIslr:body.retainedIslrRuleKey?applied(body.retainedIslrRuleKey):null
    });}catch{throw new HttpError(422,'La fórmula fiscal revisada no admite este evento.',{code:'VE_TAX_PREVIEW_REJECTED'});}
    const roles=[...new Set(plan.lines.map(line=>line.accountRole))];
    const accounts=await resolveSemanticPostingAccounts(tx,ctx.tenantId,roles);
    const moneyFromMinor=(value:number)=>{
      const n=BigInt(value);return (n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0');
    };
    const lines=plan.lines.map(line=>({
      accountCode:accounts[line.accountRole].accountCode,
      accountName:accounts[line.accountRole].name,
      role:line.accountRole,
      debit:moneyFromMinor(line.debitMinor),
      credit:moneyFromMinor(line.creditMinor)
    }));
    assertBalanced(lines);
    return { ...plan, profileEvidence: {
      profileId:profile.id,profileVersion:profile.version,
      rifSnapshot:profile.rifSnapshot,sourceContentSha256:profile.sourceContentSha256
    }, accountLines:lines, mode:'NON_POSTING_PREVIEW' };
  });
  ok(res,output);
}));

router.post('/documents/issue', requirePermission('fiscal.manage_documents'), validateBody(issueDocumentSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  assertUntrustedFiscalPayload(req.body.payload);
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
    try {
      assertFiscalDocumentRuleFamily({
        module:req.body.module,kind:req.body.kind,period:req.body.period,
        effectiveAt,explicitEffectiveAt:Boolean(req.body.effectiveAt),
        ruleKeys:req.body.ruleKeys as string[]
      });
    } catch {
      throw new HttpError(422,'La regla, fecha UTC o módulo fiscal no corresponde al evento.',{
        code:'FISCAL_EVENT_RULE_FAMILY_MISMATCH'
      });
    }
    const ruleKeys: string[] = [...new Set(req.body.ruleKeys as string[])].sort();
    const rules = await resolveFiscalRules(tx, { tenantId: ctx.tenantId, ruleKeys, effectiveAt });
    const requiresProfile = ['iva','islr','retiva'].includes(req.body.module) ||
      req.body.kind === 'withholding';
    const profile = requiresProfile
      ? await getEffectiveTaxpayerProfile(tx, ctx.tenantId, effectiveAt)
      : null;
    const profileSnapshot = profile ? {
      id:profile.id,tenantId:profile.tenantId,version:profile.version,rifSnapshot:profile.rifSnapshot,
      effectiveFrom:profile.effectiveFrom.toISOString(),
      effectiveTo:profile.effectiveTo?.toISOString()||null,
      jurisdiction:profile.jurisdiction,taxpayerCategory:profile.taxpayerCategory,
      activityCodes:profile.activityCodes,sourceReference:profile.sourceReference,
      sourceContentSha256:profile.sourceContentSha256,legalSourceId:profile.legalSourceId
    } : null;
    const profileHash = profileSnapshot ? fiscalEvidenceHash(profileSnapshot) : null;
    const number = await allocateFiscalNumber(tx, {
      tenantId: ctx.tenantId,
      kind: req.body.kind,
      prefix: req.body.prefix || defaultSequencePrefix(req.body.kind),
      width: req.body.width
    });
    const controlledPayload = { ...req.body.payload, _fiscalModule: req.body.module, _effectiveAt: effectiveAt.toISOString(), _ruleKeys: ruleKeys, ...(profileHash?{_taxpayerProfileHash:profileHash}:{}) };
    const hash = documentHash({ tenantId: ctx.tenantId, kind: req.body.kind, number, period: req.body.period, module: req.body.module, payload: controlledPayload });
    const record = await tx.fiscalDocument.create({ data: { tenantId: ctx.tenantId, kind: req.body.kind, number, period: req.body.period, status: 'issued', payload: controlledPayload, hash } });
    if (profileSnapshot && profileHash) {
      await tx.$executeRaw`
        UPDATE public."FiscalDocument" SET
          "taxpayerProfileSnapshot"=${JSON.stringify(profileSnapshot)}::jsonb,
          "taxpayerProfileHash"=${profileHash}
        WHERE "id"=${record.id} AND "tenantId"=${ctx.tenantId}
          AND "taxpayerProfileHash" IS NULL
      `;
    }
    await recordDocumentRuleSnapshots(tx, { tenantId: ctx.tenantId, fiscalDocumentId: record.id, rules });
    const snapshots = await tx.$queryRaw<Array<{ ruleKey: string; ruleVersion: number; ruleHash: string }>>`
      SELECT "ruleKey", "ruleVersion", "ruleHash" FROM public."FiscalDocumentRuleSnapshot"
      WHERE "tenantId"=${ctx.tenantId} AND "fiscalDocumentId"=${record.id} ORDER BY "ruleKey"
    `;
    return { data: { ...record, module: req.body.module, appliedRules: snapshots, taxpayerProfileHash: profileHash }, responseCode: 201, resourceType: 'FiscalDocument', resourceId: record.id };
  });

  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'fiscal.document.issued', entity: 'FiscalDocument', entityId: execution.resourceId || undefined, after: execution.data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  res.status(execution.responseCode).json({ ok: true, data: execution.data, meta: { replayed: execution.replayed } });
}));

router.post('/documents', requirePermission('fiscal.manage_documents'), validateBody(fiscalSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  try { assertExternalFiscalRecordAllowed(req.body); }
  catch { throw new HttpError(422,
    'Los documentos tributarios regulados deben emitirse con regla y perfil fiscal verificados.',
    { code: 'FISCAL_EXTERNAL_DOCUMENT_DENIED' }); }
  assertPayloadSize(req.body.payload);
  const period = await prisma.closingPeriod.findFirst({ where: { tenantId: ctx.tenantId, period: req.body.period, module: { in: req.body.module === 'fiscal' ? ['fiscal'] : [req.body.module, 'fiscal'] }, status: 'closed' } });
  if (period) throw new HttpError(409, `El período ${req.body.period} está cerrado para ${period.module}.`, { code: 'FISCAL_PERIOD_CLOSED', period: req.body.period, module: period.module });
  const existing = await prisma.fiscalDocument.findUnique({ where: { tenantId_kind_number: { tenantId: ctx.tenantId, kind: req.body.kind, number: req.body.number } } });
  if (existing) throw new HttpError(409, 'Documento fiscal duplicado.', { code: 'FISCAL_DOCUMENT_DUPLICATE' });
  const controlledPayload = { ...req.body.payload, _fiscalModule: req.body.module, _numberingAuthority: 'external/manual' };
  const hash = documentHash({ tenantId: ctx.tenantId, kind: req.body.kind, number: req.body.number, period: req.body.period, module: req.body.module, payload: controlledPayload });
  const record = await prisma.fiscalDocument.create({ data: { tenantId: ctx.tenantId, kind: req.body.kind, number: req.body.number, period: req.body.period, status: 'external', payload: controlledPayload, hash } });
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

router.get('/documents/:id/taxpayer-profile', requirePermission('fiscal.read'),
  asyncHandler(async (req,res) => {
    const ctx=context(req);
    const rows=await prisma.$queryRaw<Array<{
      taxpayerProfileSnapshot:unknown;taxpayerProfileHash:string|null;
    }>>`
      SELECT "taxpayerProfileSnapshot","taxpayerProfileHash"
      FROM public."FiscalDocument"
      WHERE "tenantId"=${ctx.tenantId} AND "id"=${req.params.id}
      LIMIT 1
    `;
    if(!rows[0])throw new HttpError(404,'Documento fiscal no encontrado.',{code:'FISCAL_DOCUMENT_NOT_FOUND'});
    const snapshot=rows[0].taxpayerProfileSnapshot;
    const hash=rows[0].taxpayerProfileHash;
    if(snapshot!==null && (typeof hash!=='string'||fiscalEvidenceHash(snapshot)!==hash))
      throw new HttpError(409,'Evidencia del perfil tributario alterada.',{code:'TAXPAYER_PROFILE_SNAPSHOT_INTEGRITY'});
    if(snapshot===null&&hash!==null)
      throw new HttpError(409,'Evidencia del perfil tributario incompleta.',{code:'TAXPAYER_PROFILE_SNAPSHOT_INTEGRITY'});
    ok(res,{taxpayerProfileSnapshot:snapshot,taxpayerProfileHash:hash});
  }));

router.get('/documents/:id/rules', requirePermission('fiscal.read'), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const document = await prisma.fiscalDocument.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!document) throw new HttpError(404, 'Documento fiscal no encontrado.', { code: 'FISCAL_DOCUMENT_NOT_FOUND' });
  ok(res, await getDocumentRuleSnapshots(ctx.tenantId, document.id));
}));

router.post('/taxpayer-profiles/:id/review', requirePermission('fiscal.close'),
  validateBody(fiscalRuleDecisionSchema), asyncHandler(async (req,res) => {
    const ctx=context(req);
    if(!ctx.userId)throw new HttpError(401,'Revisión sin identidad.');
    const id=z.string().uuid().parse(req.params.id);
    ok(res,await transitionTaxpayerProfile({tenantId:ctx.tenantId,profileId:id,actorId:ctx.userId,
      action:'REVIEW',reason:req.body.reason}));
  }));
router.post('/taxpayer-profiles/:id/activate', requirePermission('fiscal.activate_profiles'),
  validateBody(fiscalRuleDecisionSchema), asyncHandler(async (req,res) => {
    const ctx=context(req);
    if(!ctx.userId)throw new HttpError(401,'Activación sin identidad.');
    const id=z.string().uuid().parse(req.params.id);
    ok(res,await transitionTaxpayerProfile({tenantId:ctx.tenantId,profileId:id,actorId:ctx.userId,
      action:'ACTIVATE',reason:req.body.reason}));
  }));

router.get('/taxpayer-profiles', requirePermission('fiscal.read'), asyncHandler(async (req, res) => {
  ok(res, await listTaxpayerProfileDrafts(context(req).tenantId));
}));
router.post('/taxpayer-profiles', requirePermission('fiscal.close'), validateBody(taxpayerProfileDraftSchema), asyncHandler(async (req, res) => {
  const ctx=context(req);
  if (!ctx.userId) throw new HttpError(401, 'Se requiere identidad de operador para captura fiscal.');
  const created=await captureTaxpayerProfileDraft(req.body, {tenantId:ctx.tenantId,userId:ctx.userId,ip:ctx.ip,userAgent:ctx.userAgent});
  res.status(201).json({ok:true,data:created});
}));
export default router;
