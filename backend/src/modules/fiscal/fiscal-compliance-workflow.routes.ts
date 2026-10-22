import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { runFinancialIdempotentMutation, normalizeIdempotencyKey } from '../../shared/services/financial-idempotency.service.js';
import { serializeDecimal } from '../../shared/financial/decimal.js';
import { resolveSemanticPostingAccounts } from '../chart-accounts/account-role.repository.js';
import { assertBalanced } from '../accounting/accounting.service.js';
import { assertComplianceTransition } from './fiscal-compliance-workflow-policy.js';

const router = Router();
const UUID = z.string().uuid();
const HASH = z.string().regex(/^[a-f0-9]{64}$/i);
const payloadSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('REVIEW'), legalSourceId: UUID,
    reason: z.string().trim().min(15).max(240) }).strict(),
  z.object({ action: z.literal('RECORD_EXTERNAL_FILING'), authority: z.string().trim().min(3).max(120),
    receiptReference: z.string().trim().min(4).max(120),
    receiptSha256: HASH, filedAt: z.string().max(28) }).strict(),
  z.object({ action: z.literal('LINK_BANK_PAYMENT'), bankMovementId: UUID }).strict(),
  z.object({ action: z.literal('CONFIRM_RECONCILIATION') }).strict(),
]);
type Evidence = Record<string, unknown>;

function context(req: Request) {
  const value = (req as Request & { context?: { tenantId?: unknown; userId?: unknown; ip?: string; userAgent?: string } }).context;
  if (typeof value?.tenantId !== 'string' || !value.tenantId.trim() ||
      typeof value.userId !== 'string' || !value.userId.trim())
    throw new HttpError(401, 'Se requiere sesión y actor autenticado.');
  return { tenantId: value.tenantId, userId: value.userId, ip: value.ip, userAgent: value.userAgent };
}
function reject(message: string, code: string): never {
  throw new HttpError(409, message, { code });
}
function existingEvidence(payload: Prisma.JsonValue): { payload: Record<string, Prisma.JsonValue>; workflow: Record<string, unknown> } {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') reject('Payload fiscal no estructurado.', 'COMPLIANCE_PAYLOAD_INVALID');
  const record = payload as Record<string, Prisma.JsonValue>;
  const workflow = record._complianceEvidenceV1;
  if (workflow !== undefined && (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)))
    reject('Evidencia de workflow no verificable.', 'COMPLIANCE_WORKFLOW_EVIDENCE_INVALID');
  return { payload: record, workflow: (workflow || {}) as Record<string, unknown> };
}

