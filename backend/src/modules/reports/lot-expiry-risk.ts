/**
 * Review-only expiry risk: the lot catalog provides dates, NOT allocatable
 * lot stock. Physical balances/location/FEFO belong to #755.
 */
export const LOT_EXPIRY_RISK_VERSION = 'lot-expiry-risk-v1';
export const LOT_EXPIRY_MAX_DAYS = 365;
export type LotExpiryInput = Readonly<{
  id: string;
  lotNumber: string;
  productId: string;
  expiresAt: Date;
  receivedAt: Date;
  product: { sku: string; name: string; unit: string };
}>;

function utcDay(value: Date): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError('EXPIRY_DATE_INVALID');
  }
  return Math.floor(value.getTime() / 86_400_000);
}

export function expiryUtcBounds(asOf: Date, daysAhead: number, includeExpired = false) {
  if (!Number.isSafeInteger(daysAhead) || daysAhead < 0 || daysAhead > LOT_EXPIRY_MAX_DAYS) {
    throw new RangeError('EXPIRY_WINDOW_INVALID');
  }
  const day = utcDay(asOf);
  return {
    // PostgreSQL DATE values are day-granular; use UTC day boundaries.
    today: new Date(day * 86_400_000),
    start: includeExpired ? null : new Date(day * 86_400_000),
    endExclusive: new Date((day + daysAhead + 1) * 86_400_000)
  };
}

export function projectLotExpiryRisk(lots: readonly LotExpiryInput[], asOf: Date, daysAhead: number) {
  const bounds = expiryUtcBounds(asOf, daysAhead, true);
  const day = utcDay(bounds.today);
  return lots.map(lot => {
    if (!lot.id || !lot.productId || !lot.lotNumber || !lot.product?.sku ||
        !lot.product?.name || !lot.product?.unit) throw new TypeError('EXPIRY_LOT_INVALID');
    const delta = utcDay(lot.expiresAt) - day;
    if (delta > daysAhead) throw new RangeError('EXPIRY_OUTSIDE_WINDOW');
    if (utcDay(lot.receivedAt) > day) throw new TypeError('EXPIRY_RECEIPT_IN_FUTURE');
    return {
      productId: lot.productId,
      sku: lot.product.sku,
      productName: lot.product.name,
      unit: lot.product.unit,
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      expiresOn: lot.expiresAt.toISOString().slice(0, 10),
      daysUntilExpiry: delta,
      risk: delta < 0 ? 'expired' : delta === 0 ? 'due_today' : 'near_expiry',
      evidence: 'LOT_CATALOG_DATE_ONLY',
      onHandExact: null,
      allocatableQuantityExact: null,
      allocationAllowed: false,
      requiresManualVerification: true
    };
  });
}
