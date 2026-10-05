import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { decimalSchema } from '../../shared/financial/zod.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { resolveCanonicalPrice } from './pricing.service.js';

const router = Router();
router.use(requireTenant);

const bookSchema = z.object({
  code: z.string().trim().min(1).max(64).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(160),
  currency: z.string().trim().min(3).max(8).transform((value) => value.toUpperCase()),
  priceMode: z.enum(['fixed', 'fx_derived']).default('fixed'),
  priority: z.coerce.number().int().min(-1000000).max(1000000).default(100),
  locationScope: z.enum(['global', 'specific_locations']).default('global'),
  locationIds: z.array(z.string().min(1)).max(100).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.locationScope === 'specific_locations' && value.locationIds.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['locationIds'], message: 'Una lista por sede requiere al menos una BusinessLocation.' });
  }
  if (value.locationScope === 'global' && value.locationIds.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['locationIds'], message: 'Una lista global no admite sedes específicas.' });
  }
});

const bookPatchSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  status: z.enum(['active', 'archived']).optional(),
  priority: z.coerce.number().int().min(-1000000).max(1000000).optional(),
  locationScope: z.enum(['global', 'specific_locations']).optional(),
  locationIds: z.array(z.string().min(1)).max(100).optional(),
}).strict();

const entrySchema = z.object({
  targetType: z.enum(['product', 'service']).default('product'),
  targetId: z.string().min(1),
  amount: decimalSchema('money', { nonnegative: true }),
  effectiveFrom: z.coerce.date().default(() => new Date()),
  effectiveTo: z.coerce.date().nullable().optional(),
  replacesEntryId: z.string().min(1).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.effectiveTo && value.effectiveTo <= value.effectiveFrom) {
    ctx.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'effectiveTo debe ser posterior a effectiveFrom.' });
  }
});

const previewSchema = z.object({
  targetType: z.enum(['product', 'service']).default('product'),
  targetId: z.string().min(1),
  currency: z.string().trim().min(3).max(8).transform((value) => value.toUpperCase()),
  instant: z.coerce.date().optional(),
  businessLocationId: z.string().min(1).nullable().optional(),
  fxRate: decimalSchema('exchangeRate', { positive: true }).optional(),
  fxRateDate: z.coerce.date().optional(),
  fxRateSource: z.string().trim().min(2).max(120).optional(),
}).strict();

const ctx = (req: any) => req.context as { tenantId: string; userId?: string; ip?: string; userAgent?: string };

