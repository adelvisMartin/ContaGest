import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../shared/http.js';
import { requirePermission, requireTenant } from '../shared/middleware/context.js';
import { validateBody } from '../shared/middleware/validate.js';
import { writeAudit } from '../shared/services/audit.service.js';

type CrudOptions = {
  model: keyof typeof prisma;
  entity: string;
  permission: string;
  schema: z.ZodTypeAny;
  tenantScoped?: boolean;
  searchFields?: string[];
};

export function createCrudRouter(options: CrudOptions) {
  const router = Router();
  const delegate = () => {
    const model = (prisma as any)[options.model];
    if (!model) throw new Error(`Prisma model not found: ${String(options.model)}`);
    return model;
  };

  router.use(requireTenant, requirePermission(options.permission));

  router.get('/', asyncHandler(async (req, res) => {
    const tenantId = (req as any).context.tenantId;
    const q = String(req.query.q || '').trim();
    const where: any = options.tenantScoped === false ? {} : { tenantId };
    if (q && options.searchFields?.length) {
      where.OR = options.searchFields.map((field) => ({ [field]: { contains: q, mode: 'insensitive' } }));
    }
    const data = await delegate().findMany({ where, orderBy: { createdAt: 'desc' }, take: Number(req.query.take || 100) });
    ok(res, data);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const tenantId = (req as any).context.tenantId;
    const where: any = { id: req.params.id };
    const data = await delegate().findFirst({ where: options.tenantScoped === false ? where : { ...where, tenantId } });
    if (!data) throw new HttpError(404, `${options.entity} no encontrado`);
    ok(res, data);
  }));

  router.post('/', validateBody(options.schema), asyncHandler(async (req, res) => {
    const ctx = (req as any).context;
    const payload = options.tenantScoped === false ? req.body : { ...req.body, tenantId: ctx.tenantId };
    const data = await delegate().create({ data: payload });
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'create', entity: options.entity, entityId: data.id, after: data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
    ok(res, data);
  }));

  router.put('/:id', validateBody((options.schema as z.ZodObject<any>).partial()), asyncHandler(async (req, res) => {
    const ctx = (req as any).context;
    const before = await delegate().findFirst({ where: options.tenantScoped === false ? { id: req.params.id } : { id: req.params.id, tenantId: ctx.tenantId } });
    if (!before) throw new HttpError(404, `${options.entity} no encontrado`);
    const data = await delegate().update({ where: { id: req.params.id }, data: req.body });
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'update', entity: options.entity, entityId: data.id, before, after: data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
    ok(res, data);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const ctx = (req as any).context;
    const before = await delegate().findFirst({ where: options.tenantScoped === false ? { id: req.params.id } : { id: req.params.id, tenantId: ctx.tenantId } });
    if (!before) throw new HttpError(404, `${options.entity} no encontrado`);
    const data = await delegate().delete({ where: { id: req.params.id } });
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'delete', entity: options.entity, entityId: req.params.id, before, ipAddress: ctx.ip, userAgent: ctx.userAgent });
    ok(res, data);
  }));

  return router;
}
