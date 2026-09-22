import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { HttpError, asyncHandler, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { add, compare, quantity, serializeDecimal, serializeLegacyNumber, subtract, ZERO } from '../../shared/financial/decimal.js';
import { decimalSchema } from '../../shared/financial/zod.js';
import { runFinancialIdempotentMutation } from '../../shared/services/financial-idempotency.service.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import {
  applyInventoryStandardEffect as applyStandardEffect,
  inventoryLotBalance,
  lockInventoryLot,
  lockInventoryProduct as lockProduct
} from '../../shared/services/inventory-movement.service.js';

const router = Router();
router.use(requireTenant, requirePermission('inventory.manage'));

const movementSchema = z.object({
  productId: z.string().uuid(),
  type: z.enum(['in', 'out', 'reservation', 'release']),
  quantity: decimalSchema('quantity', { positive: true }),
  unitCost: decimalSchema('money', { nonnegative: true }).optional(),
  source: z.string().trim().min(2).max(80).optional(),
  sourceId: z.string().trim().max(120).optional(),
  reasonCode: z.string().trim().min(2).max(64).optional(),
  note: z.string().trim().max(500).optional()
}).strict();

const adjustmentSchema = z.object({
  productId: z.string().uuid(),
  targetStock: decimalSchema('quantity', { nonnegative: true }),
  reasonCode: z.string().trim().min(2).max(64),
  note: z.string().trim().min(5).max(500)
}).strict();

const reversalSchema = z.object({
  reasonCode: z.string().trim().min(2).max(64).default('REVERSAL'),
  reason: z.string().trim().min(5).max(500)
}).strict();

const context = (req: any) => req.context as { tenantId: string; userId?: string; ip?: string; userAgent?: string };
const requestId = (req: any) => String(req.requestId || '') || null;
const idempotencyKey = (req: any) => req.header('Idempotency-Key') || null;

const serializeProduct = (product: any) => ({
  ...product,
  stock: serializeLegacyNumber(product.stock),
  stockExact: serializeDecimal(product.stock, 3),
  reserved: serializeLegacyNumber(product.reserved),
  reservedExact: serializeDecimal(product.reserved, 3),
  available: serializeLegacyNumber(subtract(product.stock, product.reserved)),
  availableExact: serializeDecimal(subtract(product.stock, product.reserved), 3)
});

const serializeMovement = (movement: any) => ({
  ...movement,
  quantity: serializeLegacyNumber(movement.quantity),
  quantityExact: serializeDecimal(movement.quantity, 3),
  unitCost: movement.unitCost === null || movement.unitCost === undefined ? null : serializeLegacyNumber(movement.unitCost),
  unitCostExact: movement.unitCost === null || movement.unitCost === undefined ? null : serializeDecimal(movement.unitCost, 2)
});

async function insertAuditLink(tx: Prisma.TransactionClient, input: {
  tenantId: string; productId: string; originalMovementId?: string | null; relatedMovementId: string;
  kind: 'opening' | 'adjustment' | 'reversal'; reasonCode: string; reason: string; createdBy?: string;
}) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "InventoryMovementAuditLink"
      ("id","tenantId","productId","originalMovementId","relatedMovementId","kind","reasonCode","reason","createdBy")
    VALUES
      (${randomUUID()},${input.tenantId},${input.productId},${input.originalMovementId || null},${input.relatedMovementId},${input.kind},${input.reasonCode},${input.reason},${input.createdBy || null})
  `);
}

async function replayMovement(tx: Prisma.TransactionClient, tenantId: string, resourceId: string | null) {
  if (!resourceId) throw new HttpError(409, 'El resultado idempotente no tiene movimiento asociado.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE' });
  const movement = await tx.inventoryMovement.findFirst({ where: { id: resourceId, tenantId }, include: { product: true } });
  if (!movement) throw new HttpError(409, 'El movimiento original ya no puede reconstruirse.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE' });
  return { movement: serializeMovement(movement), product: serializeProduct(movement.product) };
}

router.get('/movements', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const productId = String(req.query.productId || '');
  const take = Math.min(Math.max(Number(req.query.take || 250), 1), 1000);
  if (productId) {
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId: ctx.tenantId } });
    if (!product) throw new HttpError(404, 'Producto no encontrado.', { code: 'INVENTORY_PRODUCT_NOT_FOUND' });
  }
  const rows = await prisma.inventoryMovement.findMany({
    where: { tenantId: ctx.tenantId, ...(productId ? { productId } : {}) },
    include: { product: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take
  });
  const ids = rows.map((row) => row.id);
  const links = ids.length ? await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT "originalMovementId","relatedMovementId","kind","reasonCode","reason","createdBy","createdAt"
    FROM "InventoryMovementAuditLink"
    WHERE "tenantId"=${ctx.tenantId} AND ("originalMovementId" IN (${Prisma.join(ids)}) OR "relatedMovementId" IN (${Prisma.join(ids)}))
  `) : [];
  const byRelated = new Map(links.map((link) => [link.relatedMovementId, link]));
  const reversed = new Map(links.filter((link) => link.kind === 'reversal' && link.originalMovementId).map((link) => [link.originalMovementId, link.relatedMovementId]));
  ok(res, rows.map((row) => ({ ...serializeMovement(row), lifecycle: byRelated.get(row.id)?.kind || 'normal', reasonCode: byRelated.get(row.id)?.reasonCode || null, reason: byRelated.get(row.id)?.reason || row.note || null, reversalOfId: byRelated.get(row.id)?.originalMovementId || null, reversedById: reversed.get(row.id) || null })));
}));

