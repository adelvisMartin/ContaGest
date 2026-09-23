import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { assertBalanced, assertPeriodOpen, inverseLedgerLines, salesInvoiceLinesForLedger } from '../accounting/accounting.service.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { runFinancialIdempotentMutation } from '../../shared/services/financial-idempotency.service.js';
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
const requestId = (req: any) => String(req.requestId || '') || null;
const idempotencyKey = (req: any) => req.header('Idempotency-Key') || null;
const requireActor = (ctx: ReturnType<typeof context>) => {
  const actorId = String(ctx.userId || '').trim();
  if (!actorId) throw new HttpError(401, 'La operación financiera requiere un actor autenticado.');
  return actorId;
};

router.get('/', requirePermission('sales.view'), asyncHandler(async (req, res) => {
  const tenantId = context(req).tenantId;
  const data = await prisma.salesInvoice.findMany({ where: { tenantId }, include: { client: true, lines: true }, orderBy: { issueDate: 'desc' }, take: 100 });
  ok(res, data);
}));

router.post('/', requirePermission('sales.manage'), validateBody(saleSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const actorId = req.body.status === 'draft' ? null : requireActor(ctx);
  const calculated = calculateInvoiceTotals(req.body.lines.map((line: any) => ({
    quantity: line.quantity,
    unitAmount: line.unitPrice,
    taxRate: line.taxRate
  })));
  const lines = req.body.lines.map((line: any, index: number) => ({ ...line, total: calculated.lines[index].total }));
  const subtotal = calculated.subtotal;
  const iva = calculated.tax;
  const total = calculated.total;

  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope: 'sales.create',
    key: idempotencyKey(req),
    request: req.body,
    requestId: requestId(req),
    replay: async (tx, record) => {
      if (!record.resourceId) throw new HttpError(409, 'El resultado original de la venta no tiene recurso asociado.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', scope: 'sales.create' });
      const sale = await tx.salesInvoice.findFirst({ where: { id: record.resourceId, tenantId: ctx.tenantId }, include: { lines: true } });
      if (!sale) throw new HttpError(409, 'La venta original ya no puede reconstruirse.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', scope: 'sales.create' });
      const ledger = await tx.ledgerEntry.findFirst({ where: { tenantId: ctx.tenantId, source: 'sales', sourceId: sale.id }, select: { id: true } });
      return { ...sale, ledgerEntryId: ledger?.id || null };
    }
  }, async (tx) => {
    if (req.body.status !== 'draft') await assertPeriodOpen(ctx.tenantId, req.body.fiscalPeriod, tx);
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
      const draftLedger = await tx.ledgerEntry.create({
        data: {
          tenantId: ctx.tenantId,
          fiscalPeriod: sale.fiscalPeriod,
          description: `Venta ${sale.number}`,
          source: 'sales',
          sourceId: sale.id,
          salesInvoiceId: sale.id,
          posted: false,
          postedAt: null,
          postedBy: null,
          reversalOfId: null,
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
      const postedAt = new Date();
      const ledger = await tx.ledgerEntry.update({
        where: { id: draftLedger.id },
        data: { posted: true, postedAt, postedBy: actorId! }
      });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: actorId,
          action: 'ledger.entry.posted',
          entity: 'LedgerEntry',
          entityId: ledger.id,
          before: { posted: false, source: 'sales', sourceId: sale.id, fiscalPeriod: sale.fiscalPeriod },
          after: { posted: true, postedAt: postedAt.toISOString(), postedBy: actorId, source: 'sales', sourceId: sale.id, fiscalPeriod: sale.fiscalPeriod, requestId: requestId(req) },
          ipAddress: ctx.ip || null,
          userAgent: ctx.userAgent || null
        }
      });
      ledgerEntryId = ledger.id;
    }
    return { data: { ...sale, ledgerEntryId }, resourceType: 'SalesInvoice', resourceId: sale.id };
  });

  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  if (execution.replayed) {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'idempotency.replay', entity: 'salesInvoice', entityId: (execution.data as any).id, after: { scope: 'sales.create', recordId: execution.recordId, originalRequestId: execution.originalRequestId, requestId: requestId(req) }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  } else {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'create', entity: 'salesInvoice', entityId: (execution.data as any).id, after: execution.data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  }
  ok(res, execution.data, execution.responseCode);
}));

