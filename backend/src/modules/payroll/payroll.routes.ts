import { Router } from 'express';
import { z } from 'zod';
import { Prisma, PayrollStatus } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { HttpError, asyncHandler, ok } from '../../shared/http.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { serializeDecimal, serializeLegacyNumber, ZERO } from '../../shared/financial/decimal.js';
import { decimalSchema } from '../../shared/financial/zod.js';
import { assertPayrollReceiptArithmetic } from './payroll-receipt-arithmetic.js';

const router = Router();
router.use(requireTenant, requirePermission('payroll.manage'));

const periodSchema = z.object({ period: z.string().min(4).max(30) });
const receiptSchema = z.object({
  periodId: z.string().uuid().optional(),
  period: z.string().min(4).max(30).optional(),
  employeeId: z.string().uuid(),
  gross: decimalSchema('money', { nonnegative: true }),
  deductions: decimalSchema('money', { nonnegative: true }),
  net: decimalSchema('money', { nonnegative: true }),
  details: z.record(z.string(), z.unknown()).optional()
}).refine((value) => Boolean(value.periodId || value.period), { message: 'Indica periodId o period.' });
const statusSchema = z.object({ status: z.enum(['draft', 'approved', 'paid', 'cancelled']) });

const context = (req: any) => req.context as { tenantId: string; userId?: string; ip?: string; userAgent?: string };
const serializeReceipt = (receipt: any) => ({
  ...receipt,
  gross: serializeLegacyNumber(receipt.gross),
  deductions: serializeLegacyNumber(receipt.deductions),
  net: serializeLegacyNumber(receipt.net),
  grossExact: serializeDecimal(receipt.gross, 2),
  deductionsExact: serializeDecimal(receipt.deductions, 2),
  netExact: serializeDecimal(receipt.net, 2)
});
const serializePeriod = (period: any) => ({
  ...period,
  totalGross: serializeLegacyNumber(period.totalGross),
  totalDeductions: serializeLegacyNumber(period.totalDeductions),
  totalNet: serializeLegacyNumber(period.totalNet),
  totalGrossExact: serializeDecimal(period.totalGross, 2),
  totalDeductionsExact: serializeDecimal(period.totalDeductions, 2),
  totalNetExact: serializeDecimal(period.totalNet, 2),
  receipts: (period.receipts || []).map(serializeReceipt)
});
const toJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
const allowedStatusTransitions: Record<string, string[]> = {
  draft: ['approved', 'cancelled'],
  approved: ['paid', 'cancelled'],
  paid: [],
  cancelled: []
};

async function recalculatePeriod(periodId: string, tx: Prisma.TransactionClient) {
  const totals = await tx.payrollReceipt.aggregate({
    where: { periodId },
    _sum: { gross: true, deductions: true, net: true }
  });
  return tx.payrollPeriod.update({
    where: { id: periodId },
    data: {
      totalGross: totals._sum.gross ?? ZERO,
      totalDeductions: totals._sum.deductions ?? ZERO,
      totalNet: totals._sum.net ?? ZERO
    },
    include: { receipts: { include: { employee: true }, orderBy: { createdAt: 'desc' } } }
  });
}

router.get('/periods', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const status = String(req.query.status || '');
  const rows = await prisma.payrollPeriod.findMany({
    where: { tenantId: ctx.tenantId, ...(status ? { status: status as any } : {}) },
    include: { receipts: { include: { employee: true }, orderBy: { createdAt: 'desc' } } },
    orderBy: { period: 'desc' },
    take: 100
  });
  ok(res, rows.map(serializePeriod));
}));

router.post('/periods', validateBody(periodSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const existing = await prisma.payrollPeriod.findFirst({ where: { tenantId: ctx.tenantId, period: req.body.period } });
  if (existing) throw new HttpError(409, 'El período de nómina ya existe.');
  const created = await prisma.payrollPeriod.create({ data: { tenantId: ctx.tenantId, period: req.body.period }, include: { receipts: true } });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'payroll.create-period', entity: 'PayrollPeriod', entityId: created.id, after: serializePeriod(created), ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, serializePeriod(created));
}));

