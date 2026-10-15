/**
 * Read-only stock coverage proxy from *reconciled physical outbound* movements.
 * Never presents observed physical dispatch as customer demand or a purchase order.
 * Caller must reconcile Product.stock to the full inventory movement history.
 */
export const STOCK_COVERAGE_VERSION = 'physical-outbound-coverage-v1';

type ExactQuantity = string | { toString(): string };
const SCALE = 1000n;

function units(input: ExactQuantity): bigint {
  const text = input.toString();
  if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(text)) throw new TypeError('COVERAGE_QUANTITY_INVALID');
  const [integer, fraction = ''] = text.split('.');
  return BigInt(integer) * SCALE + BigInt(fraction.padEnd(3, '0'));
}
function format(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  return String(value / scale) + '.' + String(value % scale).padStart(decimals, '0');
}
function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n || numerator < 0n) throw new TypeError('COVERAGE_RATIO_INVALID');
  return (numerator * 2n + denominator) / (2n * denominator);
}

export function calculateObservedStockCoverage(input: {
  stockExact: ExactQuantity;
  reservedExact: ExactQuantity;
  outboundQuantityWindowExact: ExactQuantity;
  windowDays: number;
  reconciled: true;
}) {
  if (input.reconciled !== true || !Number.isSafeInteger(input.windowDays) ||
      input.windowDays < 1 || input.windowDays > 3650)
    throw new TypeError('COVERAGE_CONTEXT_INVALID');

  const stock = units(input.stockExact);
  const reserved = units(input.reservedExact);
  const outbound = units(input.outboundQuantityWindowExact);
  if (reserved > stock) throw new TypeError('COVERAGE_RESERVES_EXCEED_STOCK');
  const available = stock - reserved;
  const hasObservedOutbound = outbound > 0n;
  // thousandths per day expressed at 6 decimal places. The ratio is
  // explicitly an estimated physical-outbound rate, NOT a sales forecast.
  const dailyMicroUnits = hasObservedOutbound
    ? roundRatio(outbound * 1000n, BigInt(input.windowDays)) : 0n;
  // Hundredths of a day (half-up) computed without JS floating point.
  const coverageCentidays = hasObservedOutbound
    ? roundRatio(available * BigInt(input.windowDays) * 100n, outbound) : null;

  return {
    version: STOCK_COVERAGE_VERSION,
    authority: 'Product.stock-reserved+InventoryMovement.type=out',
    interpretation: 'OBSERVED_PHYSICAL_OUTBOUND_PROXY_NOT_SALES_DEMAND',
    sampleDays: input.windowDays,
    stockExact: format(stock, 3),
    reservedExact: format(reserved, 3),
    availableExact: format(available, 3),
    outboundQuantityWindowExact: format(outbound, 3),
    dailyPhysicalOutboundExact: format(dailyMicroUnits, 6),
    coverageDaysExact: coverageCentidays === null ? null : format(coverageCentidays, 2),
    status: available === 0n ? 'NO_AVAILABLE_STOCK'
      : hasObservedOutbound ? 'COVERAGE_ESTIMATE' : 'NO_PHYSICAL_OUTBOUND_SAMPLE',
    hasDemandForecast: false,
    createsPurchaseOrder: false,
    reconciled: true
  };
}