router.post('/declarations/:id/transition', requirePermission('fiscal.close'), validateBody(payloadSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const id = UUID.parse(req.params.id);
  const input = payloadSchema.parse(req.body);
  const key = normalizeIdempotencyKey(req.header('Idempotency-Key'));
  if (!key) throw new HttpError(428, 'Idempotency-Key obligatorio para transiciones de cumplimiento.', { code: 'COMPLIANCE_IDEMPOTENCY_REQUIRED' });

  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId, scope: 'fiscal.compliance.transition',
    key, request: { id, ...input },
  }, async (tx) => {
    // Lock declaration row, never a free-form tenant selector supplied by browser.
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT d."id" FROM public."TaxDeclaration" d
      JOIN public."TaxPeriod" p ON p."id"=d."periodId"
      WHERE d."id"=${id} AND p."tenantId"=${ctx.tenantId}
      FOR UPDATE OF d
    `);
    if (!locked.length) throw new HttpError(404, 'Declaración no encontrada en la empresa activa.');

    const row = await tx.taxDeclaration.findFirst({
      where: { id, period: { tenantId: ctx.tenantId } }, include: { period: true },
    });
    if (!row) throw new HttpError(404, 'Declaración no encontrada en la empresa activa.');
    if (row.period.status !== 'open') reject('Período tributario bloqueado.', 'COMPLIANCE_PERIOD_LOCKED');
    const closed = await tx.closingPeriod.count({ where: {
      tenantId: ctx.tenantId, period: row.period.period, status: 'closed',
      module: { in: ['fiscal', 'all', 'accounting', row.kind] },
    } });
    if (closed) reject('El período tiene cierre fiscal/contable.', 'COMPLIANCE_PERIOD_CLOSED');
    const original = existingEvidence(row.payload);
    const action = input.action;
    let evidence: Evidence;

    if (action === 'REVIEW') {
      if (Object.keys(original.workflow).length) reject('La declaración ya tiene evidencia previa.', 'COMPLIANCE_WORKFLOW_ALREADY_EXISTS');
      const sources = await tx.$queryRaw<Array<{
        id: string; tenantId: string; contentSha256: string;
        status: string; reviewedBy: string | null; createdBy: string;
      }>>(Prisma.sql`
        SELECT "id","tenantId","contentSha256","status","reviewedBy","createdBy"
        FROM public."FiscalLegalSource"
        WHERE "id"=${input.legalSourceId}::uuid
          AND "tenantId"=${ctx.tenantId} AND "status"='REVIEWED'
      `);
      const source = sources[0];
      if (!source || !source.reviewedBy || source.reviewedBy === source.createdBy)
        reject('Fuente legal sin revisión independiente.', 'COMPLIANCE_REVIEW_SOURCE_UNVERIFIED');
      evidence = { legalSourceId: source.id, legalSourceHash: source.contentSha256, reason: input.reason };
    } else if (action === 'RECORD_EXTERNAL_FILING') {
      if (!original.workflow.review) reject('Falta revisión interna.', 'COMPLIANCE_INTERNAL_REVIEW_REQUIRED');
      // Serialize duplicate receipt claims tenant-wide; never infer official receipt authenticity.
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${ctx.tenantId+':filing:'+input.receiptReference.toUpperCase()},783)) AS "locked"
      `);
      const duplicates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT d."id" FROM public."TaxDeclaration" d JOIN public."TaxPeriod" p ON p."id"=d."periodId"
        WHERE p."tenantId"=${ctx.tenantId} AND d."id"<>${id}
          AND lower(d."payload" #>> '{_complianceEvidenceV1,filing,evidence,receiptReference}') = lower(${input.receiptReference})
        LIMIT 1
      `);
      if (duplicates.length) reject('Referencia externa ya usada en otra declaración.', 'COMPLIANCE_DUPLICATE_FILING_REFERENCE');
      evidence = { authority: input.authority, receiptReference: input.receiptReference,
        receiptSha256: input.receiptSha256.toLowerCase(), filedAt: input.filedAt };
    } else {
      const prior = original.workflow.payment as Record<string, unknown> | undefined;
      const movementId = action === 'LINK_BANK_PAYMENT'
        ? input.bankMovementId : prior?.evidence && typeof prior.evidence === 'object'
          ? (prior.evidence as Record<string, unknown>).bankMovementId : null;
      if (typeof movementId !== 'string' || !UUID.safeParse(movementId).success)
        reject('Falta movimiento bancario de la declaración.', 'COMPLIANCE_BANK_MOVEMENT_REQUIRED');
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${ctx.tenantId+':payment:'+movementId},783)) AS "locked"
      `);
      const duplicates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT d."id" FROM public."TaxDeclaration" d JOIN public."TaxPeriod" p ON p."id"=d."periodId"
        WHERE p."tenantId"=${ctx.tenantId} AND d."id"<>${id}
          AND d."payload" #>> '{_complianceEvidenceV1,payment,evidence,bankMovementId}' = ${movementId}
        LIMIT 1
      `);
      if (duplicates.length) reject('Movimiento ya reservado por otra declaración.', 'COMPLIANCE_PAYMENT_ALREADY_ALLOCATED');
      const movement = await tx.bankMovement.findFirst({
        where: { id: movementId, tenantId: ctx.tenantId, matched: true },
        include: { account: true },
      });
      if (!movement || movement.account.tenantId !== ctx.tenantId ||
          movement.account.currency !== 'VES' || !movement.ledgerEntryId ||
          movement.debit.lte(0) || !movement.credit.isZero() ||
          !movement.debit.equals(row.amount) || row.amount.lte(0))
        reject('Monto, conciliación o cuenta del movimiento no equivalen a la declaración.', 'COMPLIANCE_BANK_EVIDENCE_MISMATCH');
      const ledger = await tx.ledgerEntry.findFirst({
        where: { id: movement.ledgerEntryId, tenantId: ctx.tenantId, posted: true },
        include: { lines: true, reversedBy: true },
      });
      if (!ledger || ledger.reversalOfId || ledger.reversedBy ||
          ledger.lines.some(line => line.currency !== 'VES'))
        reject('Asiento de pago ausente, reversado o con monedas no verificables.', 'COMPLIANCE_LEDGER_EVIDENCE_MISMATCH');
      assertBalanced(ledger.lines);
      const accounts = await resolveSemanticPostingAccounts(tx, ctx.tenantId, ['tax_payable', 'bank']);
      const total = (accountCode: string, side: 'debit' | 'credit') =>
        ledger.lines.filter(line => line.accountCode === accountCode)
          .reduce((sum, line) => sum.plus(line[side]), new Prisma.Decimal(0));
      if (!total(accounts.tax_payable.accountCode, 'debit').equals(row.amount) ||
          !total(accounts.bank.accountCode, 'credit').equals(row.amount))
        reject('El asiento no cancela el pasivo fiscal contra banco por el importe declarado.', 'COMPLIANCE_SEMANTIC_POSTING_MISMATCH');
      evidence = { bankMovementId: movement.id, ledgerEntryId: ledger.id,
        amountExact: serializeDecimal(row.amount, 2), currency: 'VES' };
      if (action === 'CONFIRM_RECONCILIATION' &&
          JSON.stringify(prior?.evidence) !== JSON.stringify(evidence))
        reject('La evidencia bancaria cambió desde el pago registrado.', 'COMPLIANCE_BANK_EVIDENCE_CHANGED');
    }

    let change: ReturnType<typeof assertComplianceTransition>;
    try { change = assertComplianceTransition(row.status, action, ctx.userId, evidence); }
    catch { reject('Transición de cumplimiento inválida o sin evidencia.', 'COMPLIANCE_TRANSITION_NOT_AUTHORIZED'); }
    const keyForAction: Record<typeof action, string> = {
      REVIEW: 'review', RECORD_EXTERNAL_FILING: 'filing',
      LINK_BANK_PAYMENT: 'payment', CONFIRM_RECONCILIATION: 'reconciliation',
    };
    const payload = { ...original.payload,
      _complianceEvidenceV1: { ...original.workflow, [keyForAction[action]]: change } };
    const updated = await tx.taxDeclaration.update({
      where: { id: row.id }, data: { status: change.to, payload: payload as Prisma.InputJsonValue },
    });
    await tx.auditLog.create({ data: {
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: 'fiscal.compliance.' + action.toLowerCase(), entity: 'TaxDeclaration', entityId: row.id,
      before: { status: row.status },
      after: JSON.parse(JSON.stringify({ status: updated.status, change })) as Prisma.InputJsonValue,
      ipAddress: ctx.ip || null, userAgent: ctx.userAgent || null,
    } });
    return { data: { id: updated.id, period: row.period.period, kind: updated.kind,
      status: updated.status, transition: change,
      externalFilingIntegration: false, authorityReceiptVerification: 'MANUAL_EVIDENCE_ONLY' },
      resourceType: 'TaxDeclaration', resourceId: updated.id };
  });
  ok(res, { ...execution.data, idempotencyReplayed: execution.replayed });
}));

export default router;
