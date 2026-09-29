import type { Prisma } from '@prisma/client';
import { add, compare, serializeDecimal, subtract, ZERO } from '../financial/decimal.js';

export type InventoryStockHealthStatus = 'out_of_stock' | 'below_minimum' | 'at_minimum' | 'healthy';

type InventoryStockInput = {
  id: string;
  sku: string;
  name: string;
  stock: Prisma.Decimal;
  reserved: Prisma.Decimal;
  minStock: Prisma.Decimal;
};

export type InventoryStockHealthRow = {
  productId: string;
  sku: string;
  name: string;
  stockExact: string;
  reservedExact: string;
  availableExact: string;
  minStockExact: string;
  shortfallExact: string;
  status: InventoryStockHealthStatus;
  needsReorder: boolean;
};

export function buildInventoryStockHealth(product: InventoryStockInput): InventoryStockHealthRow {
  const available = subtract(product.stock, product.reserved);
  const minimumGap = subtract(product.minStock, available);
  const shortfall = compare(minimumGap, ZERO) > 0 ? minimumGap : ZERO;
  const minimumConfigured = compare(product.minStock, ZERO) > 0;

  let status: InventoryStockHealthStatus;
  if (compare(available, ZERO) <= 0) status = 'out_of_stock';
  else if (compare(available, product.minStock) < 0) status = 'below_minimum';
  else if (minimumConfigured && compare(available, product.minStock) === 0) status = 'at_minimum';
  else status = 'healthy';

  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    stockExact: serializeDecimal(product.stock, 3),
    reservedExact: serializeDecimal(product.reserved, 3),
    availableExact: serializeDecimal(available, 3),
    minStockExact: serializeDecimal(product.minStock, 3),
    shortfallExact: serializeDecimal(shortfall, 3),
    status,
    needsReorder: minimumConfigured && compare(available, product.minStock) <= 0
  };
}

export function summarizeInventoryStockHealth(rows: InventoryStockHealthRow[]) {
  const counts: Record<InventoryStockHealthStatus, number> = {
    out_of_stock: 0,
    below_minimum: 0,
    at_minimum: 0,
    healthy: 0
  };

  let totalShortfall = ZERO;
  let needsReorder = 0;
  for (const row of rows) {
    counts[row.status] += 1;
    if (row.needsReorder) needsReorder += 1;
    totalShortfall = add(totalShortfall, row.shortfallExact);
  }

  return {
    totalProducts: rows.length,
    needsReorder,
    counts,
    totalShortfallExact: serializeDecimal(totalShortfall, 3)
  };
}