router.post('/movements', validateBody(movementSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const input = req.body as z.infer<typeof movementSchema>;
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId, scope: 'inventory.movements.create', key: idempotencyKey(req),
    request: { ...input, quantity: serializeDecimal(input.quantity, 3), unitCost: input.unitCost ? serializeDecimal(input.unitCost, 2) : null }, requestId: requestId(req),
    replay: (tx, record) => replayMovement(tx, ctx.tenantId, record.resourceId)
  }, async (tx) => {
    const product = await lockProduct(tx, ctx.tenantId, input.productId);
    const updated = await applyStandardEffect(tx, product, input.type, input.quantity);
    const movement = await tx.inventoryMovement.create({ data: {
      tenantId: ctx.tenantId, productId: product.id, type: input.type, quantity: input.quantity,
      unitCost: input.unitCost ?? null, source: input.source || null, sourceId: input.sourceId || null, note: input.note || null
    }});
    if (String(input.source || '').toLowerCase() === 'opening') {
      const prior = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "InventoryMovementAuditLink" WHERE "tenantId"=${ctx.tenantId} AND "productId"=${product.id} AND "kind"='opening' LIMIT 1`);
      if (prior.length) throw new HttpError(409, 'El producto ya tiene saldo de apertura registrado.', { code: 'INVENTORY_OPENING_ALREADY_EXISTS' });
      await insertAuditLink(tx, { tenantId: ctx.tenantId, productId: product.id, relatedMovementId: movement.id, kind: 'opening', reasonCode: input.reasonCode || 'OPENING', reason: input.note || 'Saldo inicial de inventario.', createdBy: ctx.userId });
    }
    return { data: { movement: serializeMovement(movement), product: serializeProduct(updated) }, resourceType: 'InventoryMovement', resourceId: movement.id };
  });
  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  if (!execution.replayed) await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: `inventory.${input.type}`, entity: 'InventoryMovement', entityId: (execution.data as any).movement.id, after: execution.data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, execution.data, execution.responseCode);
}));

router.post('/adjustments', requirePermission('inventory.adjust'), validateBody(adjustmentSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const input = req.body as z.infer<typeof adjustmentSchema>;
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId, scope: 'inventory.adjustments.create', key: idempotencyKey(req),
    request: { ...input, targetStock: serializeDecimal(input.targetStock, 3) }, requestId: requestId(req),
    replay: (tx, record) => replayMovement(tx, ctx.tenantId, record.resourceId)
  }, async (tx) => {
    const product = await lockProduct(tx, ctx.tenantId, input.productId);
    if (compare(input.targetStock, product.reserved) < 0) throw new HttpError(409, 'El stock ajustado no puede quedar por debajo de las reservas.', { code: 'INVENTORY_ADJUSTMENT_BELOW_RESERVED' });
    const delta = subtract(input.targetStock, product.stock);
    if (compare(delta, ZERO) === 0) throw new HttpError(409, 'El ajuste no cambia el stock actual.', { code: 'INVENTORY_ADJUSTMENT_NO_CHANGE' });
    const movement = await tx.inventoryMovement.create({ data: { tenantId: ctx.tenantId, productId: product.id, type: 'adjustment', quantity: delta, source: 'manual-adjustment', note: input.note } });
    const updated = await tx.product.update({ where: { id: product.id }, data: { stock: input.targetStock } });
    await insertAuditLink(tx, { tenantId: ctx.tenantId, productId: product.id, relatedMovementId: movement.id, kind: 'adjustment', reasonCode: input.reasonCode, reason: input.note, createdBy: ctx.userId });
    return { data: { movement: serializeMovement(movement), product: serializeProduct(updated) }, resourceType: 'InventoryMovement', resourceId: movement.id };
  });
  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  if (!execution.replayed) await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'inventory.adjustment', entity: 'InventoryMovement', entityId: (execution.data as any).movement.id, after: { ...execution.data, reasonCode: input.reasonCode, reason: input.note }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, execution.data, execution.responseCode);
}));

router.post('/movements/:id/reverse', requirePermission('inventory.adjust'), validateBody(reversalSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const input = req.body as z.infer<typeof reversalSchema>;
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId, scope: 'inventory.movements.reverse', key: idempotencyKey(req), request: { movementId: req.params.id, ...input }, requestId: requestId(req),
    replay: (tx, record) => replayMovement(tx, ctx.tenantId, record.resourceId)
  }, async (tx) => {
    const original = await tx.inventoryMovement.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId } });
    if (!original) throw new HttpError(404, 'Movimiento de inventario no encontrado.', { code: 'INVENTORY_MOVEMENT_NOT_FOUND' });
    const sourceLink = await tx.$queryRaw<Array<{ kind: string }>>(Prisma.sql`SELECT "kind" FROM "InventoryMovementAuditLink" WHERE "tenantId"=${ctx.tenantId} AND "relatedMovementId"=${original.id} LIMIT 1`);
    if (sourceLink[0]?.kind === 'reversal') throw new HttpError(409, 'No se permite reversar un reverso; crea un ajuste explícito.', { code: 'INVENTORY_REVERSAL_OF_REVERSAL' });
    const prior = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "InventoryMovementAuditLink" WHERE "tenantId"=${ctx.tenantId} AND "originalMovementId"=${original.id} AND "kind"='reversal' LIMIT 1`);
    if (prior.length) throw new HttpError(409, 'El movimiento ya fue reversado.', { code: 'INVENTORY_ALREADY_REVERSED' });
    const product = await lockProduct(tx, ctx.tenantId, original.productId);
    let type: 'in'|'out'|'reservation'|'release'|'adjustment';
    let reversalQuantity = quantity(original.quantity).abs();
    if (original.type === 'in') type = 'out';
    else if (original.type === 'out') type = 'in';
    else if (original.type === 'reservation') type = 'release';
    else if (original.type === 'release') type = 'reservation';
    else { type = 'adjustment'; reversalQuantity = quantity(original.quantity).negated(); }
    if (original.lotId) {
      const lot=await lockInventoryLot(tx,ctx.tenantId,product.id,original.lotId);
      const lotBalance=await inventoryLotBalance(tx,ctx.tenantId,lot.id);
      if(type==='out'&&compare(lotBalance,reversalQuantity)<0){
        throw new HttpError(409,'El reverso dejaría el lote con saldo negativo.',{code:'INVENTORY_LOT_REVERSAL_INVALID_BALANCE'});
      }
      if(type==='adjustment'&&compare(add(lotBalance,reversalQuantity),ZERO)<0){
        throw new HttpError(409,'El reverso dejaría el lote con saldo negativo.',{code:'INVENTORY_LOT_REVERSAL_INVALID_BALANCE'});
      }
    }
    let updated: any;
    if (type === 'adjustment') {
      const nextStock = add(product.stock, reversalQuantity);
      if (compare(nextStock, ZERO) < 0 || compare(nextStock, product.reserved) < 0) throw new HttpError(409, 'El reverso dejaría un saldo de inventario inválido.', { code: 'INVENTORY_REVERSAL_INVALID_BALANCE' });
      updated = await tx.product.update({ where: { id: product.id }, data: { stock: nextStock } });
    } else updated = await applyStandardEffect(tx, product, type, reversalQuantity);
    const reversal = await tx.inventoryMovement.create({ data: { tenantId: ctx.tenantId, productId: product.id, lotId: original.lotId || null, type, quantity: reversalQuantity, unitCost: original.unitCost, source: 'reversal', sourceId: original.id, note: input.reason } });
    await insertAuditLink(tx, { tenantId: ctx.tenantId, productId: product.id, originalMovementId: original.id, relatedMovementId: reversal.id, kind: 'reversal', reasonCode: input.reasonCode, reason: input.reason, createdBy: ctx.userId });
    return { data: { movement: serializeMovement(reversal), product: serializeProduct(updated), originalMovementId: original.id }, resourceType: 'InventoryMovement', resourceId: reversal.id };
  });
  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  if (!execution.replayed) await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'inventory.reversal', entity: 'InventoryMovement', entityId: (execution.data as any).movement.id, after: { ...execution.data, reasonCode: input.reasonCode, reason: input.reason }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, execution.data, execution.responseCode);
}));

