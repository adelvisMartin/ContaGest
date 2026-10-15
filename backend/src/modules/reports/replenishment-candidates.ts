type ReorderStatus = 'out_of_stock' | 'below_minimum' | 'at_minimum' | 'healthy';

export type ReorderStockRow = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  stockExact: string;
  reservedExact: string;
  availableExact: string;
  minStockExact: string;
  shortfallExact: string;
  status: ReorderStatus;
  needsReorder: boolean;
};

const priority: Readonly<Record<ReorderStatus, number>> = {
  out_of_stock: 0,
  below_minimum: 1,
  at_minimum: 2,
  healthy: 3
};

/**
 * Advisory candidates derived ONLY from canonical inventory stock-health rows.
 * Never mutates balances, reserves inventory or creates purchase requests.
 */
export function deriveReorderCandidates(rows: readonly ReorderStockRow[]) {
  return rows.filter(row => row.needsReorder && row.status !== 'healthy')
    .map(row => {
      if (!/^\d+(?:\.\d{1,3})?$/.test(row.shortfallExact) ||
          !/^[-]?\d+(?:\.\d{1,3})?$/.test(row.availableExact) ||
          !/^\d+(?:\.\d{1,3})?$/.test(row.minStockExact)) {
        throw new TypeError('REORDER_NONCANONICAL_QUANTITY');
      }
      if (!row.productId || !row.sku || !row.unit || !row.name) {
        throw new TypeError('REORDER_INVALID_PRODUCT');
      }
      return {
        productId: row.productId,
        sku: row.sku,
        name: row.name,
        unit: row.unit,
        status: row.status,
        availableExact: row.availableExact,
        reservedExact: row.reservedExact,
        minStockExact: row.minStockExact,
        // A zero shortfall at the threshold means "review policy",
        // NOT a purchasing instruction for zero items.
        minShortfallExact: row.shortfallExact,
        action: row.status === 'at_minimum' ? 'REVIEW_REORDER_POINT' : 'REVIEW_REPLENISHMENT',
        manualApprovalRequired: true as const,
        autoPurchaseEnabled: false as const
      };
    })
    .sort((a,b) => priority[a.status]-priority[b.status] ||
      a.sku.localeCompare(b.sku) || a.productId.localeCompare(b.productId));
}
