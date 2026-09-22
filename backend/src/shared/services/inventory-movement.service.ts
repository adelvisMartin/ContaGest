import { Prisma } from '@prisma/client';
import { HttpError } from '../http.js';
import { compare, subtract } from '../financial/decimal.js';

export async function lockInventoryProduct(tx: Prisma.TransactionClient, tenantId: string, productId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Product"
    WHERE "tenantId"=${tenantId} AND "id"=${productId} AND "active"=true
    FOR UPDATE
  `);
  if (!rows.length) {
    throw new HttpError(404, 'Producto no encontrado para el tenant activo.', { code: 'INVENTORY_PRODUCT_NOT_FOUND' });
  }
  return tx.product.findFirstOrThrow({ where: { id: productId, tenantId, active: true } });
}

export async function applyInventoryStandardEffect(
  tx: Prisma.TransactionClient,
  product: any,
  type: 'in'|'out'|'reservation'|'release',
  amount: Prisma.Decimal
) {
  const available = subtract(product.stock, product.reserved);
  if (type === 'out') {
    if (compare(available, amount) < 0) {
      throw new HttpError(409, 'Stock disponible insuficiente.', { code: 'INVENTORY_INSUFFICIENT_STOCK' });
    }
    return tx.product.update({ where: { id: product.id }, data: { stock: { decrement: amount } } });
  }
  if (type === 'reservation') {
    if (compare(available, amount) < 0) {
      throw new HttpError(409, 'Stock disponible insuficiente para reservar.', { code: 'INVENTORY_INSUFFICIENT_STOCK' });
    }
    return tx.product.update({ where: { id: product.id }, data: { reserved: { increment: amount } } });
  }
  if (type === 'release') {
    if (compare(product.reserved, amount) < 0) {
      throw new HttpError(409, 'La liberación excede la cantidad reservada.', { code: 'INVENTORY_RELEASE_EXCEEDS_RESERVED' });
    }
    return tx.product.update({ where: { id: product.id }, data: { reserved: { decrement: amount } } });
  }
  return tx.product.update({ where: { id: product.id }, data: { stock: { increment: amount } } });
}

export async function lockInventoryLot(
  tx: Prisma.TransactionClient,
  tenantId: string,
  productId: string,
  lotId: string
) {
  const rows = await tx.$queryRaw<Array<{
    id: string; productId: string; lotNumber: string; expiresAt: Date | null; active: boolean;
  }>>(Prisma.sql`
    SELECT "id","productId","lotNumber","expiresAt","active"
    FROM "InventoryLot"
    WHERE "tenantId"=${tenantId}
      AND "productId"=${productId}
      AND "id"=${lotId}
      AND "active"=true
    FOR UPDATE
  `);
  if (!rows.length) {
    throw new HttpError(404, 'Lote de inventario no encontrado para el producto y tenant activos.', { code: 'INVENTORY_LOT_NOT_FOUND' });
  }
  return rows[0];
}

export async function inventoryLotBalance(
  tx: Prisma.TransactionClient,
  tenantId: string,
  lotId: string
): Promise<Prisma.Decimal> {
  const rows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal }>>(Prisma.sql`
    SELECT COALESCE(SUM(
      CASE
        WHEN "type"='in' THEN "quantity"
        WHEN "type"='out' THEN -"quantity"
        WHEN "type"='adjustment' THEN "quantity"
        ELSE 0
      END
    ),0)::numeric(18,3) AS "balance"
    FROM "InventoryMovement"
    WHERE "tenantId"=${tenantId} AND "lotId"=${lotId}
  `);
  return new Prisma.Decimal(rows[0]?.balance || 0);
}
