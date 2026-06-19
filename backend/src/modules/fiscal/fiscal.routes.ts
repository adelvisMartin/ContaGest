import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError } from '../../shared/http.js';
import { requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
const router = Router();
router.use(requireTenant);
const closeSchema = z.object({ period: z.string(), module: z.string(), note: z.string().optional() });
const fiscalSchema = z.object({ kind: z.string(), number: z.string(), period: z.string(), payload: z.record(z.string(), z.unknown()).default({}) });
const getTenantId = (req: any) => req.context?.tenantId;
router.post('/close-period', validateBody(closeSchema), asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const record = await prisma.closingPeriod.upsert({ where: { tenantId_period_module: { tenantId, period: req.body.period, module: req.body.module } }, update: { status: 'closed', closedAt: new Date(), note: req.body.note }, create: { tenantId, period: req.body.period, module: req.body.module, status: 'closed', closedAt: new Date(), note: req.body.note } });
  res.json(record);
}));
router.post('/reopen-period', validateBody(closeSchema), asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const record = await prisma.closingPeriod.update({ where: { tenantId_period_module: { tenantId, period: req.body.period, module: req.body.module } }, data: { status: 'open', note: req.body.note } });
  res.json(record);
}));
router.post('/documents', validateBody(fiscalSchema), asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const existing = await prisma.fiscalDocument.findUnique({ where: { tenantId_kind_number: { tenantId, kind: req.body.kind, number: req.body.number } } });
  if (existing) throw new HttpError(409, 'Documento fiscal duplicado.');
  const hash = crypto.createHash('sha256').update(JSON.stringify({ tenantId, ...req.body })).digest('hex');
  const record = await prisma.fiscalDocument.create({ data: { tenantId, kind: req.body.kind, number: req.body.number, period: req.body.period, payload: req.body.payload, hash } });
  res.status(201).json(record);
}));
router.get('/documents', asyncHandler(async (req, res) => res.json(await prisma.fiscalDocument.findMany({ where: { tenantId: getTenantId(req) }, orderBy: { createdAt: 'desc' }, take: 100 }))));
export default router;
