/** UTC fiscal event/month invariant. Rules may not be silently selected from
 * another month just because the caller supplies a different issue period. */
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export function assertFiscalEffectivePeriod(period: string, effectiveAt: Date) {
  if (typeof period !== 'string' || !PERIOD.test(period) ||
      !(effectiveAt instanceof Date) || !Number.isFinite(effectiveAt.getTime()) ||
      effectiveAt.toISOString().slice(0, 7) !== period) {
    throw new Error('FISCAL_EVENT_PERIOD_MISMATCH');
  }
  return Object.freeze({ period, effectiveAtUtc: effectiveAt.toISOString() });
}
