import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { assertBalanced, assertPeriodOpen, inverseLedgerLines, salesInvoiceLinesForLedger } from '../accounting/accounting.service.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { calculateInvoiceTotals } from '../../shared/financial/invoice.js';
import { decimalSchema } from '../../shared/financial/zod.js';
import { ONE, ZERO } from '../../shared/financial/decimal.js';

const router = Router();
router.use(requireTenant);

const lineSchema = z.object({
  productId: z.string().optional(),
  description: z.string().min(2),
  quantity: decimalSchema('quantity', { positive: true }),
  unitPrice: decimalSchema('money', { nonnegative: true }),
  taxRate: decimalSchema('percentage', { defaultValue: 16, nonnegative: true })
});
const saleSchema = z.object({
  clientId: z.string().optional(),
  number: z.string().min(1),
  controlNo: z.string().optional(),
  issueDate: z.coerce.date().optional(),
  fiscalPeriod: z.string().min(6),
  currency: z.string().default('VES'),
  exchangeRate: decimalSchema('exchangeRate', { defaultValue: 1, positive: true }),
  status: z.enum(['draft', 'issued', 'paid', 'overdue']).default('issued'),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1)
});
const cancellationSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
  reversalFiscalPeriod: z.string().regex(/^\d{4}-\d{2}$/, 'Usa formato AAAA-MM.').optional(),
  reversalDate: z.coerce.date().optional()
});
const context = (req: any) => req.context as { tenantId: string; userId?: string; ip?: string; userAgent?: string };

router.get('/', requirePermission('sales.view'), asyncHandler(async (req, res) => {
  const tenantId = context(req).tenantId;
  const data = await prisma.salesInvoice.findMany({ where: { tenantId }, include: { client: true, lines: true }, orderBy: { issueDate: 'desc' }, take: 100 });
  ok(res, data);
}));

router.post('/', requirePermission('sales.manage'), validateBody(saleSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const calculated = calculateInvoiceTotals(req.body.lines.map((line: any) => ({
    quantity: line.quantity,
    unitAmount: line.unitPrice,
    taxRate: line.taxRate
  })));
  const lines = req.body.lines.map((line: any, index: number) => ({ ...line, total: calculated.lines[index].total }));
  const subtotal = calculated.subtotal;
  const iva = calculated.tax;
  const total = calculated.total;
  if (req.body.status !== 'draft') await assertPeriodOpen(ctx.tenantId, req.body.fiscalPeriod);

  const result = await prisma.$transaction(async (tx) => {
    const sale = await tx.salesInvoice.create({
      data: {
        tenantId: ctx.tenantId,
        clientId: req.body.clientId,
        number: req.body.number,
        controlNo: req.body.controlNo,
        issueDate: req.body.issueDate,
        fiscalPeriod: req.body.fiscalPeriod,
        currency: req.body.currency,
        exchangeRate: req.body.exchangeRate,
        subtotal,
        iva,
        total,
        status: req.body.status,
        notes: req.body.notes,
        lines: { create: lines }
      },
      include: { lines: true }
    });
    let ledgerEntryId: string | null = null;
    if (sale.status !== 'draft') {
      const ledgerLines = salesInvoiceLinesForLedger(sale);
      assertBalanced(ledgerLines);
      const postedAt = new Date();
      const ledger = await tx.ledgerEntry.create({
        data: {
          tenantId: ctx.tenantId,
          fiscalPeriod: sale.fiscalPeriod,
          description: `Venta ${sale.number}`,
          source: 'sales',
          sourceId: sale.id,
          salesInvoiceId: sale.id,
          posted: true,
          postedAt,
          postedBy: ctx.userId || null,
          lines: {
            create: ledgerLines.map((line) => ({
              accountCode: line.accountCode,
              accountName: line.accountName,
              debit: line.debit ?? ZERO,
              credit: line.credit ?? ZERO,
              currency: sale.currency || 'VES',
              exchangeRate: sale.exchangeRate ?? ONE
            }))
          }
        }
      });
      ledgerEntryId = ledger.id;
    }
    return { sale, ledgerEntryId };
  });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'create', entity: 'salesInvoice', entityId: result.sale.id, after: { ...result.sale, ledgerEntryId: result.ledgerEntryId }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, { ...result.sale, ledgerEntryId: result.ledgerEntryId });
}));

