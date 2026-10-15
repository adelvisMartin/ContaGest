/**
 * Read-only, FIFO-assumed cohort ageing over complete physical movement history.
 * This is NOT actual lot allocation or a financial inventory-valuation model.
 */
type DecimalText = string | { toString(): string };
export type AgeingMovement = Readonly<{
  id: string;
  type: 'in' | 'out' | 'adjustment' | 'reservation' | 'release';
  quantity: DecimalText;
  createdAt: Date;
}>;

type Cohort = { receivedAt: number; movementId: string; quantity: bigint };
const SCALE = 1000n;
const DAY_MS = 86_400_000;
export const STOCK_AGEING_MAX_MOVEMENTS = 5000;
export const STOCK_AGEING_VERSION = 'stock-ageing-fifo-estimate-v1';

export class StockAgeingError extends Error {
  readonly code: 'AGEING_INVALID' | 'AGEING_INCOMPLETE_HISTORY' | 'AGEING_LEDGER_MISMATCH';
  constructor(code: 'AGEING_INVALID' | 'AGEING_INCOMPLETE_HISTORY' | 'AGEING_LEDGER_MISMATCH', message: string) {
    super(message);
    this.code = code;
    this.name = 'StockAgeingError';
  }
}

function decimalUnits(source: DecimalText, allowNegative: boolean): bigint {
  const value = source.toString();
  const pattern = allowNegative ? /^-?\d{1,15}(?:\.\d{1,3})?$/ : /^\d{1,15}(?:\.\d{1,3})?$/;
  if (!pattern.test(value)) throw new StockAgeingError('AGEING_INVALID', 'Invalid precision or sign in movement quantity.');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const units = BigInt(whole) * SCALE + BigInt(fraction.padEnd(3, '0'));
  return negative ? -units : units;
}

function formatted(units: bigint): string {
  const neg = units < 0n;
  const positive = neg ? -units : units;
  return (neg ? '-' : '') + String(positive / SCALE) + '.' + String(positive % SCALE).padStart(3, '0');
}

export function calculateStockAgeing(input: {
  movements: readonly AgeingMovement[];
  stockExact: DecimalText;
  asOf: Date;
}) {
  const snapshot = input.asOf.getTime();
  if (!Number.isFinite(snapshot) || input.movements.length > STOCK_AGEING_MAX_MOVEMENTS) {
    throw new StockAgeingError('AGEING_INVALID', 'Snapshot timestamp or movement count invalid.');
  }
  const onHand = decimalUnits(input.stockExact, false);
  const cohorts: Cohort[] = [];
  let physicalLedger = 0n;
  let latestTime = -Infinity;
  let latestId = '';
  for (const movement of input.movements) {
    if (!movement.id || !(movement.createdAt instanceof Date)) {
      throw new StockAgeingError('AGEING_INVALID', 'Movement identity or timestamp invalid.');
    }
    const time = movement.createdAt.getTime();
    if (!Number.isFinite(time) || time > snapshot || time < latestTime || (time === latestTime && movement.id <= latestId)) {
      throw new StockAgeingError('AGEING_INVALID', 'Movement clock/order invalid or after snapshot.');
    }
    latestTime = time;
    latestId = movement.id;
    const quantity = decimalUnits(movement.quantity, movement.type === 'adjustment');
    if (quantity === 0n) throw new StockAgeingError('AGEING_INVALID', 'Zero-value movement not supported.');
    if (movement.type === 'reservation' || movement.type === 'release') continue;
    let effect: bigint;
    if (movement.type === 'in') effect = quantity;
    else if (movement.type === 'out') effect = -quantity;
    else if (movement.type === 'adjustment') effect = quantity;
    else throw new StockAgeingError('AGEING_INVALID', 'Unsupported movement type.');
    physicalLedger += effect;
    if (effect > 0n) {
      cohorts.push({ receivedAt: time, movementId: movement.id, quantity: effect });
      continue;
    }
    let remaining = -effect;
    for (const cohort of cohorts) {
      if (remaining === 0n) break;
      if (cohort.quantity === 0n) continue;
      const allocated = remaining < cohort.quantity ? remaining : cohort.quantity;
      cohort.quantity -= allocated;
      remaining -= allocated;
    }
    if (remaining !== 0n) {
      throw new StockAgeingError('AGEING_INCOMPLETE_HISTORY', 'An outgoing movement predates available inbound history.');
    }
  }
  const reconstructed = cohorts.reduce((sum, cohort) => sum + cohort.quantity, 0n);
  if (reconstructed !== onHand || physicalLedger !== onHand) {
    throw new StockAgeingError('AGEING_LEDGER_MISMATCH', 'Movement-derived stock does not match canonical Product.stock.');
  }
  const buckets = [0n, 0n, 0n, 0n];
  const activeCohorts = cohorts.filter(c => c.quantity > 0n);
  for (const cohort of activeCohorts) {
    const days = Math.floor((snapshot - cohort.receivedAt) / DAY_MS);
    const bucket = days <= 30 ? 0 : days <= 90 ? 1 : days <= 180 ? 2 : 3;
    buckets[bucket] += cohort.quantity;
  }
  return {
    version: STOCK_AGEING_VERSION,
    interpretation: 'FIFO_ASSUMPTION_NOT_PHYSICAL_LOT_PROVENANCE',
    currentOnly: true,
    reconciled: true,
    asOf: input.asOf.toISOString(),
    stockExact: formatted(onHand),
    movementCount: input.movements.length,
    activeCohortCount: activeCohorts.length,
    buckets: {
      day0to30Exact: formatted(buckets[0]),
      day31to90Exact: formatted(buckets[1]),
      day91to180Exact: formatted(buckets[2]),
      day181PlusExact: formatted(buckets[3])
    }
  };
}
