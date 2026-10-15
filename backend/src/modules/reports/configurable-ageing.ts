/** Age bands for FIFO-estimated stock only; never physical lot provenance. */
export type AgeCutoffs = readonly [number, number, number];
export type AgeingCohort = Readonly<{ receivedAt: number; quantity: bigint }>;
export const AGEING_BUCKET_MAX_DAYS = 3650;

export function parseAgeingCutoffs(raw: unknown): AgeCutoffs | null {
  if (raw === undefined) return null;
  if (typeof raw !== 'string' || !/^[1-9]\d{0,3},[1-9]\d{0,3},[1-9]\d{0,3}$/.test(raw))
    throw new TypeError('AGEING_BUCKET_QUERY_INVALID');
  const [a,b,c] = raw.split(',').map(Number);
  if (!(0 < a && a < b && b < c && c <= AGEING_BUCKET_MAX_DAYS))
    throw new TypeError('AGEING_BUCKET_QUERY_INVALID');
  return [a,b,c];
}

function amount(units: bigint): string {
  if (units < 0n) throw new TypeError('AGEING_BUCKET_NEGATIVE_QUANTITY');
  return String(units / 1000n) + '.' + String(units % 1000n).padStart(3, '0');
}

export function projectConfigurableAgeBuckets(
  cohorts: readonly AgeingCohort[], asOf: Date, cutoffs: AgeCutoffs
) {
  const [a,b,c] = cutoffs;
  if (![a,b,c].every(Number.isSafeInteger) || !(0 < a && a < b && b < c && c <= AGEING_BUCKET_MAX_DAYS))
    throw new TypeError('AGEING_BUCKET_QUERY_INVALID');
  const snapshot = asOf.getTime();
  if (!Number.isFinite(snapshot)) throw new TypeError('AGEING_BUCKET_CLOCK_INVALID');
  const sums = [0n,0n,0n,0n];
  for (const cohort of cohorts) {
    if (!Number.isFinite(cohort.receivedAt) || cohort.receivedAt > snapshot)
      throw new TypeError('AGEING_BUCKET_CLOCK_INVALID');
    if (cohort.quantity < 0n) throw new TypeError('AGEING_BUCKET_NEGATIVE_QUANTITY');
    const days = Math.floor((snapshot - cohort.receivedAt) / 86_400_000);
    const index = days <= a ? 0 : days <= b ? 1 : days <= c ? 2 : 3;
    sums[index] += cohort.quantity;
  }
  const ranges = [
    {fromDay:0,toDay:a,quantityExact:amount(sums[0])},
    {fromDay:a+1,toDay:b,quantityExact:amount(sums[1])},
    {fromDay:b+1,toDay:c,quantityExact:amount(sums[2])},
    {fromDay:c+1,toDay:null,quantityExact:amount(sums[3])}
  ];
  return { cutoffsDays:[a,b,c], ranges, source:'RECONCILED_FIFO_ESTIMATE_NOT_LOT_ALLOCATION' };
}
