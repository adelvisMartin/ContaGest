import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { createLedgerEntry } from './accounting.service.js';

const router = Router();
router.use(requireTenant);
const entrySchema = z.object({ fiscalPeriod: z.string().min(6), description: z.string().min(2), source: z.enum(['manual','sales','purchase','payroll','banking','tax','inventory']).default('manual'), lines: z.array(z.object({ accountCode: z.string().min(1), accountName: z.string().min(2), debit: z.coerce.number().default(0), credit: z.coerce.number().default(0), currency: z.string().default('VES'), exchangeRate: z.coerce.number().default(1) })).min(2) });
const closingPeriodSchema = z.object({ period:z.string().regex(/^\d{4}-\d{2}$/,'Usa formato AAAA-MM.'), note:z.string().max(500).optional() });
const closeSchema = z.object({ note:z.string().max(500).optional() });
const context=(req:any)=>req.context as { tenantId:string; userId?:string; ip?:string; userAgent?:string };

router.get('/entries', requirePermission('accounting.view'), asyncHandler(async (req, res) => {
  const tenantId = context(req).tenantId;
  ok(res, await prisma.ledgerEntry.findMany({ where: { tenantId }, include: { lines: true }, orderBy: { date: 'desc' }, take: 100 }));
}));
router.post('/entries', requirePermission('accounting.post'), validateBody(entrySchema), asyncHandler(async (req, res) => {
  ok(res, await createLedgerEntry({ tenantId: context(req).tenantId, ...req.body }));
}));
router.get('/trial-balance', requirePermission('accounting.view'), asyncHandler(async (req, res) => {
  const tenantId = context(req).tenantId;
  const entries = await prisma.ledgerEntry.findMany({ where: { tenantId }, include: { lines: true } });
  const accounts = new Map<string, any>();
  for (const e of entries) for (const l of e.lines) {
    const key = l.accountCode;
    const row = accounts.get(key) || { accountCode: l.accountCode, accountName: l.accountName, debit: 0, credit: 0 };
    row.debit += Number(l.debit); row.credit += Number(l.credit); accounts.set(key, row);
  }
  ok(res, Array.from(accounts.values()).map((r) => ({ ...r, balance: r.debit - r.credit })));
}));

router.get('/closing-periods', requirePermission('accounting.view'), asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const periods=await prisma.closingPeriod.findMany({
    where:{ tenantId:ctx.tenantId,module:'accounting' },
    orderBy:{ period:'desc' },
    take:120
  });
  ok(res,periods);
}));

router.post('/closing-periods', requirePermission('accounting.post'), validateBody(closingPeriodSchema), asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const existing=await prisma.closingPeriod.findFirst({ where:{ tenantId:ctx.tenantId,period:req.body.period,module:'accounting' } });
  if(existing)throw new HttpError(409,'El período contable ya está registrado.');
  const created=await prisma.closingPeriod.create({ data:{ tenantId:ctx.tenantId,period:req.body.period,module:'accounting',status:'open',note:req.body.note||null } });
  await writeAudit({ tenantId:ctx.tenantId,userId:ctx.userId,action:'accounting.period-create',entity:'ClosingPeriod',entityId:created.id,after:created,ipAddress:ctx.ip,userAgent:ctx.userAgent });
  ok(res,created);
}));

router.post('/closing-periods/:id/close', requirePermission('accounting.post'), validateBody(closeSchema), asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const existing=await prisma.closingPeriod.findFirst({ where:{ id:req.params.id,tenantId:ctx.tenantId,module:'accounting' } });
  if(!existing)throw new HttpError(404,'Período contable no encontrado.');
  if(existing.status==='closed')throw new HttpError(409,'El período ya está cerrado.');
  const updated=await prisma.closingPeriod.update({
    where:{ id:existing.id },
    data:{ status:'closed',closedAt:new Date(),closedBy:ctx.userId||'session-user',note:req.body.note||existing.note||null }
  });
  await writeAudit({ tenantId:ctx.tenantId,userId:ctx.userId,action:'accounting.period-close',entity:'ClosingPeriod',entityId:updated.id,before:existing,after:updated,ipAddress:ctx.ip,userAgent:ctx.userAgent });
  ok(res,updated);
}));

export default router;
