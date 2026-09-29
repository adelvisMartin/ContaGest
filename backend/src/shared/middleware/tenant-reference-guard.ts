import type { NextFunction, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../http.js';

export type TenantReferenceDb = Pick<Prisma.TransactionClient, 'client' | 'supplier' | 'product' | 'taxPeriod'>;

type TenantMutationBody = {
  clientId?: unknown;
  supplierId?: unknown;
  periodId?: unknown;
  productId?: unknown;
  lines?: Array<{ productId?: unknown }>;
};

const asId = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const unique = (values: Array<string | null>) => [...new Set(values.filter((value): value is string => Boolean(value)))];

function crossTenantReference(fields: string[]) {
  return new HttpError(409, 'Una o más referencias no están disponibles para el tenant autenticado.', {
    code: 'CROSS_TENANT_REFERENCE',
    fields,
  });
}

async function assertProducts(db: TenantReferenceDb, tenantId: string, productIds: string[]) {
  if (!productIds.length) return;
  const rows = await db.product.findMany({
    where: { tenantId, id: { in: productIds } },
    select: { id: true },
  });
  const found = new Set(rows.map((row) => row.id));
  if (productIds.some((id) => !found.has(id))) throw crossTenantReference(['productId']);
}

export async function validateTenantMutationReferences(
  db: TenantReferenceDb,
  tenantId: string,
  routePath: string,
  rawBody: unknown,
) {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as TenantMutationBody;
  const path = String(routePath || '').toLowerCase();

  if (path.startsWith('/sales')) {
    const clientId = asId(body.clientId);
    if (clientId) {
      const client = await db.client.findFirst({ where: { id: clientId, tenantId }, select: { id: true } });
      if (!client) throw crossTenantReference(['clientId']);
    }
    await assertProducts(db, tenantId, unique((body.lines || []).map((line) => asId(line?.productId))));
    return;
  }

  if (path.startsWith('/purchases')) {
    const supplierId = asId(body.supplierId);
    if (supplierId) {
      const supplier = await db.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true } });
      if (!supplier) throw crossTenantReference(['supplierId']);
    }
    await assertProducts(db, tenantId, unique((body.lines || []).map((line) => asId(line?.productId))));
    return;
  }

  if (path.startsWith('/tax') || path.startsWith('/fiscal')) {
    const periodId = asId(body.periodId);
    if (periodId) {
      const taxPeriod = await db.taxPeriod.findFirst({ where: { id: periodId, tenantId }, select: { id: true } });
      if (!taxPeriod) throw crossTenantReference(['periodId']);
    }
  }
}

export async function tenantReferenceGuard(req: Request, _res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  const ctx = (req as Request & { context?: { tenantId?: string } }).context;
  if (!ctx?.tenantId) return next();
  try {
    await validateTenantMutationReferences(prisma, ctx.tenantId, req.path, req.body);
    next();
  } catch (error) {
    next(error);
  }
}
