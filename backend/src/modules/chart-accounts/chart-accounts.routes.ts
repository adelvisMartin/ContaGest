import { Router } from 'express';
import { z } from 'zod';
import chartAccountsData from '../../../data/chart_accounts.json' with { type: 'json' };
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError } from '../../shared/http.js';
import { requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { assertBalanced } from '../accounting/accounting.service.js';

const chartAccounts = chartAccountsData as Array<{
  code: string;
  name: string;
  type: string;
  nature: 'debit' | 'credit';
  level: number;
  parentCode?: string | null;
  allowPosting: boolean;
  description?: string | null;
}>;
const router = Router();
router.use(requireTenant);
const accountSchema = z.object({ code: z.string(), name: z.string(), type: z.string(), nature: z.enum(['debit','credit']), level: z.number().int().default(1), parentCode: z.string().optional().nullable(), allowPosting: z.boolean().default(true), description: z.string().optional().nullable(), active: z.boolean().default(true) });
const validateSchema = z.object({ lines: z.array(z.object({ accountCode: z.string(), accountName: z.string().optional(), debit: z.number().optional().default(0), credit: z.number().optional().default(0) })) });
const getTenantId = (req: any) => req.context?.tenantId;

router.get('/template', (_req, res) => res.json({ standard: 'VEN-NIF PYME template', warning: 'No es catálogo oficial universal; debe ser validado por contador público según actividad.', accounts: chartAccounts }));
router.get('/', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const accounts = await prisma.chartAccount.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  res.json(accounts.length ? accounts : chartAccounts);
}));
router.post('/sync-template', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  let created = 0;
  for (const account of chartAccounts) {
    await prisma.chartAccount.upsert({ where: { tenantId_code: { tenantId, code: account.code } }, update: { ...account }, create: { tenantId, ...account } });
    created++;
  }
  res.json({ ok: true, synced: created });
}));
router.post('/', validateBody(accountSchema), asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const record = await prisma.chartAccount.create({ data: { tenantId, ...req.body } });
  res.status(201).json(record);
}));
router.post('/validate-entry', validateBody(validateSchema), asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const codes = req.body.lines.map((line: any) => line.accountCode);
  const accounts = await prisma.chartAccount.findMany({ where: { tenantId, code: { in: codes }, active: true } });
  const typedAccounts = accounts as Array<{ code: string; name?: string; allowPosting?: boolean }>;
  const map = new Map(typedAccounts.map((a) => [a.code, a]));
  for (const line of req.body.lines) {
    const account = map.get(line.accountCode);
    if (!account) throw new HttpError(422, `Cuenta ${line.accountCode} no existe o está inactiva.`);
    if (!account.allowPosting) throw new HttpError(422, `Cuenta ${line.accountCode} es de agrupación y no permite asientos.`);
  }
  const totals = assertBalanced(req.body.lines.map((line: any) => ({ ...line, accountName: map.get(line.accountCode)?.name || line.accountName || '' })));
  res.json({ ok: true, ...totals });
}));
export default router;
