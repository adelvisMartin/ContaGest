import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { assertBalanced, assertPeriodOpen, inverseLedgerLines, purchaseInvoiceLinesForLedger } from '../accounting/accounting.service.js';
import { calculateInvoiceTotals } from '../../shared/financial/invoice.js';
import { decimalSchema } from '../../shared/financial/zod.js';
import { ONE, ZERO } from '../../shared/financial/decimal.js';

const router = Router();
router.use(requireTenant, requirePermission('purchases.manage'));

const lineSchema = z.object({
  productId: z.string().optional(),
  description: z.string().min(2),
  quantity: decimalSchema('quantity', { positive: true }),
  unitCost: decimalSchema('money', { nonnegative: true }),
  taxRate: decimalSchema('percentage', { defaultValue: 16, nonnegative: true })
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

const cancellationSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
  reversalFiscalPeriod: z.string().regex(/^\d{4}-\d{2}$/, 'Usa formato AAAA-MM.').optional(),
  reversalDate: z.coerce.date().optional()
});
const context = (req: any) => req.context as { tenantId: string; userId?: string; ip?: string; userAgent?: string };

router.get('/', asyncHandler(async (req, res) => {
  const { tenantId } = context(req);
  const rows = await prisma.purchaseInvoice.findMany({ where: { tenantId }, include: { supplier: true, lines: true }, orderBy: { issueDate: 'desc' }, take: Math.min(Number(req.query.take || 100), 500) });
  ok(res, rows);
}));

router.post('/', validateBody(purchaseSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const calculated = calculateInvoiceTotals(req.body.lines.map((line: any) => ({
    quantity: line.quantity,
    unitAmount: line.unitCost,
    taxRate: line.taxRate
  })));
  const lines = req.body.lines.map((line: any, index: number) => ({ ...line, total: calculated.lines[index].total }));
  const subtotal = calculated.subtotal;
  const iva = calculated.tax;
  const total = calculated.total;
  if (req.body.status !== 'draft') await assertPeriodOpen(ctx.tenantId, req.body.fiscalPeriod);

  const result = await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchaseInvoice.create({
      data: { tenantId: ctx.tenantId, supplierId: req.body.supplierId, number: req.body.number, controlNo: req.body.controlNo, fiscalPeriod: req.body.fiscalPeriod, subtotal, iva, total, status: req.body.status, ocrStatus: req.body.ocrStatus, lines: { create: lines } },
      include: { supplier: true, lines: true }
    });

    let ledgerEntryId: string | null = null;
    if (purchase.status !== 'draft') {
      const ledgerLines = purchaseInvoiceLinesForLedger(purchase);
      assertBalanced(ledgerLines);
      const draftLedger = await tx.ledgerEntry.create({
        data: {
          tenantId: ctx.tenantId,
          fiscalPeriod: purchase.fiscalPeriod,
          description: `Compra ${purchase.number}`,
          source: 'purchase',
          sourceId: purchase.id,
          purchaseInvoiceId: purchase.id,
          posted: false,
          postedAt: null,
          postedBy: null,
          lines: {
            create: ledgerLines.map((line) => ({
              accountCode: line.accountCode,
              accountName: line.accountName,
              debit: line.debit ?? ZERO,
              credit: line.credit ?? ZERO,
              currency: 'VES',
              exchangeRate: ONE
            }))
          }
        }
      });
      const postedAt = new Date();
      const ledgerEntry = await tx.ledgerEntry.update({
        where: { id: draftLedger.id },
        data: { posted: true, postedAt, postedBy: ctx.userId || null }
      });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId || null,
          action: 'ledger.entry.posted',
          entity: 'LedgerEntry',
          entityId: ledgerEntry.id,
          before: { posted: false, source: 'purchase', sourceId: purchase.id, fiscalPeriod: purchase.fiscalPeriod },
          after: { posted: true, postedAt: postedAt.toISOString(), postedBy: ctx.userId || null, source: 'purchase', sourceId: purchase.id, fiscalPeriod: purchase.fiscalPeriod },
          ipAddress: ctx.ip || null,
          userAgent: ctx.userAgent || null
        }
      });
      ledgerEntryId = ledgerEntry.id;
    }
    return { purchase, ledgerEntryId };
  });

  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'create', entity: 'PurchaseInvoice', entityId: result.purchase.id, after: { ...result.purchase, ledgerEntryId: result.ledgerEntryId }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, { ...result.purchase, ledgerEntryId: result.ledgerEntryId });
}));

