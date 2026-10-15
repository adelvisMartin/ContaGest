/**
 * #848: immutable, version-evidenced scheduling policy resolved from trusted tenant/service config.
 * Only UTC rolling windows are evaluated here; business-local calendar semantics live in location authority.
 * No reservation, payment, entitlement, or DB write takes place in this module.
 */
import type { SlotCandidateQuery, UtcInterval } from './slot-candidates.js';

export type BookingPolicyValues = Readonly<{
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  cancellationNoticeMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  waitlistEnabled: boolean;
  waitlistOfferTtlMinutes: number;
}>;
export type BookingPolicyKey = keyof BookingPolicyValues;
export type VersionedPolicy = Readonly<{
  revision: string;
  effectiveFromUtc: string;
  values: Partial<BookingPolicyValues>;
}>;
export type ResolvedBookingPolicy = Readonly<{
  values: BookingPolicyValues;
  sources: Readonly<Record<BookingPolicyKey, 'tenant' | 'service'>>;
  tenantRevision: string;
  serviceRevision: string | null;
  resolvedAtUtc: string;
}>;
export type PolicyDecision = Readonly<{
  allowed: boolean;
  reason: 'ALLOWED' | 'TOO_EARLY' | 'TOO_LATE' | 'CANCELLATION_CUTOFF_PASSED';
}>;
export class BookingPolicyError extends Error {
  readonly code: 'SCHEDULING_POLICY_INVALID' | 'SCHEDULING_POLICY_NOT_EFFECTIVE' | 'SCHEDULING_POLICY_INSTANT_INVALID';
  constructor(code: 'SCHEDULING_POLICY_INVALID' | 'SCHEDULING_POLICY_NOT_EFFECTIVE' | 'SCHEDULING_POLICY_INSTANT_INVALID') {
    super(code);
    this.code = code;
    this.name = 'BookingPolicyError';
  }
}

const POLICY_KEYS: readonly BookingPolicyKey[] = [
  'minAdvanceMinutes', 'maxAdvanceDays', 'cancellationNoticeMinutes',
  'bufferBeforeMinutes', 'bufferAfterMinutes', 'waitlistEnabled', 'waitlistOfferTtlMinutes'
];
const POLICY_SET: ReadonlySet<string> = new Set(POLICY_KEYS);
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REVISION = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const BOUNDS: Record<Exclude<BookingPolicyKey, 'waitlistEnabled'>, readonly [number, number]> = {
  minAdvanceMinutes: [0, 43_200], maxAdvanceDays: [1, 365],
  cancellationNoticeMinutes: [0, 43_200], bufferBeforeMinutes: [0, 1_440],
  bufferAfterMinutes: [0, 1_440], waitlistOfferTtlMinutes: [0, 10_080]
};

function invalid(): never { throw new BookingPolicyError('SCHEDULING_POLICY_INVALID'); }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function instant(value: unknown): number {
  if (typeof value !== 'string' || !ISO_UTC.test(value)) {
    throw new BookingPolicyError('SCHEDULING_POLICY_INSTANT_INVALID');
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    throw new BookingPolicyError('SCHEDULING_POLICY_INSTANT_INVALID');
  }
  return epoch;
}
function validateVersion(input: unknown, asOf: number, complete: boolean): VersionedPolicy {
  if (!record(input) || Object.keys(input).some(k => !['revision', 'effectiveFromUtc', 'values'].includes(k)) ||
      typeof input.revision !== 'string' || !REVISION.test(input.revision) || !record(input.values)) invalid();
  const effective = instant(input.effectiveFromUtc);
  if (effective > asOf) throw new BookingPolicyError('SCHEDULING_POLICY_NOT_EFFECTIVE');
  const values = input.values;
  if (Object.keys(values).some(k => !POLICY_SET.has(k)) || (complete && POLICY_KEYS.some(k => !Object.hasOwn(values, k)))) invalid();
  for (const key of POLICY_KEYS) {
    if (!Object.hasOwn(values, key)) continue;
    const value = values[key];
    if (key === 'waitlistEnabled') {
      if (typeof value !== 'boolean') invalid();
    } else {
      const [min, max] = BOUNDS[key];
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid();
    }
  }
  return input as VersionedPolicy;
}

/** Resolve only *effective* policies. No implicit business defaults or mutation of input. */
export function resolveBookingPolicy(input: {
  tenant: VersionedPolicy;
  service?: VersionedPolicy;
  atUtc: string;
}): ResolvedBookingPolicy {
  if (!record(input) || Object.keys(input).some(k => !['tenant', 'service', 'atUtc'].includes(k))) invalid();
  const asOf = instant(input.atUtc);
  const tenant = validateVersion(input.tenant, asOf, true);
  const service = input.service === undefined ? undefined : validateVersion(input.service, asOf, false);
  const values = {} as Record<BookingPolicyKey, number | boolean>;
  const sources = {} as Record<BookingPolicyKey, 'tenant' | 'service'>;
  for (const key of POLICY_KEYS) {
    const hasOverride = service !== undefined && Object.hasOwn(service.values, key);
    values[key] = (hasOverride ? service!.values[key] : tenant.values[key]) as number | boolean;
    sources[key] = hasOverride ? 'service' : 'tenant';
  }
  const effective = values as BookingPolicyValues;
  if (effective.minAdvanceMinutes > effective.maxAdvanceDays * 1_440 ||
      (effective.waitlistEnabled ? effective.waitlistOfferTtlMinutes < 1 : effective.waitlistOfferTtlMinutes !== 0)) invalid();
  return Object.freeze({
    values: Object.freeze(effective), sources: Object.freeze(sources),
    tenantRevision: tenant.revision, serviceRevision: service?.revision ?? null,
    resolvedAtUtc: input.atUtc
  });
}

/** Advance ranges are rolling UTC durations, NOT local civil calendar days. */
export function decideBookingWindow(policy: ResolvedBookingPolicy, nowUtc: string, startsAtUtc: string): PolicyDecision {
  const now = instant(nowUtc), start = instant(startsAtUtc);
  const earliest = now + policy.values.minAdvanceMinutes * MINUTE;
  const latest = now + policy.values.maxAdvanceDays * DAY;
  if (start < earliest) return { allowed: false, reason: 'TOO_EARLY' };
  if (start > latest) return { allowed: false, reason: 'TOO_LATE' };
  return { allowed: true, reason: 'ALLOWED' };
}

/** This is eligibility only; refunds/no-show consequences belong to owners outside scheduling. */
export function decideCancellationWindow(policy: ResolvedBookingPolicy, nowUtc: string, startsAtUtc: string): PolicyDecision {
  const now = instant(nowUtc), start = instant(startsAtUtc);
  if (now > start - policy.values.cancellationNoticeMinutes * MINUTE) {
    return { allowed: false, reason: 'CANCELLATION_CUTOFF_PASSED' };
  }
  return { allowed: true, reason: 'ALLOWED' };
}

/** Bridge to existing #848 slot engine; results are advisory until a DB booking transaction commits. */
export function slotQueryWithPolicy(input: {
  policy: ResolvedBookingPolicy;
  available: readonly UtcInterval[];
  blocked?: readonly UtcInterval[];
  durationMinutes: number;
  stepMinutes: number;
  limit?: number;
}): SlotCandidateQuery {
  return {
    available: input.available, blocked: input.blocked,
    durationMinutes: input.durationMinutes, stepMinutes: input.stepMinutes, limit: input.limit,
    bufferBeforeMinutes: input.policy.values.bufferBeforeMinutes,
    bufferAfterMinutes: input.policy.values.bufferAfterMinutes
  };
}
