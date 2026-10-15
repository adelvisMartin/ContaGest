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

type ExceptionReason = 'NEGATIVE_STOCK' | 'NEGATIVE_RESERVED' | 'RESERVED_EXCEEDS_STOCK' | 'NEGATIVE_MINIMUM';

export type ReorderStockException = {
  productId: string;
  sku: string;
  reason: ExceptionReason;
  stockExact: string;
  reservedExact: string;
  availableExact: string;
  manualReconciliationRequired: true;
  autoPurchaseEnabled: false;
};

const priority: Readonly<Record<ReorderStatus, number>> = {
  out_of_stock: 0,
  below_minimum: 1,
  at_minimum: 2,
  healthy: 3
};

function exactUnits(text: string, signed: boolean): bigint {
  const re = signed ? /^-?(0|[1-9]\d{0,14})(?:\.\d{1,3})?$/ : /^(0|[1-9]\d{0,14})(?:\.\d{1,3})?$/;
  if (typeof text !== 'string' || !re.test(text)) throw new TypeError('REORDER_NONCANONICAL_QUANTITY');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const units = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return negative ? -units : units;
}

/**
 * Do not present inconsistent canonical balances as ordinary purchase candidates.
 * Report them separately for manual reconciliation. No ledger mutation occurs.
 */
export function inspectReorderStockRows(rows: readonly ReorderStockRow[]) {
  const eligibleRows: ReorderStockRow[] = [];
  const stockExceptions: ReorderStockException[] = [];
  for (const row of rows) {
    if (!row.productId || !row.sku || !row.name || !row.unit) {
      throw new TypeError('REORDER_INVALID_PRODUCT');
    }
    const stock = exactUnits(row.stockExact, true);
    const reserved = exactUnits(row.reservedExact, true);
    const available = exactUnits(row.availableExact, true);
    const minimum = exactUnits(row.minStockExact, true);
    const shortfall = exactUnits(row.shortfallExact, false);
    if (stock - reserved !== available) {
      throw new TypeError('REORDER_AVAILABLE_MISMATCH');
    }
    const reason: ExceptionReason | null = stock < 0n ? 'NEGATIVE_STOCK'
      : reserved < 0n ? 'NEGATIVE_RESERVED'
      : reserved > stock ? 'RESERVED_EXCEEDS_STOCK'
      : minimum < 0n ? 'NEGATIVE_MINIMUM' : null;
    if (reason) {
      stockExceptions.push({
        productId: row.productId, sku: row.sku, reason,
        stockExact: row.stockExact, reservedExact: row.reservedExact,
        availableExact: row.availableExact,
        manualReconciliationRequired: true, autoPurchaseEnabled: false
      });
    } else {
      // Only canonical, internally coherent stock health rows can be offered
      // for purchasing review. Balances alone do not prove that the derived
      // threshold, shortfall, status and reorder flag were calculated correctly.
      const gap = minimum > available ? minimum - available : 0n;
      if (shortfall !== gap) throw new TypeError('REORDER_SHORTFALL_MISMATCH');
      const expectedStatus: ReorderStatus = available <= 0n ? 'out_of_stock'
        : available < minimum ? 'below_minimum'
        : minimum > 0n && available === minimum ? 'at_minimum' : 'healthy';
      if (row.status !== expectedStatus) throw new TypeError('REORDER_STATUS_MISMATCH');
      const expectedReorder = minimum > 0n && available <= minimum;
      if (row.needsReorder !== expectedReorder) throw new TypeError('REORDER_FLAG_MISMATCH');
      eligibleRows.push(row);
    }
  }
  return { eligibleRows, stockExceptions };
}

/**
 * Advisory candidates derived ONLY from canonical inventory stock-health rows.
 * Inconsistent stock or reservations require reconciliation, never replenishment.
 */
export function deriveReorderCandidates(rows: readonly ReorderStockRow[]) {
  return inspectReorderStockRows(rows).eligibleRows
    .filter(row => row.needsReorder && row.status !== 'healthy')
    .map(row => ({
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      status: row.status,
      availableExact: row.availableExact,
      reservedExact: row.reservedExact,
      minStockExact: row.minStockExact,
      minShortfallExact: row.shortfallExact,
      action: row.status === 'at_minimum' ? 'REVIEW_REORDER_POINT' : 'REVIEW_REPLENISHMENT',
      manualApprovalRequired: true as const,
      autoPurchaseEnabled: false as const
    }))
    .sort((a,b) => priority[a.status]-priority[b.status] ||
      a.sku.localeCompare(b.sku) || a.productId.localeCompare(b.productId));
}


/**
 * Prepare one bounded catalog page from canonical stock health rows BEFORE
 * any optional invoice query. All balance validation is atomic from the
 * caller's point of view: no candidate ids escape on a malformed page.
 * Caller must read products and sales in one tenant-scoped DB snapshot.
 */
export function prepareReorderStockPage(rows: readonly ReorderStockRow[]) {
  const stockReview = inspectReorderStockRows(rows);
  const reorderCandidates = deriveReorderCandidates(stockReview.eligibleRows);
  return {
    rows,
    stockReview,
    reorderCandidates,
    salesCandidateIds: reorderCandidates.map(candidate => candidate.productId)
  };
}
