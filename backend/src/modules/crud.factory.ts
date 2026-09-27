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

const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 250;

function boundedInteger(value: unknown, fallback: number, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

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

    // Keep the response contract (array) backward compatible while making the
    // data boundary bounded and explicitly pageable. `limit` is accepted as a
    // compatibility alias for older callers; new clients should use take/skip.
    const requestedTake = req.query.take ?? req.query.limit ?? DEFAULT_PAGE_SIZE;
    const take = boundedInteger(requestedTake, DEFAULT_PAGE_SIZE, { min: 1, max: MAX_PAGE_SIZE });
    const skip = boundedInteger(req.query.skip, 0, { min: 0, max: 10_000_000 });
    const data = await delegate().findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, MAX_PAGE_SIZE),
      skip
    });
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
