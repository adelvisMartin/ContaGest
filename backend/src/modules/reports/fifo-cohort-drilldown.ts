/** Read-only FIFO estimate from reconciled physical movements, NOT lot provenance. */
export const FIFO_COHORT_DRILLDOWN_VERSION = 'fifo-surviving-cohorts-v1';
export const FIFO_COHORT_PAGE_MAX = 100;
export const FIFO_COHORT_SKIP_MAX = 5000;
const DAY_MS = 86_400_000;

export type FifoCohortOptions = Readonly<{ take: number; skip: number }>;
export type RemainingFifoCohort = Readonly<{
  movementId: string;
  receivedAt: number;
  quantity: bigint;
}>;

function field(raw: unknown, fallback: number, min: number, max: number): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !/^(0|[1-9]\d*)$/.test(raw))
    throw new TypeError('FIFO_COHORT_QUERY_INVALID');
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new TypeError('FIFO_COHORT_QUERY_INVALID');
  return n;
}

/** Omitted and explicit false keep the original ageing API response identical. */
export function parseFifoCohortOptions(
  enabled: unknown, rawTake: unknown, rawSkip: unknown
): FifoCohortOptions | null {
  if (enabled === undefined || enabled === 'false') {
    if (rawTake !== undefined || rawSkip !== undefined)
      throw new TypeError('FIFO_COHORT_QUERY_INVALID');
    return null;
  }
  if (enabled !== 'true') throw new TypeError('FIFO_COHORT_QUERY_INVALID');
  return { take: field(rawTake, 25, 1, FIFO_COHORT_PAGE_MAX), skip: field(rawSkip, 0, 0, FIFO_COHORT_SKIP_MAX) };
}

function exact(units: bigint): string {
  if (units < 0n) throw new TypeError('FIFO_COHORT_QUANTITY_INVALID');
  return String(units / 1000n) + '.' + String(units % 1000n).padStart(3, '0');
}

/** Operates ONLY on surviving cohorts AFTER canonical physical ledger reconciliation. */
export function projectFifoCohortDrilldown(input: {
  cohorts: readonly RemainingFifoCohort[];
  asOf: Date;
  onHandUnits: bigint;
  options: FifoCohortOptions;
}) {
  const { cohorts, asOf, onHandUnits, options } = input;
  const now = asOf?.getTime();
  if (!Number.isFinite(now) || typeof onHandUnits !== 'bigint' || onHandUnits < 0n ||
      !options || !Number.isSafeInteger(options.take) || options.take < 1 || options.take > FIFO_COHORT_PAGE_MAX ||
      !Number.isSafeInteger(options.skip) || options.skip < 0 || options.skip > FIFO_COHORT_SKIP_MAX ||
      cohorts.length > FIFO_COHORT_SKIP_MAX) throw new TypeError('FIFO_COHORT_INPUT_INVALID');

  let sum = 0n;
  let previousTime = -Infinity;
  let previousMovementId = '';
  const uniqueIds = new Set<string>();
  for (const c of cohorts) {
    if (!c.movementId || uniqueIds.has(c.movementId) || !Number.isFinite(c.receivedAt) ||
        c.receivedAt > now! || c.receivedAt < previousTime ||
        (c.receivedAt === previousTime && c.movementId <= previousMovementId) ||
        typeof c.quantity !== 'bigint' || c.quantity <= 0n) {
      throw new TypeError('FIFO_COHORT_INVALID');
    }
    previousTime = c.receivedAt;
    previousMovementId = c.movementId;
    uniqueIds.add(c.movementId);
    sum += c.quantity;
  }
  if (sum !== onHandUnits) throw new TypeError('FIFO_COHORT_RECONCILIATION_FAILED');

  const page = cohorts.slice(options.skip, options.skip + options.take);
  const pageUnits = page.reduce((total, c) => total + c.quantity, 0n);
  const hasMore = options.skip + page.length < cohorts.length;
  return {
    version: FIFO_COHORT_DRILLDOWN_VERSION,
    provenance: 'RECONCILED_FIFO_ESTIMATE_NOT_PHYSICAL_LOT_OR_LOCATION',
    scope: 'SURVIVING_INBOUND_MOVEMENTS_AFTER_FIFO_ASSUMPTION',
    consistency: 'REQUEST_SNAPSHOT_ONLY',
    asOf: asOf.toISOString(),
    totalCohorts: cohorts.length,
    totalQuantityExact: exact(sum),
    pageQuantityExact: exact(pageUnits),
    rows: page.map(c => {
      const ageDays = Math.floor((now! - c.receivedAt) / DAY_MS);
      return {
        sourceMovementId: c.movementId,
        estimatedReceivedAt: new Date(c.receivedAt).toISOString(),
        ageDays,
        fixedBucket: ageDays <= 30 ? 'day0to30' : ageDays <= 90 ? 'day31to90' :
          ageDays <= 180 ? 'day91to180' : 'day181Plus',
        remainingQuantityExact: exact(c.quantity),
        physicalLotAllocationVerified: false
      };
    }),
    pagination: {
      take: options.take, skip: options.skip, hasMore,
      nextSkip: hasMore ? options.skip + page.length : null,
      pageScoped: true
    }
  };
}