async function assertLocations(tenantId: string, locationIds: string[]) {
  if (!locationIds.length) return;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM public."BusinessLocation"
    WHERE "tenantId"=${tenantId} AND "status"='active' AND "id" = ANY(${locationIds}::text[])
  `;
  if (rows.length !== new Set(locationIds).size) {
    throw new HttpError(422, 'Una o más sedes no pertenecen al tenant activo o no están disponibles.', { code: 'PRICE_LOCATION_TENANT_MISMATCH' });
  }
}

router.get('/', requirePermission('sales.view'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const rows = await prisma.$queryRaw<any[]>`
    SELECT b.*,
      COALESCE((SELECT jsonb_agg(bl."businessLocationId" ORDER BY bl."businessLocationId") FROM public."PriceBookLocation" bl WHERE bl."priceBookId"=b."id"),'[]'::jsonb) AS "locationIds",
      COALESCE((SELECT count(*)::int FROM public."PriceEntry" e WHERE e."priceBookId"=b."id"),0) AS "entryCount"
    FROM public."PriceBook" b
    WHERE b."tenantId"=${tenantId}
    ORDER BY b."isSystem" DESC,b."priority" DESC,b."code"
  `;
  ok(res, rows);
}));

router.post('/', requirePermission('sales.manage'), validateBody(bookSchema), asyncHandler(async (req, res) => {
  const context = ctx(req);
  const body = req.body as z.infer<typeof bookSchema>;
  await assertLocations(context.tenantId, body.locationIds);
  const id = randomUUID();
  const row = await prisma.$transaction(async (tx) => {
    const books = await tx.$queryRaw<any[]>`
      INSERT INTO public."PriceBook" ("id","tenantId","code","name","currency","priceMode","priority","locationScope","createdBy","updatedBy")
      VALUES (${id},${context.tenantId},${body.code},${body.name},${body.currency},${body.priceMode},${body.priority},${body.locationScope},${context.userId || null},${context.userId || null})
      RETURNING *
    `;
    for (const locationId of body.locationIds) {
      await tx.$executeRaw`INSERT INTO public."PriceBookLocation" ("tenantId","priceBookId","businessLocationId") VALUES (${context.tenantId},${id},${locationId})`;
    }
    return books[0];
  });
  await writeAudit({ tenantId: context.tenantId, userId: context.userId, action: 'pricing.book.create', entity: 'PriceBook', entityId: id, after: row, ipAddress: context.ip, userAgent: context.userAgent });
  ok(res, row, 201);
}));

router.patch('/:id', requirePermission('sales.manage'), validateBody(bookPatchSchema), asyncHandler(async (req, res) => {
  const context = ctx(req);
  const beforeRows = await prisma.$queryRaw<any[]>`SELECT * FROM public."PriceBook" WHERE "id"=${req.params.id} AND "tenantId"=${context.tenantId} LIMIT 1`;
  const before = beforeRows[0];
  if (!before) throw new HttpError(404, 'Lista de precios no encontrada.');
  if (before.isSystem) throw new HttpError(409, 'La lista legacy del sistema se administra desde compatibilidad de Product.price.', { code: 'PRICE_SYSTEM_BOOK_IMMUTABLE' });

  const body = req.body as z.infer<typeof bookPatchSchema>;
  const locationScope = body.locationScope ?? before.locationScope;
  const locationIds = body.locationIds ?? (await prisma.$queryRaw<Array<{ businessLocationId: string }>>`
    SELECT "businessLocationId" FROM public."PriceBookLocation" WHERE "priceBookId"=${before.id}
  `).map((row) => row.businessLocationId);
  if (locationScope === 'specific_locations' && locationIds.length === 0) throw new HttpError(422, 'Una lista por sede requiere al menos una BusinessLocation.');
  if (locationScope === 'global' && locationIds.length > 0) throw new HttpError(422, 'Una lista global no admite sedes específicas.');
  await assertLocations(context.tenantId, locationIds);

  const updated = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<any[]>`
      UPDATE public."PriceBook" SET
        "name"=COALESCE(${body.name ?? null},"name"),
        "status"=COALESCE(${body.status ?? null},"status"),
        "priority"=COALESCE(${body.priority ?? null},"priority"),
        "locationScope"=${locationScope},
        "version"="version"+1,
        "updatedBy"=${context.userId || null},
        "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${before.id} AND "tenantId"=${context.tenantId}
      RETURNING *
    `;
    await tx.$executeRaw`DELETE FROM public."PriceBookLocation" WHERE "priceBookId"=${before.id}`;
    for (const locationId of locationIds) {
      await tx.$executeRaw`INSERT INTO public."PriceBookLocation" ("tenantId","priceBookId","businessLocationId") VALUES (${context.tenantId},${before.id},${locationId})`;
    }
    return rows[0];
  });
  await writeAudit({ tenantId: context.tenantId, userId: context.userId, action: 'pricing.book.update', entity: 'PriceBook', entityId: before.id, before, after: updated, ipAddress: context.ip, userAgent: context.userAgent });
  ok(res, updated);
}));

router.get('/:id/entries', requirePermission('sales.view'), asyncHandler(async (req, res) => {
  const context = ctx(req);
  const rows = await prisma.$queryRaw<any[]>`
    SELECT e.* FROM public."PriceEntry" e JOIN public."PriceBook" b ON b."id"=e."priceBookId"
    WHERE e."priceBookId"=${req.params.id} AND e."tenantId"=${context.tenantId} AND b."tenantId"=${context.tenantId}
    ORDER BY e."targetType",e."targetId",e."effectiveFrom" DESC
  `;
  ok(res, rows);
}));

router.post('/:id/entries', requirePermission('sales.manage'), validateBody(entrySchema), asyncHandler(async (req, res) => {
  const context = ctx(req);
  const body = req.body as z.infer<typeof entrySchema>;
  const books = await prisma.$queryRaw<any[]>`SELECT * FROM public."PriceBook" WHERE "id"=${req.params.id} AND "tenantId"=${context.tenantId} LIMIT 1`;
  const book = books[0];
  if (!book) throw new HttpError(404, 'Lista de precios no encontrada.');
  if (book.isSystem) throw new HttpError(409, 'Las entradas legacy se administran desde Product.price.', { code: 'PRICE_SYSTEM_BOOK_IMMUTABLE' });

  const entryId = randomUUID();
  const row = await prisma.$transaction(async (tx) => {
    let version = 1;
    const versions = await tx.$queryRaw<Array<{ version: number }>>`
      SELECT COALESCE(max("version"),0)::int AS "version" FROM public."PriceEntry"
      WHERE "tenantId"=${context.tenantId} AND "priceBookId"=${book.id} AND "targetType"=${body.targetType} AND "targetId"=${body.targetId}
    `;
    version = Number(versions[0]?.version || 0) + 1;
    if (body.replacesEntryId) {
      const replaced = await tx.$queryRaw<any[]>`
        UPDATE public."PriceEntry" SET "effectiveTo"=${body.effectiveFrom}
        WHERE "id"=${body.replacesEntryId} AND "tenantId"=${context.tenantId} AND "priceBookId"=${book.id}
          AND "effectiveFrom" < ${body.effectiveFrom} AND ("effectiveTo" IS NULL OR "effectiveTo" > ${body.effectiveFrom})
        RETURNING "id"
      `;
      if (!replaced[0]) throw new HttpError(409, 'La entrada reemplazada no existe o no contiene el nuevo límite efectivo.', { code: 'PRICE_REPLACEMENT_INVALID' });
    }
    const rows = await tx.$queryRaw<any[]>`
      INSERT INTO public."PriceEntry" ("id","tenantId","priceBookId","targetType","targetId","amount","effectiveFrom","effectiveTo","status","version","createdBy")
      VALUES (${entryId},${context.tenantId},${book.id},${body.targetType},${body.targetId},${body.amount},${body.effectiveFrom},${body.effectiveTo ?? null},'active',${version},${context.userId || null})
      RETURNING *
    `;
    return rows[0];
  });
  await writeAudit({ tenantId: context.tenantId, userId: context.userId, action: 'pricing.entry.create_version', entity: 'PriceEntry', entityId: entryId, after: row, ipAddress: context.ip, userAgent: context.userAgent });
  ok(res, row, 201);
}));

router.post('/preview/resolve', requirePermission('sales.view'), validateBody(previewSchema), asyncHandler(async (req, res) => {
  const context = ctx(req);
  const body = req.body as z.infer<typeof previewSchema>;
  const resolved = await resolveCanonicalPrice({
    tenantId: context.tenantId,
    targetType: body.targetType,
    targetId: body.targetId,
    documentCurrency: body.currency,
    instant: body.instant,
    businessLocationId: body.businessLocationId,
    fxRate: body.fxRate,
    fxRateDate: body.fxRateDate,
    fxRateSource: body.fxRateSource,
  });
  ok(res, {
    ...resolved,
    amount: resolved.amount.toFixed(2),
    fxRate: resolved.fxRate?.toFixed(4) || null,
  });
}));

export default router;