router.patch('/:id/cancel', requirePermission('sales.manage'), validateBody(cancellationSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const sale = await prisma.salesInvoice.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId }, include: { lines: true } });
  if (!sale) throw new HttpError(404, 'Venta no encontrada.');
  if (sale.status === 'draft') throw new HttpError(409, 'Los borradores se eliminan; no se anulan.');
  const originals = await prisma.ledgerEntry.findMany({
    where: { tenantId: ctx.tenantId, OR: [{ salesInvoiceId: sale.id }, { source: 'sales', sourceId: sale.id }] },
    include: { lines: true, reversedBy: true },
    orderBy: { createdAt: 'asc' }
  });
  if (originals.length > 1) throw new HttpError(409, 'La venta posee múltiples asientos originales. Requiere conciliación antes de anular para evitar un reverso ambiguo.');
  const original = originals[0] || null;

  if (sale.status === 'cancelled') {
    return ok(res, { sale, reversalId: original?.reversedBy?.id || null, alreadyCancelled: true });
  }

  const reversalFiscalPeriod = req.body.reversalFiscalPeriod || sale.fiscalPeriod;
  await assertPeriodOpen(ctx.tenantId, reversalFiscalPeriod);
  if (original && !original.posted) throw new HttpError(409, 'El asiento original de la venta no está contabilizado. Resuelve el backfill/inconsistencia antes de anular.');

  const result = await prisma.$transaction(async (tx) => {
    let reversalId: string | null = original?.reversedBy?.id || null;
    if (original && !reversalId) {
      const reversalLines = inverseLedgerLines(original.lines);
      const postedAt = new Date();
      const reversal = await tx.ledgerEntry.create({
        data: {
          tenantId: ctx.tenantId,
          date: req.body.reversalDate || postedAt,
          fiscalPeriod: reversalFiscalPeriod,
          description: `Reverso por anulación de venta ${sale.number}`,
          source: 'manual',
          sourceId: `sales-cancel:${sale.id}`,
          salesInvoiceId: sale.id,
          posted: true,
          postedAt,
          postedBy: ctx.userId || null,
          reversalOfId: original.id,
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
      reversalId = reversal.id;
    }
    const cancelled = await tx.salesInvoice.update({ where: { id: sale.id }, data: { status: 'cancelled' }, include: { lines: true } });
    return { sale: cancelled, reversalId, reversedEntries: original ? [original.id] : [], accountingWarning: original ? null : 'La venta no tenía asiento contable asociado.' };
  });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'cancel', entity: 'salesInvoice', entityId: sale.id, before: sale, after: { ...result, reason: req.body.reason || 'Anulación solicitada desde Ventas', reversalFiscalPeriod }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  if (result.reversalId) {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'ledger.entry.reversed', entity: 'LedgerEntry', entityId: result.reversalId, before: original, after: { reversalId: result.reversalId, reversalOfId: original?.id, source: 'sales-cancel' }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  }
  ok(res, result);
}));

router.delete('/:id', requirePermission('sales.manage'), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const sale = await prisma.salesInvoice.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId }, include: { lines: true } });
  if (!sale) throw new HttpError(404, 'Venta no encontrada.');
  if (sale.status !== 'draft') throw new HttpError(409, 'Solo se eliminan ventas en borrador. Las ventas emitidas deben anularse.');
  await prisma.salesInvoice.delete({ where: { id: sale.id } });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'delete-draft', entity: 'salesInvoice', entityId: sale.id, before: sale, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, { deleted: true, id: sale.id });
}));

export default router;
