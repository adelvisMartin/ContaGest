import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../shared/http.js';
import { requirePermission, requireTenant } from '../shared/middleware/context.js';
import { validateBody } from '../shared/middleware/validate.js';
import { writeAudit } from '../shared/services/audit.service.js';
import {
  CRUD_SEARCH_FIELDS,
  CRUD_ROUTER_AUTHORITY,
  CrudPolicyError,
  assertCrudRouterAuthority,
  assertCrudMutationFields,
  assertCrudOperation,
  parseCrudListWindow,
  parseCrudRouteId,
  parseCrudSearchText
} from './crud-policy.js';
import type { CrudModel, CrudMutation } from './crud-policy.js';
import type { clientSchema, supplierSchema, productSchema, bankAccountSchema, taxPeriodSchema } from './schemas.js';

export { parseCrudListWindow } from './crud-policy.js';

type CrudSchemaByModel = {
  client: typeof clientSchema;
  supplier: typeof supplierSchema;
  product: typeof productSchema;
  bankAccount: typeof bankAccountSchema;
  taxPeriod: typeof taxPeriodSchema;
};

// A model cannot be registered with a different schema, permission or audit
// entity without a compile-time error. Runtime check below protects JS calls.
type CrudOptions = {
  [M in CrudModel]: {
    model: M;
    entity: (typeof CRUD_ROUTER_AUTHORITY)[M]['entity'];
    permission: (typeof CRUD_ROUTER_AUTHORITY)[M]['permission'];
    schema: CrudSchemaByModel[M];
  }
}[CrudModel];

type CrudRecord = { id: string; [field: string]: unknown };
type CrudDelegate = {
  findMany(input: Record<string, unknown>): Promise<CrudRecord[]>;
  findFirst(input: Record<string, unknown>): Promise<CrudRecord | null>;
  create(input: { data: Record<string, unknown> }): Promise<CrudRecord>;
  update(input: { where: { id: string; tenantId: string }; data: Record<string, unknown> }): Promise<CrudRecord>;
  delete(input: { where: { id: string; tenantId: string } }): Promise<CrudRecord>;
};

type CrudContext = {
  tenantId: string;
  userId?: string;
  ip?: string;
  userAgent?: string | string[];
};

type CrudRequest = Request & { context?: Partial<CrudContext> };

// Only these five explicit tenant-owned models may use the generic adapter.
// The cast bridges Prisma's differing delegate method overloads, not user input.
const CRUD_DELEGATES = {
  client: () => prisma.client,
  supplier: () => prisma.supplier,
  product: () => prisma.product,
  bankAccount: () => prisma.bankAccount,
  taxPeriod: () => prisma.taxPeriod
} satisfies Record<CrudModel, unknown>;

function readCrudContext(req: Request): CrudContext {
  const context = (req as CrudRequest).context;
  if (!context?.tenantId) throw new HttpError(401, 'Falta una sesión válida con tenant firmado.');
  return { tenantId: context.tenantId, userId: context.userId, ip: context.ip, userAgent: context.userAgent };
}

function asHttpPolicyError(error: unknown): Error {
  if (error instanceof CrudPolicyError) return new HttpError(error.status, error.message);
  return error instanceof Error ? error : new HttpError(422, 'Datos inválidos.');
}

function mutationGate(model: CrudModel, operation: CrudMutation) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (operation === 'delete') assertCrudOperation(model, operation);
      else assertCrudMutationFields(model, operation, req.body);
      next();
    } catch (error) {
      next(asHttpPolicyError(error));
    }
  };
}

function auditContext(ctx: CrudContext) {
  return {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    ipAddress: ctx.ip,
    userAgent: typeof ctx.userAgent === 'string' ? ctx.userAgent : undefined
  };
}

export function createCrudRouter(options: CrudOptions) {
  assertCrudRouterAuthority(options.model, options.entity, options.permission);
  const router = Router();
  const getDelegate = CRUD_DELEGATES[options.model];
  if (typeof getDelegate !== 'function') throw new Error('CRUD model is not in the explicit tenant-owned allowlist');
  // Fail at registration, not after an attacker controls a query or payload.
  const searchFields = CRUD_SEARCH_FIELDS[options.model];
  for (const field of searchFields) {
    if (!Object.prototype.hasOwnProperty.call(options.schema.shape, field)) {
      throw new Error(`CRUD search field ${field} is not allowed by the ${options.model} schema`);
    }
  }

  router.use(requireTenant, requirePermission(options.permission));

  router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const ctx = readCrudContext(req);
    const delegate = getDelegate() as unknown as CrudDelegate;
    let take: number;
    let skip: number;
    let q: string;
    try {
      ({ take, skip } = parseCrudListWindow(req.query as Record<string, unknown>));
      q = parseCrudSearchText(req.query as Record<string, unknown>);
    } catch (error) {
      throw asHttpPolicyError(error);
    }
    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (q) {
      where.OR = searchFields.map((field) => ({ [field]: { contains: q, mode: 'insensitive' } }));
    }
    const data = await delegate.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      skip
    });
    res.setHeader('X-CG-Page-Take', String(take));
    res.setHeader('X-CG-Page-Skip', String(skip));
    ok(res, data);
  }));

  router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const ctx = readCrudContext(req);
    const delegate = getDelegate() as unknown as CrudDelegate;
    const data = await delegate.findFirst({ where: { id: parseCrudRouteId(req.params.id), tenantId: ctx.tenantId } });
    if (!data) throw new HttpError(404, `${options.entity} no encontrado`);
    ok(res, data);
  }));

  router.post('/', mutationGate(options.model, 'create'), validateBody(options.schema.strict()), asyncHandler(async (req: Request, res: Response) => {
    const ctx = readCrudContext(req);
    const delegate = getDelegate() as unknown as CrudDelegate;
    const data = await delegate.create({ data: { ...req.body, tenantId: ctx.tenantId } });
    await writeAudit({ ...auditContext(ctx), action: 'create', entity: options.entity, entityId: data.id, after: data });
    ok(res, data);
  }));

  router.put('/:id', mutationGate(options.model, 'update'), validateBody(options.schema.partial().strict()), asyncHandler(async (req: Request, res: Response) => {
    const ctx = readCrudContext(req);
    const delegate = getDelegate() as unknown as CrudDelegate;
    const where = { id: parseCrudRouteId(req.params.id), tenantId: ctx.tenantId };
    const before = await delegate.findFirst({ where });
    if (!before) throw new HttpError(404, `${options.entity} no encontrado`);
    // Guard the mutation itself against a tenant change between read and write.
    const data = await delegate.update({ where, data: req.body });
    await writeAudit({ ...auditContext(ctx), action: 'update', entity: options.entity, entityId: data.id, before, after: data });
    ok(res, data);
  }));

  router.delete('/:id', mutationGate(options.model, 'delete'), asyncHandler(async (req: Request, res: Response) => {
    const ctx = readCrudContext(req);
    const delegate = getDelegate() as unknown as CrudDelegate;
    const where = { id: parseCrudRouteId(req.params.id), tenantId: ctx.tenantId };
    const before = await delegate.findFirst({ where });
    if (!before) throw new HttpError(404, `${options.entity} no encontrado`);
    const data = await delegate.delete({ where });
    await writeAudit({ ...auditContext(ctx), action: 'delete', entity: options.entity, entityId: data.id, before });
    ok(res, data);
  }));

  return router;
}
