import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { createCrmLead, listCrmLeads } from './crm-lead-store.mjs';

const router = Router();
router.use(requireTenant);

const leadDraftSchema = z.object({
  name:z.string().trim().min(2).max(180),
  rif:z.string().trim().min(1).max(40).optional(),
  email:z.string().trim().email().max(254).optional(),
  phone:z.string().trim().min(1).max(60).optional(),
  notes:z.string().trim().min(1).max(2000).optional(),
  nextActionAt:z.string().datetime({offset:false,local:false}).optional()
}).strict().refine(data => Boolean(data.rif || data.email));

const pageSchema = z.object({
  take:z.coerce.number().int().min(1).max(100).default(50),
  skip:z.coerce.number().int().min(0).max(10000).default(0)
}).strict();

router.get('/',requirePermission('sales.view'),asyncHandler(async(req,res)=>{
  const page = pageSchema.safeParse(req.query);
  if (!page.success) throw new HttpError(400,'Paginación CRM inválida.');
  const tenantId = (req as any).context.tenantId as string;
  const leads = await listCrmLeads({db:prisma,tenantId,...page.data});
  res.setHeader('Cache-Control','private, no-store');
  ok(res,leads);
}));

router.post('/',requirePermission('sales.manage'),validateBody(leadDraftSchema),asyncHandler(async(req,res)=>{
  const ctx = (req as any).context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
  if (!ctx.userId) throw new HttpError(403,'Se requiere identidad de usuario verificada.');
  // User and tenant always come from server requestContext, never the body.
  const lead = await createCrmLead({
    db:prisma, tenantId:ctx.tenantId, actorId:ctx.userId,
    draft:req.body, ipAddress:ctx.ip, userAgent:ctx.userAgent
  });
  res.setHeader('Cache-Control','private, no-store');
  ok(res,lead,201);
}));

export default router;