router.get('/integrity', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const productId = String(req.query.productId || '');
  const products = await prisma.product.findMany({ where: { tenantId: ctx.tenantId, ...(productId ? { id: productId } : {}) }, orderBy: { sku: 'asc' } });
  if (productId && !products.length) throw new HttpError(404, 'Producto no encontrado.', { code: 'INVENTORY_PRODUCT_NOT_FOUND' });
  const ids = products.map((product) => product.id);
  const movements = ids.length ? await prisma.inventoryMovement.findMany({ where: { tenantId: ctx.tenantId, productId: { in: ids } }, orderBy: { createdAt: 'asc' } }) : [];
  const openings = ids.length ? await prisma.$queryRaw<Array<{ productId: string }>>(Prisma.sql`SELECT DISTINCT "productId" FROM "InventoryMovementAuditLink" WHERE "tenantId"=${ctx.tenantId} AND "kind"='opening' AND "productId" IN (${Prisma.join(ids)})`) : [];
  const openingSet = new Set(openings.map((row) => row.productId));
  const projected = new Map<string, { stock: Prisma.Decimal; reserved: Prisma.Decimal; count: number }>();
  for (const movement of movements) {
    const item = projected.get(movement.productId) || { stock: quantity(0), reserved: quantity(0), count: 0 };
    const amount = quantity(movement.quantity);
    if (movement.type === 'in') item.stock = add(item.stock, amount);
    else if (movement.type === 'out') item.stock = subtract(item.stock, amount);
    else if (movement.type === 'adjustment') item.stock = add(item.stock, amount);
    else if (movement.type === 'reservation') item.reserved = add(item.reserved, amount);
    else if (movement.type === 'release') item.reserved = subtract(item.reserved, amount);
    item.count += 1; projected.set(movement.productId, item);
  }
  const data = products.map((product) => {
    const item = projected.get(product.id) || { stock: quantity(0), reserved: quantity(0), count: 0 };
    const stockDiff = subtract(product.stock, item.stock); const reservedDiff = subtract(product.reserved, item.reserved);
    const exact = compare(stockDiff, ZERO) === 0 && compare(reservedDiff, ZERO) === 0;
    const legacy = !exact && !openingSet.has(product.id);
    const integrity = exact ? 'ok' : legacy ? 'legacy-baseline-required' : 'mismatch';
    if (integrity === 'mismatch') console.warn('inventory.integrity_mismatch', { tenantId: ctx.tenantId, productId: product.id });
    return { productId: product.id, sku: product.sku, integrity, movementCount: item.count, materialized: { stockExact: serializeDecimal(product.stock, 3), reservedExact: serializeDecimal(product.reserved, 3) }, projected: { stockExact: serializeDecimal(item.stock, 3), reservedExact: serializeDecimal(item.reserved, 3) }, difference: { stockExact: serializeDecimal(stockDiff, 3), reservedExact: serializeDecimal(reservedDiff, 3) } };
  });
  ok(res, data);
}));

export default router;