/**
 * #848: Deterministic, read-only UTC slot candidates. This is NOT a booking writer.
 * Callers first resolve location wall-clock time to UTC, then validate tenant
 * ownership, resource requirements and authorization outside this pure module.
 */
export type UtcInterval = Readonly<{ start: string; end: string }>;
export type SlotCandidateQuery = Readonly<{
  available: readonly UtcInterval[];
  blocked?: readonly UtcInterval[];
  durationMinutes: number;
  stepMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  limit?: number;
}>;
export type SlotCandidateResult = Readonly<{
  slots: readonly UtcInterval[];
  truncated: boolean;
  scanned: number;
}>;
export type SlotCandidateErrorCode =
  | 'SCHEDULING_SLOT_QUERY_INVALID'
  | 'SCHEDULING_SLOT_INTERVAL_INVALID'
  | 'SCHEDULING_SLOT_SCAN_LIMIT';

export class SlotCandidateError extends Error {
  readonly code: SlotCandidateErrorCode;
  constructor(code: SlotCandidateErrorCode) {
    super(code);
    this.name = 'SlotCandidateError';
    this.code = code;
  }
}

const MINUTE = 60_000;
const MAX_SPAN = 7 * 24 * 60 * MINUTE;
const MAX_RANGES = 64;
const MAX_SCANS = 20_000;
const STRICT_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new SlotCandidateError('SCHEDULING_SLOT_QUERY_INVALID');
  }
  return value;
}

function instant(value: unknown): number {
  if (typeof value !== 'string' || !STRICT_UTC.test(value)) {
    throw new SlotCandidateError('SCHEDULING_SLOT_INTERVAL_INVALID');
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    throw new SlotCandidateError('SCHEDULING_SLOT_INTERVAL_INVALID');
  }
  return epoch;
}

function parseRanges(value: unknown): readonly Readonly<{ start: number; end: number }>[] {
  if (!Array.isArray(value) || value.length > MAX_RANGES) {
    throw new SlotCandidateError('SCHEDULING_SLOT_QUERY_INVALID');
  }
  return value.map(interval => {
    if (!interval || typeof interval !== 'object' || Array.isArray(interval)) {
      throw new SlotCandidateError('SCHEDULING_SLOT_INTERVAL_INVALID');
    }
    const start = instant(interval.start);
    const end = instant(interval.end);
    if (end <= start || end - start > MAX_SPAN) {
      throw new SlotCandidateError('SCHEDULING_SLOT_INTERVAL_INVALID');
    }
    return { start, end };
  });
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  // Half-open [start,end): adjacent reservations are not conflicting.
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Availability windows are explicit UTC intervals. A candidate including its
 * buffers must fit within one window and not overlap a blocked interval.
 * Returns bounded, deduplicated, chronologically ordered candidate slots.
 * A returned slot is a suggestion only: DB writes must recheck atomically.
 */
export function calculateSlotCandidates(query: SlotCandidateQuery): SlotCandidateResult {
  if (!query || typeof query !== 'object') {
    throw new SlotCandidateError('SCHEDULING_SLOT_QUERY_INVALID');
  }
  const duration = integer(query.durationMinutes, 1, 1440) * MINUTE;
  const step = integer(query.stepMinutes, 1, 1440) * MINUTE;
  const before = integer(query.bufferBeforeMinutes ?? 0, 0, 1440) * MINUTE;
  const after = integer(query.bufferAfterMinutes ?? 0, 0, 1440) * MINUTE;
  const limit = integer(query.limit ?? 128, 1, 256);
  const available = parseRanges(query.available);
  const blocked = parseRanges(query.blocked ?? []);
  const results = new Set<number>();
  let scanned = 0;

  for (const window of available) {
    const first = window.start + before;
    const last = window.end - duration - after;
    for (let start = first; start <= last; start += step) {
      if (++scanned > MAX_SCANS) throw new SlotCandidateError('SCHEDULING_SLOT_SCAN_LIMIT');
      const end = start + duration;
      if (!blocked.some(range => overlaps(start - before, end + after, range.start, range.end))) {
        results.add(start);
      }
    }
  }
  const sorted = [...results].sort((a, b) => a - b);
  const slots = sorted.slice(0, limit).map(start => ({
    start: new Date(start).toISOString(),
    end: new Date(start + duration).toISOString()
  }));
  return { slots, truncated: sorted.length > limit, scanned };
}