router.patch('/:id/cancel', validateBody(cancellationSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const purchase = await prisma.purchaseInvoice.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId }, include: { supplier: true, lines: true } });
  if (!purchase) throw new HttpError(404, 'Compra no encontrada.');
  if (purchase.status === 'draft') throw new HttpError(409, 'Los borradores se eliminan; no se anulan.');

  const originals = await prisma.ledgerEntry.findMany({
    where: {
      tenantId: ctx.tenantId,
      reversalOfId: null,
      OR: [
        { source: 'purchase', sourceId: purchase.id },
        { source: 'purchase', purchaseInvoiceId: purchase.id }
      ]
    },
    include: { lines: true, reversedBy: true },
    orderBy: { createdAt: 'asc' }
  });
  if (originals.length > 1) throw new HttpError(409, 'La compra posee múltiples asientos originales. Requiere conciliación antes de anular para evitar un reverso ambiguo.');
  const original = originals[0] || null;

  if (purchase.status === 'cancelled') {
    return ok(res, { purchase, reversalId: original?.reversedBy?.id || null, alreadyCancelled: true });
  }

  const reversalFiscalPeriod = req.body.reversalFiscalPeriod || purchase.fiscalPeriod;
  await assertPeriodOpen(ctx.tenantId, reversalFiscalPeriod);
  if (original && !original.posted) throw new HttpError(409, 'El asiento original de la compra no está contabilizado. Resuelve el backfill/inconsistencia antes de anular.');

  const result = await prisma.$transaction(async (tx) => {
    let reversalId: string | null = original?.reversedBy?.id || null;
    if (original && !reversalId) {
      const reversalLines = inverseLedgerLines(original.lines);
      const draftReversal = await tx.ledgerEntry.create({
        data: {
          tenantId: ctx.tenantId,
          date: req.body.reversalDate || new Date(),
          fiscalPeriod: reversalFiscalPeriod,
          description: `Reverso por anulación de compra ${purchase.number}`,
          source: 'manual',
          sourceId: `purchase-cancel:${purchase.id}`,
          purchaseInvoiceId: purchase.id,
          posted: false,
          postedAt: null,
          postedBy: null,
          lines: {
            create: reversalLines.map((line) => ({
              accountCode: line.accountCode,
              accountName: line.accountName,
              debit: line.debit,
              credit: line.credit,
              currency: line.currency,
              exchangeRate: line.exchangeRate
            }))
          }
        }
      });
      const postedAt = new Date();
      const reversal = await tx.ledgerEntry.update({
        where: { id: draftReversal.id },
        data: { posted: true, postedAt, postedBy: ctx.userId || null, reversalOfId: original.id }
      });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId || null,
          action: 'ledger.entry.reversed',
          entity: 'LedgerEntry',
          entityId: reversal.id,
          before: { originalId: original.id, fiscalPeriod: original.fiscalPeriod, source: 'purchase' },
          after: { reversalId: reversal.id, reversalOfId: original.id, fiscalPeriod: reversalFiscalPeriod, postedAt: postedAt.toISOString(), source: 'purchase-cancel' },
          ipAddress: ctx.ip || null,
          userAgent: ctx.userAgent || null
        }
      });
      reversalId = reversal.id;
    }
    const cancelled = await tx.purchaseInvoice.update({ where: { id: purchase.id }, data: { status: 'cancelled' }, include: { supplier: true, lines: true } });
    return { purchase: cancelled, reversalId, reversedEntries: original ? [original.id] : [], accountingWarning: original ? null : 'La compra no tenía asiento contable asociado.' };
  });

  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'cancel', entity: 'PurchaseInvoice', entityId: purchase.id, before: purchase, after: { ...result, reason: req.body.reason || 'Anulación solicitada desde Compras', reversalFiscalPeriod }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, result);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const purchase = await prisma.purchaseInvoice.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId }, include: { lines: true } });
  if (!purchase) throw new HttpError(404, 'Compra no encontrada.');
  if (purchase.status !== 'draft') throw new HttpError(409, 'Solo se eliminan compras en borrador. Las compras emitidas deben anularse.');
  await prisma.purchaseInvoice.delete({ where: { id: purchase.id } });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'delete-draft', entity: 'PurchaseInvoice', entityId: purchase.id, before: purchase, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, { deleted: true, id: purchase.id });
}));

export default router;
