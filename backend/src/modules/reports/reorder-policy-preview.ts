/**
 * Stateless, read-only WHAT-IF planning. No policy is persisted or approved.
 * Does not calculate demand, valuation, lot/location balance or lead-time usage.
 */
export const REORDER_POLICY_PREVIEW_VERSION = 'reorder-policy-preview-v1';
const SCALE = 1000n;
const MAX_QUANTITY_UNITS = 10n ** 18n - 1n; // PostgreSQL Decimal(18,3)
type Quantity = string | { toString(): string };

export type PreviewInput = Readonly<{
  stockExact: Quantity;
  reservedExact: Quantity;
  canonicalMinStockExact: Quantity;
  reorderPointExact: Quantity;
  targetStockExact: Quantity;
  safetyStockExact?: Quantity;
  orderMultipleExact?: Quantity;
  leadTimeDays?: string;
}>;

function parseUnits(value: Quantity): bigint {
  const text = typeof value === 'string' ? value : value?.toString();
  if (typeof text !== 'string' || !/^(0|[1-9]\d{0,14})(?:\.\d{1,3})?$/.test(text)) {
    throw new TypeError('REORDER_POLICY_QUANTITY_INVALID');
  }
  const [whole, fraction = ''] = text.split('.');
  const units = BigInt(whole) * SCALE + BigInt(fraction.padEnd(3, '0'));
  if (units > MAX_QUANTITY_UNITS) throw new TypeError('REORDER_POLICY_QUANTITY_INVALID');
  return units;
}

function exact(units: bigint): string {
  if (units < 0n || units > MAX_QUANTITY_UNITS) {
    throw new TypeError('REORDER_POLICY_AMOUNT_OVERFLOW');
  }
  return String(units / SCALE) + '.' + String(units % SCALE).padStart(3, '0');
}

export function previewReorderPolicy(input: PreviewInput) {
  const stock = parseUnits(input.stockExact);
  const reserved = parseUnits(input.reservedExact);
  const canonicalMinimum = parseUnits(input.canonicalMinStockExact);
  const reorderPoint = parseUnits(input.reorderPointExact);
  const target = parseUnits(input.targetStockExact);
  const safety = parseUnits(input.safetyStockExact ?? '0');
  const multiple = parseUnits(input.orderMultipleExact ?? '1');
  const leadTimeRaw = input.leadTimeDays ?? '0';
  if (!/^(0|[1-9]\d{0,2})$/.test(leadTimeRaw) || Number(leadTimeRaw) > 365) {
    throw new TypeError('REORDER_POLICY_LEAD_TIME_INVALID');
  }
  if (reserved > stock) throw new TypeError('REORDER_POLICY_UNRECONCILED_RESERVATIONS');
  if (multiple === 0n || safety > reorderPoint || target <= reorderPoint) {
    throw new TypeError('REORDER_POLICY_INCONSISTENT');
  }
  const available = stock - reserved;
  const triggered = available <= reorderPoint;
  const deficit = triggered ? target - available : 0n;
  const suggested = deficit === 0n ? 0n : ((deficit + multiple - 1n) / multiple) * multiple;
  const suggestedExact = exact(suggested); // fail closed on impossible Decimal(18,3)
  return {
    version: REORDER_POLICY_PREVIEW_VERSION,
    mode: 'WHAT_IF_READ_ONLY',
    policyPersistence: 'NOT_STORED',
    scope: 'PRODUCT_TOTAL_NO_LOCATION_OR_LOT',
    stockExact: exact(stock),
    reservedExact: exact(reserved),
    availableExact: exact(available),
    canonicalMinStockExact: exact(canonicalMinimum),
    assumedPolicy: {
      reorderPointExact: exact(reorderPoint),
      targetStockExact: exact(target),
      safetyStockExact: exact(safety),
      orderMultipleExact: exact(multiple),
      leadTimeDays: Number(leadTimeRaw),
      leadTimeAffectsQuantity: false
    },
    status: triggered ? 'REVIEW_REPLENISHMENT' : 'ABOVE_REORDER_POINT',
    triggered,
    deficitToTargetExact: exact(deficit),
    suggestedReviewQuantityExact: suggestedExact,
    rounding: 'ROUND_UP_TO_ORDER_MULTIPLE',
    requiresManualApproval: true,
    demandForecastAvailable: false,
    locationAllocationVerified: false,
    autoPurchaseEnabled: false
  };
}
