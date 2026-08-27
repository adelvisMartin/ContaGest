import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { runFinancialIdempotentMutation } from '../../shared/services/financial-idempotency.service.js';
import { assertBalanced, assertPeriodOpen, purchaseInvoiceLinesForLedger } from '../accounting/accounting.service.js';

const router = Router();
router.use(requireTenant, requirePermission('purchases.manage'));

const lineSchema = z.object({
  productId: z.string().optional(),
  description: z.string().min(2),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().default(16)
});

const purchaseSchema = z.object({
  supplierId: z.string().optional(),
  number: z.string().min(1),
  controlNo: z.string().optional(),
  fiscalPeriod: z.string().min(6),
  status: z.enum(['draft', 'issued', 'paid', 'overdue']).default('issued'),
  ocrStatus: z.string().optional(),
  lines: z.array(lineSchema).min(1)
});

const cancellationSchema = z.object({ reason: z.string().trim().min(3).max(500).optional() });
const context = (req: any) => req.context as { tenantId: string; userId?: string; ip?: string; userAgent?: string };
const requestId = (req: any) => String(req.requestId || '') || null;
const idempotencyKey = (req: any) => req.header('Idempotency-Key') || null;

router.get('/', asyncHandler(async (req, res) => {
  const { tenantId } = context(req);
  const rows = await prisma.purchaseInvoice.findMany({ where: { tenantId }, include: { supplier: true, lines: true }, orderBy: { issueDate: 'desc' }, take: Math.min(Number(req.query.take || 100), 500) });
  ok(res, rows);
}));

router.post('/', validateBody(purchaseSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const lines = req.body.lines.map((line: any) => ({ ...line, total: Number(line.quantity) * Number(line.unitCost) }));
  const subtotal = lines.reduce((sum: number, line: any) => sum + line.total, 0);
  const iva = lines.reduce((sum: number, line: any) => sum + (line.total * Number(line.taxRate || 0) / 100), 0);
  const total = subtotal + iva;

  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope: 'purchases.create',
    key: idempotencyKey(req),
    request: req.body,
    requestId: requestId(req),
    replay: async (tx, record) => {
      if (!record.resourceId) throw new HttpError(409, 'El resultado original de la compra no tiene recurso asociado.', { code:'IDEMPOTENCY_RESULT_UNAVAILABLE', scope:'purchases.create' });
      const purchase = await tx.purchaseInvoice.findFirst({ where:{ id:record.resourceId, tenantId:ctx.tenantId }, include:{ supplier:true, lines:true } });
      if (!purchase) throw new HttpError(409, 'La compra original ya no puede reconstruirse.', { code:'IDEMPOTENCY_RESULT_UNAVAILABLE', scope:'purchases.create' });
      const ledger = await tx.ledgerEntry.findFirst({ where:{ tenantId:ctx.tenantId, source:'purchase', sourceId:purchase.id }, select:{ id:true } });
      return { ...purchase, ledgerEntryId:ledger?.id || null };
    }
  }, async (tx) => {
    if (req.body.status !== 'draft') await assertPeriodOpen(ctx.tenantId, req.body.fiscalPeriod, tx);
    const purchase = await tx.purchaseInvoice.create({
      data: { tenantId: ctx.tenantId, supplierId: req.body.supplierId, number: req.body.number, controlNo: req.body.controlNo, fiscalPeriod: req.body.fiscalPeriod, subtotal, iva, total, status: req.body.status, ocrStatus: req.body.ocrStatus, lines: { create: lines } },
      include: { supplier: true, lines: true }
    });

    let ledgerEntryId: string | null = null;
    if (purchase.status !== 'draft') {
      const ledgerLines = purchaseInvoiceLinesForLedger(purchase);
      assertBalanced(ledgerLines);
      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          tenantId: ctx.tenantId,
          fiscalPeriod: purchase.fiscalPeriod,
          description: `Compra ${purchase.number}`,
          source: 'purchase',
          sourceId: purchase.id,
          purchaseInvoiceId: purchase.id,
          lines: { create: ledgerLines.map((line) => ({ accountCode: line.accountCode, accountName: line.accountName, debit: Number(line.debit || 0), credit: Number(line.credit || 0), currency: 'VES', exchangeRate: 1 })) }
        }
      });
      ledgerEntryId = ledgerEntry.id;
    }
    return { data: { ...purchase, ledgerEntryId }, resourceType: 'PurchaseInvoice', resourceId: purchase.id };
  });

  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  if (execution.replayed) {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'idempotency.replay', entity: 'PurchaseInvoice', entityId: (execution.data as any).id, after: { scope: 'purchases.create', recordId: execution.recordId, originalRequestId: execution.originalRequestId, requestId: requestId(req) }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  } else {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'create', entity: 'PurchaseInvoice', entityId: (execution.data as any).id, after: execution.data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  }
  ok(res, execution.data, execution.responseCode);
}));

