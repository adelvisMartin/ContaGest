import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { add, serializeDecimal, serializeLegacyNumber, subtract, ZERO } from '../../shared/financial/decimal.js';
import { decimalSchema } from '../../shared/financial/zod.js';
import { createLedgerEntry, postLedgerEntry, reverseLedgerEntry } from './accounting.service.js';

const router = Router();
router.use(requireTenant);
const entrySchema = z.object({
  fiscalPeriod: z.string().min(6),
  description: z.string().min(2),
  source: z.literal('manual').optional(),
  lines: z.array(z.object({
    accountCode: z.string().min(1),
    accountName: z.string().min(2),
    debit: decimalSchema('money', { defaultValue: 0, nonnegative: true }),
    credit: decimalSchema('money', { defaultValue: 0, nonnegative: true }),
    currency: z.string().default('VES'),
    exchangeRate: decimalSchema('exchangeRate', { defaultValue: 1, positive: true })
  })).min(2)
});
const reversalSchema = z.object({
  fiscalPeriod: z.string().regex(/^\d{4}-\d{2}$/, 'Usa formato AAAA-MM.'),
  date: z.coerce.date().optional(),
  description: z.string().trim().min(3).max(500).optional()
});
const closingPeriodSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, 'Usa formato AAAA-MM.'), note: z.string().max(500).optional() });
const closeSchema = z.object({ note: z.string().max(500).optional() });
const context = (req: any) => req.context as { tenantId: string; userId?: string; ip?: string; userAgent?: string };

router.get('/entries', requirePermission('accounting.view'), asyncHandler(async (req, res) => {
  const tenantId = context(req).tenantId;
  ok(res, await prisma.ledgerEntry.findMany({
    where: { tenantId },
    include: { lines: true, reversalOf: { select: { id: true, fiscalPeriod: true, postedAt: true } }, reversedBy: { select: { id: true, fiscalPeriod: true, postedAt: true } } },
    orderBy: { date: 'desc' },
    take: 100
  }));
}));

router.post('/entries', requirePermission('accounting.post'), validateBody(entrySchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const created = await createLedgerEntry({ tenantId: ctx.tenantId, ...req.body, source: 'manual' });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'ledger.entry.created', entity: 'LedgerEntry', entityId: created.id, after: created, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, created);
}));

router.post('/entries/:id/post', requirePermission('accounting.post'), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const posted = await postLedgerEntry({
    tenantId: ctx.tenantId,
    entryId: req.params.id,
    postedBy: ctx.userId,
    audit: { userId: ctx.userId, ipAddress: ctx.ip, userAgent: ctx.userAgent }
  });
  ok(res, posted);
}));

router.post('/entries/:id/reverse', requirePermission('accounting.post'), validateBody(reversalSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const reversal = await reverseLedgerEntry({
    tenantId: ctx.tenantId,
    entryId: req.params.id,
    postedBy: ctx.userId,
    audit: { userId: ctx.userId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
    ...req.body
  });
  ok(res, reversal);
}));

router.get('/trial-balance', requirePermission('accounting.view'), asyncHandler(async (req, res) => {
  const tenantId = context(req).tenantId;
  const entries = await prisma.ledgerEntry.findMany({ where: { tenantId, posted: true }, include: { lines: true } });
  const accounts = new Map<string, { accountCode: string; accountName: string; debit: typeof ZERO; credit: typeof ZERO }>();
  for (const entry of entries) for (const line of entry.lines) {
    const key = line.accountCode;
    const row = accounts.get(key) || { accountCode: line.accountCode, accountName: line.accountName, debit: ZERO, credit: ZERO };
    row.debit = add(row.debit, line.debit);
    row.credit = add(row.credit, line.credit);
    accounts.set(key, row);
  }
  ok(res, Array.from(accounts.values()).map((row) => {
    const balance = subtract(row.debit, row.credit);
    return {
      accountCode: row.accountCode,
      accountName: row.accountName,
      debit: serializeLegacyNumber(row.debit),
      credit: serializeLegacyNumber(row.credit),
      balance: serializeLegacyNumber(balance),
      debitExact: serializeDecimal(row.debit, 2),
      creditExact: serializeDecimal(row.credit, 2),
      balanceExact: serializeDecimal(balance, 2)
    };
  }));
}));

router.get('/closing-periods', requirePermission('accounting.view'), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const periods = await prisma.closingPeriod.findMany({
    where: { tenantId: ctx.tenantId, module: 'accounting' },
    orderBy: { period: 'desc' },
    take: 120
  });
  ok(res, periods);
}));

router.post('/closing-periods', requirePermission('accounting.post'), validateBody(closingPeriodSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const existing = await prisma.closingPeriod.findFirst({ where: { tenantId: ctx.tenantId, period: req.body.period, module: 'accounting' } });
  if (existing) throw new HttpError(409, 'El período contable ya está registrado.');
  const created = await prisma.closingPeriod.create({ data: { tenantId: ctx.tenantId, period: req.body.period, module: 'accounting', status: 'open', note: req.body.note || null } });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'accounting.period-create', entity: 'ClosingPeriod', entityId: created.id, after: created, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, created);
}));

router.post('/closing-periods/:id/close', requirePermission('accounting.post'), validateBody(closeSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const existing = await prisma.closingPeriod.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId, module: 'accounting' } });
  if (!existing) throw new HttpError(404, 'Período contable no encontrado.');
  if (existing.status === 'closed') throw new HttpError(409, 'El período ya está cerrado.');
  const updated = await prisma.closingPeriod.update({
    where: { id: existing.id },
    data: { status: 'closed', closedAt: new Date(), closedBy: ctx.userId || 'session-user', note: req.body.note || existing.note || null }
  });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'accounting.period-close', entity: 'ClosingPeriod', entityId: updated.id, before: existing, after: updated, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, updated);
}));

export default router;