// Receipt create, duplicate prevention, totals and audit must share one
// transaction and a tenant-owned parent-period row lock.
async function lockPayrollPeriod(tx: Prisma.TransactionClient, tenantId: string, periodId: string) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM public."PayrollPeriod"
    WHERE "id"=${periodId} AND "tenantId"=${tenantId}
    FOR UPDATE
  `);
  if (locked.length !== 1) throw new HttpError(404, 'Período de nómina no encontrado para esta empresa.');
}

router.post('/receipts', validateBody(receiptSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const input = req.body as z.infer<typeof receiptSchema>;
  try { assertPayrollReceiptArithmetic(input); }
  catch { throw new HttpError(422, 'El recibo no cuadra: bruto debe ser exactamente deducciones más neto.', { code: 'PAYROLL_RECEIPT_NOT_BALANCED' }); }
  const result = await prisma.$transaction(async tx => {
    const period = input.periodId
      ? await tx.payrollPeriod.findFirst({ where: { id: input.periodId, tenantId: ctx.tenantId } })
      : await tx.payrollPeriod.upsert({
          where: { tenantId_period: { tenantId: ctx.tenantId, period: input.period! } },
          create: { tenantId: ctx.tenantId, period: input.period! },
          update: {},
        });
    if (!period) throw new HttpError(404, 'Período de nómina no encontrado.');
    if (input.period && input.period !== period.period)
      throw new HttpError(422, 'periodId no corresponde al período solicitado.', { code: 'PAYROLL_PERIOD_ID_MISMATCH' });
    await lockPayrollPeriod(tx, ctx.tenantId, period.id);
    const current = await tx.payrollPeriod.findFirst({ where: { id: period.id, tenantId: ctx.tenantId } });
    if (!current || current.status !== 'draft')
      throw new HttpError(409, 'Solo se pueden modificar períodos en borrador.');
    const employee = await tx.employee.findFirst({ where: {
      id: input.employeeId, tenantId: ctx.tenantId, active: true,
    } });
    if (!employee) throw new HttpError(404, 'Empleado no encontrado para el tenant activo.');
    const duplicate = await tx.payrollReceipt.count({ where: {
      periodId: period.id, employeeId: employee.id,
    } });
    if (duplicate) throw new HttpError(409, 'El empleado ya tiene recibo en este período.');
    const created = await tx.payrollReceipt.create({
      data: { periodId: period.id, employeeId: employee.id, gross: input.gross,
        deductions: input.deductions, net: input.net, details: toJson(input.details) },
      include: { employee: true },
    });
    const updated = await recalculatePeriod(period.id, tx);
    await tx.auditLog.create({ data: {
      tenantId: ctx.tenantId, userId: ctx.userId || null,
      action: 'payroll.create-receipt', entity: 'PayrollReceipt', entityId: created.id,
      after: toJson(serializeReceipt(created)), ipAddress: ctx.ip || null,
      userAgent: ctx.userAgent || null,
    } });
    return { receipt: serializeReceipt(created), period: serializePeriod(updated) };
  });
  ok(res, result);
}));

router.patch('/periods/:id/status', validateBody(statusSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const nextStatus = statusSchema.parse(req.body).status as PayrollStatus;
  const updated = await prisma.$transaction(async tx => {
    await lockPayrollPeriod(tx, ctx.tenantId, req.params.id);
    const existing = await tx.payrollPeriod.findFirst({
      where: { id: req.params.id, tenantId: ctx.tenantId }, include: { receipts: true },
    });
    if (!existing) throw new HttpError(404, 'Período de nómina no encontrado.');
    if (!allowedStatusTransitions[existing.status]?.includes(nextStatus)) {
      throw new HttpError(409, `Transición de nómina no permitida: ${existing.status} → ${nextStatus}. Los períodos pagados o cancelados son terminales.`);
    }
    if (nextStatus === 'approved' && !existing.receipts.length)
      throw new HttpError(409, 'No se puede aprobar un período sin recibos.');
    const period = await tx.payrollPeriod.update({
      where: { id: existing.id }, data: { status: nextStatus },
      include: { receipts: { include: { employee: true } } },
    });
    await tx.auditLog.create({ data: {
      tenantId: ctx.tenantId, userId: ctx.userId || null,
      action: `payroll.period-${nextStatus}`, entity: 'PayrollPeriod', entityId: period.id,
      before: toJson(serializePeriod(existing)), after: toJson(serializePeriod(period)),
      ipAddress: ctx.ip || null, userAgent: ctx.userAgent || null,
    } });
    return period;
  });
  ok(res, serializePeriod(updated));
}));

router.delete('/receipts/:id', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const result = await prisma.$transaction(async tx => {
    // Read only the identifier first, then lock and re-read the complete parent.
    const initial = await tx.payrollReceipt.findFirst({
      where: { id: req.params.id, period: { tenantId: ctx.tenantId } },
      select: { periodId: true },
    });
    if (!initial) throw new HttpError(404, 'Recibo de nómina no encontrado.');
    await lockPayrollPeriod(tx, ctx.tenantId, initial.periodId);
    const existing = await tx.payrollReceipt.findFirst({
      where: { id: req.params.id, period: { tenantId: ctx.tenantId } },
      include: { period: true, employee: true },
    });
    if (!existing) throw new HttpError(404, 'Recibo de nómina no encontrado.');
    if (existing.period.status !== 'draft')
      throw new HttpError(409, 'Solo se eliminan recibos de períodos en borrador.');
    await tx.payrollReceipt.delete({ where: { id: existing.id } });
    const period = await recalculatePeriod(existing.periodId, tx);
    await tx.auditLog.create({ data: {
      tenantId: ctx.tenantId, userId: ctx.userId || null,
      action: 'payroll.delete-receipt', entity: 'PayrollReceipt', entityId: existing.id,
      before: toJson(serializeReceipt(existing)),
      ipAddress: ctx.ip || null, userAgent: ctx.userAgent || null,
    } });
    return { deleted: true, id: existing.id, period: serializePeriod(period) };
  });
  ok(res, result);
}));

export default router;
