import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { createLedgerEntry } from './accounting.service.js';

const router = Router();
router.use(requireTenant);
const entrySchema = z.object({ fiscalPeriod: z.string().min(6), description: z.string().min(2), source: z.enum(['manual','sales','purchase','payroll','banking','tax','inventory']).default('manual'), lines: z.array(z.object({ accountCode: z.string().min(1), accountName: z.string().min(2), debit: z.coerce.number().default(0), credit: z.coerce.number().default(0), currency: z.string().default('VES'), exchangeRate: z.coerce.number().default(1) })).min(2) });

router.get('/entries', asyncHandler(async (req, res) => {
  const tenantId = (req as any).context.tenantId;
  ok(res, await prisma.ledgerEntry.findMany({ where: { tenantId }, include: { lines: true }, orderBy: { date: 'desc' }, take: 100 }));
}));
router.post('/entries', validateBody(entrySchema), asyncHandler(async (req, res) => {
  ok(res, await createLedgerEntry({ tenantId: (req as any).context.tenantId, ...req.body }));
}));
router.get('/trial-balance', asyncHandler(async (req, res) => {
  const tenantId = (req as any).context.tenantId;
  const entries = await prisma.ledgerEntry.findMany({ where: { tenantId }, include: { lines: true } });
  const accounts = new Map<string, any>();
  for (const e of entries) for (const l of e.lines) {
    const key = l.accountCode;
    const row = accounts.get(key) || { accountCode: l.accountCode, accountName: l.accountName, debit: 0, credit: 0 };
    row.debit += Number(l.debit); row.credit += Number(l.credit); accounts.set(key, row);
  }
  ok(res, Array.from(accounts.values()).map((r) => ({ ...r, balance: r.debit - r.credit })));
}));
export default router;
