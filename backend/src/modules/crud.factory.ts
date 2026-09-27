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

const DEFAULT_LIST_TAKE = 100;
const MAX_LIST_TAKE = 500;
const MAX_LIST_SKIP = 1_000_000;

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

export function parseCrudListWindow(query: Record<string, unknown>) {
  return {
    take: boundedInteger(query.take, DEFAULT_LIST_TAKE, 1, MAX_LIST_TAKE),
    skip: boundedInteger(query.skip, 0, 0, MAX_LIST_SKIP),
  };
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
    const { take, skip } = parseCrudListWindow(req.query as Record<string, unknown>);
    const data = await delegate().findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      skip,
    });
    res.setHeader('X-CG-Page-Take', String(take));
    res.setHeader('X-CG-Page-Skip', String(skip));
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
