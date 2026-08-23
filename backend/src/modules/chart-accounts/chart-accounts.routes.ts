import { Router } from 'express';
import { z } from 'zod';
import chartAccountsData from '../../../data/chart_accounts.json' with { type: 'json' };
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
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
const accountSchema = z.object({
  code:z.string().trim().min(1).max(40),
  name:z.string().trim().min(2).max(180),
  type:z.string().trim().min(2).max(40),
  nature:z.enum(['debit','credit']),
  level:z.number().int().min(1).max(12).default(1),
  parentCode:z.string().trim().max(40).optional().nullable(),
  allowPosting:z.boolean().default(true),
  description:z.string().trim().max(500).optional().nullable(),
  active:z.boolean().default(true)
});
const validateSchema = z.object({ lines: z.array(z.object({ accountCode:z.string(), accountName:z.string().optional(), debit:z.number().optional().default(0), credit:z.number().optional().default(0) })).min(2) });
const getTenantId = (req: any) => req.context?.tenantId;

router.get('/template', requirePermission('accounting.view'), (_req, res) => res.json({ standard:'VEN-NIF PYME template', warning:'No es catálogo oficial universal; debe ser validado por contador público según actividad.', accounts:chartAccounts }));
router.get('/', requirePermission('accounting.view'), asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const accounts = await prisma.chartAccount.findMany({ where:{ tenantId }, orderBy:{ code:'asc' } });
  res.json(accounts.length ? accounts : chartAccounts);
}));
router.post('/sync-template', requirePermission('accounting.post'), asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  let synced = 0;
  for (const account of chartAccounts) {
    await prisma.chartAccount.upsert({ where:{ tenantId_code:{ tenantId, code:account.code } }, update:{ ...account }, create:{ tenantId, ...account } });
    synced++;
  }
  res.json({ ok:true, synced });
}));
router.post('/', requirePermission('accounting.post'), validateBody(accountSchema), asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const existing=await prisma.chartAccount.findFirst({ where:{ tenantId, code:req.body.code } });
  if(existing)throw new HttpError(409,`La cuenta ${req.body.code} ya existe para la empresa activa.`);
  if(req.body.parentCode){
    const parent=await prisma.chartAccount.findFirst({ where:{ tenantId, code:req.body.parentCode, active:true } });
    if(!parent)throw new HttpError(422,`La cuenta padre ${req.body.parentCode} no existe o está inactiva.`);
  }
  const record = await prisma.chartAccount.create({ data:{ tenantId, ...req.body } });
  res.status(201).json(record);
}));
router.post('/validate-entry', requirePermission('accounting.view'), validateBody(validateSchema), asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const codes = req.body.lines.map((line:any) => line.accountCode);
  const accounts = await prisma.chartAccount.findMany({ where:{ tenantId, code:{ in:codes }, active:true } });
  const typedAccounts = accounts as Array<{ code:string; name?:string; allowPosting?:boolean }>;
  const map = new Map(typedAccounts.map((account) => [account.code, account]));
  for (const line of req.body.lines) {
    const account = map.get(line.accountCode);
    if (!account) throw new HttpError(422, `Cuenta ${line.accountCode} no existe o está inactiva.`);
    if (!account.allowPosting) throw new HttpError(422, `Cuenta ${line.accountCode} es de agrupación y no permite asientos.`);
  }
  const totals = assertBalanced(req.body.lines.map((line:any) => ({ ...line, accountName:map.get(line.accountCode)?.name || line.accountName || '' })));
  res.json({ ok:true, ...totals });
}));
export default router;