router.patch('/:id/cancel', validateBody(cancellationSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const purchaseId = req.params.id;
  const scope = 'purchases.cancel';
  let beforePurchase: any = null;

  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope,
    key: idempotencyKey(req),
    request: { purchaseId, ...req.body },
    requestId: requestId(req),
    replay: async (tx, record) => {
      const resourceId = record.resourceId || purchaseId;
      const purchase = await tx.purchaseInvoice.findFirst({ where: { id: resourceId, tenantId: ctx.tenantId }, include: { supplier: true, lines: true } });
      if (!purchase) throw new HttpError(409, 'La anulación original ya no puede reconstruirse.', { code:'IDEMPOTENCY_RESULT_UNAVAILABLE', scope });
      const reversal = await tx.ledgerEntry.findFirst({ where: { tenantId: ctx.tenantId, source: 'manual', sourceId: `purchase-cancel:${purchase.id}` } });
      return { purchase, reversalId: reversal?.id || null, alreadyCancelled: true };
    }
  }, async (tx) => {
    const lockKey = `${scope}:${ctx.tenantId}:${purchaseId}`;
    await tx.$queryRaw<Array<{locked:string|null}>>`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS locked`;

    const purchase = await tx.purchaseInvoice.findFirst({ where: { id: purchaseId, tenantId: ctx.tenantId }, include: { supplier: true, lines: true } });
    if (!purchase) throw new HttpError(404, 'Compra no encontrada.');
    beforePurchase = purchase;
    if (purchase.status === 'draft') throw new HttpError(409, 'Los borradores se eliminan; no se anulan.');

    const reversalSourceId = `purchase-cancel:${purchase.id}`;
    if (purchase.status === 'cancelled') {
      const reversal = await tx.ledgerEntry.findFirst({ where: { tenantId: ctx.tenantId, source: 'manual', sourceId: reversalSourceId } });
      return { data: { purchase, reversalId: reversal?.id || null, alreadyCancelled: true }, resourceType: 'PurchaseInvoice', resourceId: purchase.id };
    }

    await assertPeriodOpen(ctx.tenantId, purchase.fiscalPeriod, tx);
    const originalEntries = await tx.ledgerEntry.findMany({ where: { tenantId: ctx.tenantId, OR: [{ purchaseInvoiceId: purchase.id }, { source: 'purchase', sourceId: purchase.id }] }, include: { lines: true } });
    let reversal = await tx.ledgerEntry.findFirst({ where: { tenantId: ctx.tenantId, source: 'manual', sourceId: reversalSourceId } });
    const originalLines = originalEntries.flatMap((entry) => entry.lines);
    if (!reversal && originalLines.length) {
      reversal = await tx.ledgerEntry.create({ data: { tenantId: ctx.tenantId, fiscalPeriod: purchase.fiscalPeriod, description: `Reverso por anulación de compra ${purchase.number}`, source: 'manual', sourceId: reversalSourceId, purchaseInvoiceId: purchase.id, posted: originalEntries.some((entry) => entry.posted), lines: { create: originalLines.map((line) => ({ accountCode: line.accountCode, accountName: line.accountName, debit: Number(line.credit || 0), credit: Number(line.debit || 0), currency: line.currency, exchangeRate: Number(line.exchangeRate || 1) })) } } });
    }
    const cancelled = await tx.purchaseInvoice.update({ where: { id: purchase.id }, data: { status: 'cancelled' }, include: { supplier: true, lines: true } });
    return { data: { purchase: cancelled, reversalId: reversal?.id || null, reversedEntries: originalEntries.map((entry) => entry.id), accountingWarning: originalLines.length ? null : 'La compra no tenía asiento contable asociado.', alreadyCancelled: false }, resourceType: 'PurchaseInvoice', resourceId: purchase.id };
  });

  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  if (execution.replayed) {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'idempotency.replay', entity: 'PurchaseInvoice', entityId: purchaseId, after: { scope, recordId: execution.recordId, originalRequestId: execution.originalRequestId, requestId: requestId(req) }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  } else {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'cancel', entity: 'PurchaseInvoice', entityId: purchaseId, before: beforePurchase, after: { ...execution.data, reason: req.body.reason || 'Anulación solicitada desde Compras' }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  }
  ok(res, execution.data, execution.responseCode);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const purchase = await prisma.purchaseInvoice.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId }, include: { lines: true } });
  if (!purchase) throw new HttpError(404, 'Compra no encontrada.');
  if (purchase.status !== 'draft') throw new HttpError(409, 'Solo se eliminan compras en borrador. Las compras emitidas deben anularse.');
  await prisma.purchaseInvoice.delete({ where: { id: purchase.id } });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'delete-draft', entity: 'PurchaseInvoice', entityId: purchase.id, before: purchase, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, { deleted:true, id:purchase.id });
}));

export default router;
