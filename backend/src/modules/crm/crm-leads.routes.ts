import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { createCrmLead, listCrmLeads, CrmLeadReplayError } from './crm-lead-store.mjs';
import { transitionCrmLeadStage, CrmLeadConflictError, CrmLeadNotFoundError, CrmLeadStageError } from './crm-lead-stage.mjs';

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
  const idempotencyKey = String(req.header('Idempotency-Key') || '');
  let lead;
  try {
    lead = await createCrmLead({
      db:prisma, tenantId:ctx.tenantId, actorId:ctx.userId, idempotencyKey,
      draft:req.body, ipAddress:ctx.ip, userAgent:ctx.userAgent
    });
  } catch (error) {
    if (error instanceof CrmLeadReplayError) throw new HttpError(409,'Este intento de alta CRM ya fue procesado. Consulta el listado antes de repetir.');
    if (error instanceof TypeError &&
      (error.message === 'CRM_IDEMPOTENCY_KEY_REQUIRED' ||
       error.message === 'CRM_LEAD_CONTACT_REQUIRED' ||
       error.message.startsWith('INVALID_CRM_LEAD_'))) {
      throw new HttpError(400,'Identidad fiscal o clave de intento CRM inválida.');
    }
    throw error;
  }
  res.setHeader('Cache-Control','private, no-store');
  ok(res,lead,201);
}));

const stageBodySchema = z.object({
  nextStage:z.enum(['qualified','lost']),
  expectedUpdatedAt:z.string().datetime({offset:false,local:false})
}).strict();

router.patch('/:id/stage',requirePermission('sales.manage'),validateBody(stageBodySchema),asyncHandler(async(req,res)=>{
  const ctx = (req as any).context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
  if (!ctx.userId) throw new HttpError(403,'Se requiere identidad de usuario verificada.');
  let changed;
  try {
    changed = await transitionCrmLeadStage({
      db:prisma,tenantId:ctx.tenantId,actorId:ctx.userId,leadId:req.params.id,
      nextStage:req.body.nextStage,expectedUpdatedAt:req.body.expectedUpdatedAt,
      ipAddress:ctx.ip,userAgent:ctx.userAgent
    });
  } catch(error) {
    if (error instanceof CrmLeadNotFoundError) throw new HttpError(404,'Prospecto no encontrado.');
    if (error instanceof CrmLeadConflictError) throw new HttpError(409,'El prospecto cambió desde la última consulta. Actualiza el listado.');
    if (error instanceof CrmLeadStageError) throw new HttpError(409,'Transición de etapa CRM no permitida.');
    if (error instanceof TypeError &&
        ['CRM_LEAD_ID_INVALID','CRM_LEAD_REVISION_REQUIRED'].includes(error.message)) {
      throw new HttpError(400,'Identificador o revisión de prospecto inválido.');
    }
    throw error;
  }
  res.setHeader('Cache-Control','private, no-store');
  ok(res,changed);
}));

export default router;
