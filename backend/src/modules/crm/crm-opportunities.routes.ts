import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import {
  createOpportunityFromQualifiedLead, listCrmOpportunities,
  CrmOpportunityConflictError, CrmOpportunityLeadNotFoundError
} from './crm-opportunity-store.mjs';

const router=Router();
router.use(requireTenant);

const opportunitySchema=z.object({
  title:z.string().trim().min(2).max(180),
  currency:z.string().regex(/^[A-Z]{3}$/),
  expectedValue:z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/),
  probability:z.number().int().min(0).max(100),
  expectedLeadUpdatedAt:z.string().datetime({offset:false,local:false})
}).strict();

const pageSchema=z.object({
  take:z.coerce.number().int().min(1).max(100).default(50),
  skip:z.coerce.number().int().min(0).max(10000).default(0)
}).strict();

router.get('/', requirePermission('sales.view'), asyncHandler(async(req,res)=>{
  const page=pageSchema.safeParse(req.query);
  if(!page.success) throw new HttpError(400,'Paginación CRM inválida.');
  const ctx=(req as any).context as {tenantId:string};
  const data=await listCrmOpportunities({db:prisma,tenantId:ctx.tenantId,...page.data});
  res.setHeader('Cache-Control','private, no-store');
  ok(res,data);
}));

router.post('/from-lead/:leadId',requirePermission('sales.manage'),validateBody(opportunitySchema),asyncHandler(async(req,res)=>{
  const ctx=(req as any).context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
  if(!ctx.userId) throw new HttpError(403,'Se requiere usuario autenticado.');
  let created;
  try {
    created=await createOpportunityFromQualifiedLead({
      db:prisma,tenantId:ctx.tenantId,actorId:ctx.userId,leadId:req.params.leadId,
      draft:req.body,ipAddress:ctx.ip,userAgent:ctx.userAgent
    });
  } catch(error) {
    if(error instanceof CrmOpportunityLeadNotFoundError) throw new HttpError(404,'Prospecto no encontrado.');
    if(error instanceof CrmOpportunityConflictError) throw new HttpError(409,'El prospecto cambió o ya tiene oportunidad. Actualiza el listado.');
    if(error instanceof TypeError &&
       ['CRM_LEAD_ID_INVALID','CRM_LEAD_REVISION_REQUIRED','CRM_CURRENCY_INVALID',
        'CRM_PROBABILITY_INVALID','CRM_VALUE_MUST_BE_POSITIVE','CRM_OPPORTUNITY_TITLE_INVALID']
         .includes(error.message)) throw new HttpError(400,'Datos de oportunidad inválidos.');
    throw error;
  }
  res.setHeader('Cache-Control','private, no-store');
  ok(res,created,201);
}));

export default router;
