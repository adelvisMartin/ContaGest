/**
 * #848: Convert one local wall-clock time into an actual UTC instant.
 * This is a read/validation primitive, not a booking/capacity authority.
 */
export type WallClockDisambiguation = 'reject' | 'earlier' | 'later';
export type WallClockErrorCode =
  | 'SCHEDULING_LOCAL_DATETIME_INVALID'
  | 'SCHEDULING_TIMEZONE_INVALID'
  | 'SCHEDULING_DISAMBIGUATION_INVALID'
  | 'SCHEDULING_LOCAL_TIME_NONEXISTENT'
  | 'SCHEDULING_LOCAL_TIME_AMBIGUOUS';

export class WallClockError extends Error {
  readonly code: WallClockErrorCode;
  constructor(code: WallClockErrorCode) {
    super(code);
    this.code = code;
    this.name = 'WallClockError';
  }
}

export interface ResolvedWallClock {
  timezone: string;
  localDateTime: string;
  utcInstant: string;
  /** True only when caller explicitly chose one of multiple UTC instants. */
  disambiguated: boolean;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const SIX_HOURS = 6 * 60 * 60 * 1000;
const THIRTY_SIX_HOURS = 36 * 60 * 60 * 1000;

function utcFields(year: number, month: number, day: number, hour: number, minute: number, second: number) {
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function parseLocal(value: unknown): { canonical: string; asUtc: number } {
  if (typeof value !== 'string') throw new WallClockError('SCHEDULING_LOCAL_DATETIME_INVALID');
  const match = LOCAL.exec(value);
  if (!match) throw new WallClockError('SCHEDULING_LOCAL_DATETIME_INVALID');
  const [, y, mo, d, h, mi, s] = match;
  const [year, month, day, hour, minute, second] = [y, mo, d, h, mi, s ?? '00'].map(Number);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    throw new WallClockError('SCHEDULING_LOCAL_DATETIME_INVALID');
  }
  const asUtc = utcFields(year, month, day, hour, minute, second);
  const date = new Date(asUtc);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new WallClockError('SCHEDULING_LOCAL_DATETIME_INVALID');
  }
  return { asUtc, canonical: [y, '-', mo, '-', d, 'T', h, ':', mi, ':', s ?? '00'].join('') };
}

function formatter(timezone: unknown): Intl.DateTimeFormat {
  if (typeof timezone !== 'string' || !timezone.trim() || timezone.length > 100) {
    throw new WallClockError('SCHEDULING_TIMEZONE_INVALID');
  }
  try {
    return new Intl.DateTimeFormat('en-GB-u-nu-latn', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
  } catch {
    throw new WallClockError('SCHEDULING_TIMEZONE_INVALID');
  }
}

function displayAsUtc(format: Intl.DateTimeFormat, epoch: number): number {
  const parts = format.formatToParts(new Date(epoch));
  const fields = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  return utcFields(fields.year, fields.month, fields.day, fields.hour, fields.minute, fields.second);
}

/**
 * Resolves DST gaps/overlaps without relying on the process timezone or UTC + 24h arithmetic.
 * Samples all nearby timezone offsets; each resulting candidate is round-tripped back to
 * the exact local components. Intervals must be validated again by the eventual DB writer.
 */
export function resolveLocalWallClock(input: {
  timezone: unknown;
  localDateTime: unknown;
  disambiguation?: unknown;
}): ResolvedWallClock {
  const { asUtc, canonical } = parseLocal(input.localDateTime);
  const format = formatter(input.timezone);
  const choice = input.disambiguation ?? 'reject';
  if (choice !== 'reject' && choice !== 'earlier' && choice !== 'later') {
    throw new WallClockError('SCHEDULING_DISAMBIGUATION_INVALID');
  }
  const offsets = new Set<number>();
  for (let t = asUtc - THIRTY_SIX_HOURS; t <= asUtc + THIRTY_SIX_HOURS; t += SIX_HOURS) {
    offsets.add(displayAsUtc(format, t) - t);
  }
  const matching = [...new Set([...offsets].map(offset => asUtc - offset))]
    .filter(epoch => Number.isFinite(epoch) && displayAsUtc(format, epoch) === asUtc)
    .sort((a, b) => a - b);
  if (!matching.length) throw new WallClockError('SCHEDULING_LOCAL_TIME_NONEXISTENT');
  if (matching.length > 1 && choice === 'reject') throw new WallClockError('SCHEDULING_LOCAL_TIME_AMBIGUOUS');
  const epoch = choice === 'later' ? matching.at(-1)! : matching[0];
  return {
    timezone: input.timezone as string,
    localDateTime: canonical,
    utcInstant: new Date(epoch).toISOString(),
    disambiguated: matching.length > 1
  };
}
