import { Router } from 'express';
import { z } from 'zod';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { getPersistedReorderPolicy, savePersistedReorderPolicy } from './reorder-policy.repository.js';

const router = Router();
router.use(requireTenant);

const productIdSchema = z.string().uuid();
const quantityExact = z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/);
const writeSchema = z.object({
  expectedRevision: z.number().int().min(0).max(2147483645),
  enabled: z.boolean(),
  reorderPointExact: quantityExact,
  targetStockExact: quantityExact,
  safetyStockExact: quantityExact,
  orderMultipleExact: quantityExact,
  leadTimeDays: z.string().regex(/^(?:0|[1-9]\d{0,2})$/)
}).strict();

const scope = (req: any) => req.context as {tenantId:string;userId?:string};

router.get('/:productId',requirePermission('reports.view'),asyncHandler(async(req,res)=>{
  const id = productIdSchema.safeParse(req.params.productId);
  if (!id.success) throw new HttpError(400,'ID de producto inválido.',{code:'REORDER_POLICY_PRODUCT_ID_INVALID'});
  res.setHeader('Cache-Control','private, no-store');
  ok(res,await getPersistedReorderPolicy({tenantId:scope(req).tenantId,productId:id.data}));
}));

router.put('/:productId',requirePermission('inventory.manage'),validateBody(writeSchema),asyncHandler(async(req,res)=>{
  const id = productIdSchema.safeParse(req.params.productId);
  if (!id.success) throw new HttpError(400,'ID de producto inválido.',{code:'REORDER_POLICY_PRODUCT_ID_INVALID'});
  const ctx=scope(req);
  if (!ctx.userId) throw new HttpError(401,'La política requiere actor autenticado.',{code:'REORDER_POLICY_ACTOR_REQUIRED'});
  res.setHeader('Cache-Control','private, no-store');
  ok(res,await savePersistedReorderPolicy({
    tenantId:ctx.tenantId,productId:id.data,userId:ctx.userId,policy:req.body
  }));
}));

export default router;