router.patch('/:id/cancel', requirePermission('sales.manage'), validateBody(cancellationSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const actorId = requireActor(ctx);
  const saleId = req.params.id;
  const scope = 'sales.cancel';
  let beforeSale: any = null;

  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope,
    key: idempotencyKey(req),
    request: { saleId, ...req.body },
    requestId: requestId(req),
    replay: async (tx, record) => {
      const resourceId = record.resourceId || saleId;
      const sale = await tx.salesInvoice.findFirst({ where: { id: resourceId, tenantId: ctx.tenantId }, include: { lines: true } });
      if (!sale) throw new HttpError(409, 'La anulación original ya no puede reconstruirse.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', scope });
      const reversal = await tx.ledgerEntry.findFirst({ where: { tenantId: ctx.tenantId, source: 'manual', sourceId: `sales-cancel:${sale.id}` } });
      return { sale, reversalId: reversal?.id || null, alreadyCancelled: true };
    }
  }, async (tx) => {
    const lockKey = `${scope}:${ctx.tenantId}:${saleId}`;
    await tx.$queryRaw<Array<{ locked: string | null }>>`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS locked`;

    const sale = await tx.salesInvoice.findFirst({ where: { id: saleId, tenantId: ctx.tenantId }, include: { lines: true } });
    if (!sale) throw new HttpError(404, 'Venta no encontrada.');
    beforeSale = sale;
    if (sale.status === 'draft') throw new HttpError(409, 'Los borradores se eliminan; no se anulan.');

    const originals = await tx.ledgerEntry.findMany({
      where: { tenantId: ctx.tenantId, reversalOfId: null, OR: [{ source: 'sales', sourceId: sale.id }, { source: 'sales', salesInvoiceId: sale.id }] },
      include: { lines: true, reversedBy: true },
      orderBy: { createdAt: 'asc' }
    });
    if (originals.length > 1) throw new HttpError(409, 'La venta posee múltiples asientos originales. Requiere conciliación antes de anular para evitar un reverso ambiguo.');
    const original = originals[0] || null;
    const reversalSourceId = `sales-cancel:${sale.id}`;

    if (sale.status === 'cancelled') {
      const reversal = original?.reversedBy || await tx.ledgerEntry.findFirst({ where: { tenantId: ctx.tenantId, source: 'manual', sourceId: reversalSourceId } });
      return { data: { sale, reversalId: reversal?.id || null, alreadyCancelled: true }, resourceType: 'SalesInvoice', resourceId: sale.id };
    }
    if (!original) throw new HttpError(409, 'La venta emitida no posee un asiento contable original. Debe conciliarse antes de anular; no se permite cancelar sin efecto contable trazable.');
    if (!original.posted) throw new HttpError(409, 'El asiento original de la venta no está contabilizado. Resuelve el backfill/inconsistencia antes de anular.');

    const reversalFiscalPeriod = req.body.reversalFiscalPeriod || sale.fiscalPeriod;
    await assertPeriodOpen(ctx.tenantId, reversalFiscalPeriod, tx);
    let reversalId: string | null = original.reversedBy?.id || null;
    if (!reversalId) {
      const reversalLines = inverseLedgerLines(original.lines);
      const draftReversal = await tx.ledgerEntry.create({
        data: {
          tenantId: ctx.tenantId,
          date: req.body.reversalDate || new Date(),
          fiscalPeriod: reversalFiscalPeriod,
          description: `Reverso por anulación de venta ${sale.number}`,
          source: 'manual',
          sourceId: reversalSourceId,
          salesInvoiceId: sale.id,
          posted: false,
          postedAt: null,
          postedBy: null,
          reversalOfId: null,
          lines: { create: reversalLines.map((line) => ({ accountCode: line.accountCode, accountName: line.accountName, debit: line.debit, credit: line.credit, currency: line.currency, exchangeRate: line.exchangeRate })) }
        }
      });
      const postedAt = new Date();
      const reversal = await tx.ledgerEntry.update({ where: { id: draftReversal.id }, data: { posted: true, postedAt, postedBy: actorId, reversalOfId: original.id } });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: actorId,
          action: 'ledger.entry.reversed',
          entity: 'LedgerEntry',
          entityId: reversal.id,
          before: { originalId: original.id, fiscalPeriod: original.fiscalPeriod, source: 'sales' },
          after: { reversalId: reversal.id, reversalOfId: original.id, fiscalPeriod: reversalFiscalPeriod, postedAt: postedAt.toISOString(), source: 'sales-cancel', requestId: requestId(req) },
          ipAddress: ctx.ip || null,
          userAgent: ctx.userAgent || null
        }
      });
      reversalId = reversal.id;
    }
    const cancelled = await tx.salesInvoice.update({ where: { id: sale.id }, data: { status: 'cancelled' }, include: { lines: true } });
    return { data: { sale: cancelled, reversalId, reversedEntries: [original.id], alreadyCancelled: false }, resourceType: 'SalesInvoice', resourceId: sale.id };
  });

  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  if (execution.replayed) {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'idempotency.replay', entity: 'salesInvoice', entityId: saleId, after: { scope, recordId: execution.recordId, originalRequestId: execution.originalRequestId, requestId: requestId(req) }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  } else {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'cancel', entity: 'salesInvoice', entityId: saleId, before: beforeSale, after: { ...execution.data, reason: req.body.reason || 'Anulación solicitada desde Ventas', reversalFiscalPeriod: req.body.reversalFiscalPeriod || beforeSale?.fiscalPeriod }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  }
  ok(res, execution.data, execution.responseCode);
}));

router.delete('/:id', requirePermission('sales.manage'), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const sale = await prisma.salesInvoice.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId }, include: { lines: true } });
  if (!sale) throw new HttpError(404, 'Venta no encontrada.');
  if (sale.status !== 'draft') throw new HttpError(409, 'Solo se eliminan ventas en borrador. Las ventas emitidas deben anularse.');
  const dentalLinks = await prisma.$queryRawUnsafe<Array<{ treatmentPlanId: string }>>(
    `SELECT "treatmentPlanId" FROM public."DentalFinancialLink" WHERE "tenantId"=$1 AND "salesInvoiceId"=$2 LIMIT 1`,
    ctx.tenantId,
    sale.id
  );
  if (dentalLinks.length) {
    throw new HttpError(409, 'El borrador está vinculado a un plan odontológico aceptado y conserva provenance financiera; no puede eliminarse desde Ventas.');
  }
  const veterinaryLinks = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM public."VeterinaryFinancialCase" WHERE "tenantId"=$1 AND "salesInvoiceId"=$2 LIMIT 1`,
    ctx.tenantId,
    sale.id
  );
  if (veterinaryLinks.length) {
    throw new HttpError(409, 'El borrador está vinculado al flujo financiero veterinario y conserva provenance de estimación, autorización, atención y consumos; no puede eliminarse desde Ventas.');
  }
  await prisma.salesInvoice.delete({ where: { id: sale.id } });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'delete-draft', entity: 'salesInvoice', entityId: sale.id, before: sale, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, { deleted: true, id: sale.id });
}));

export default router;
