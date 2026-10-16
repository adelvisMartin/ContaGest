/**
 * #848: bounded, fair waitlist offer SELECTION only; not a capacity reservation.
 * The caller MUST supply tenant-scoped, DB-consistent, server-verified entries
 * and write any offer via session-level transactional CAS with capacity checks.
 */
import type { ResolvedBookingPolicy } from './booking-policy.js';

export type WaitlistEntry = Readonly<{
  id: string;
  tenantId: string;
  locationId: string;
  sessionId: string;
  joinedAtUtc: string;
  version: number;
  status: 'waiting' | 'offered' | 'accepted' | 'cancelled' | 'expired';
  eligibility: 'eligible' | 'ineligible' | 'unknown';
  offerExpiresAtUtc?: string;
}>;
export type WaitlistSelection = Readonly<
  | { action: 'OFFER'; entryId: string; expectedVersion: number; expiresAtUtc: string; tenantPolicyRevision: string; servicePolicyRevision: string | null }
  | { action: 'DISABLED' | 'NO_CAPACITY' | 'NONE_WAITING' | 'RECONCILE_OFFERS' | 'ELIGIBILITY_REQUIRED' }
>;
export class WaitlistSelectionError extends Error {
  readonly code = 'SCHEDULING_WAITLIST_INPUT_INVALID';
  constructor() {
    super('SCHEDULING_WAITLIST_INPUT_INVALID');
    this.name = 'WaitlistSelectionError';
  }
}

export type WaitlistSelectionRequest = Readonly<{
  tenantId: string;
  locationId: string;
  sessionId: string;
  nowUtc: string;
  availableCapacity: number;
  policy: ResolvedBookingPolicy;
  entries: readonly WaitlistEntry[];
}>;

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const CANONICAL_UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const STATUSES = new Set(['waiting', 'offered', 'accepted', 'cancelled', 'expired']);
const ELIGIBILITIES = new Set(['eligible', 'ineligible', 'unknown']);
const KEYS = ['id', 'tenantId', 'locationId', 'sessionId', 'joinedAtUtc', 'version', 'status', 'eligibility', 'offerExpiresAtUtc'];
function invalid(): never { throw new WaitlistSelectionError(); }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !ID.test(value)) invalid();
  return value;
}
function instant(value: unknown): number {
  if (typeof value !== 'string' || !CANONICAL_UTC.test(value)) invalid();
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) invalid();
  return millis;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}

/**
 * If a preceding offered row exists, the DB must reconcile/expire it before
 * another offer is selected. If the FIFO head's eligibility is not verified,
 * never skip it and silently grant a later participant priority.
 * This method DOES NOT confirm eligibility, lock rows, reserve capacity or send.
 */
export function selectWaitlistOffer(request: WaitlistSelectionRequest): WaitlistSelection {
  if (!record(request) || Object.keys(request).some(k => ![
    'tenantId', 'locationId', 'sessionId', 'nowUtc', 'availableCapacity', 'policy', 'entries'
  ].includes(k))) invalid();
  const tenantId = identifier(request.tenantId);
  const locationId = identifier(request.locationId);
  const sessionId = identifier(request.sessionId);
  const now = instant(request.nowUtc);
  const capacity = integer(request.availableCapacity, 0, 100_000);
  const policy = request.policy;
  if (!record(policy) || !record(policy.values) ||
      typeof policy.tenantRevision !== 'string' || !ID.test(policy.tenantRevision) ||
      !(policy.serviceRevision === null || (typeof policy.serviceRevision === 'string' && ID.test(policy.serviceRevision))) ||
      instant(policy.resolvedAtUtc) > now ||
      typeof policy.values.waitlistEnabled !== 'boolean' ||
      !Array.isArray(request.entries) || request.entries.length > 512) invalid();
  const ttl = integer(policy.values.waitlistOfferTtlMinutes, 0, 10_080);
  if ((policy.values.waitlistEnabled && ttl === 0) ||
      (!policy.values.waitlistEnabled && ttl !== 0)) invalid();

  const seen = new Set<string>();
  const normalized = request.entries.map(entry => {
    if (!record(entry) || Object.keys(entry).some(k => !KEYS.includes(k))) invalid();
    const id = identifier(entry.id);
    if (seen.has(id)) invalid();
    seen.add(id);
    if (identifier(entry.tenantId) !== tenantId ||
        identifier(entry.locationId) !== locationId ||
        identifier(entry.sessionId) !== sessionId) invalid();
    if (typeof entry.status !== 'string' || !STATUSES.has(entry.status) ||
        typeof entry.eligibility !== 'string' || !ELIGIBILITIES.has(entry.eligibility)) invalid();
    const joined = instant(entry.joinedAtUtc);
    if (joined > now) invalid();
    const version = integer(entry.version, 1, 2_147_483_647);
    if (entry.status === 'offered') {
      if (entry.offerExpiresAtUtc === undefined || instant(entry.offerExpiresAtUtc) <= joined) invalid();
    } else if (entry.offerExpiresAtUtc !== undefined) {
      invalid(); // A pending offer's expiry must be removed by a persisted status transition.
    }
    return { id, joined, version, status: entry.status, eligibility: entry.eligibility };
  });

  if (!policy.values.waitlistEnabled) return Object.freeze({ action: 'DISABLED' });
  if (capacity === 0) return Object.freeze({ action: 'NO_CAPACITY' });
  // An offered row may already have elapsed according to the wall clock, but
  // cannot be replaced until a transactional expiry reconciler updates it.
  if (normalized.some(e => e.status === 'offered')) return Object.freeze({ action: 'RECONCILE_OFFERS' });
  const waiting = normalized.filter(e => e.status === 'waiting')
    .sort((a, b) => a.joined - b.joined || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (waiting.length === 0) return Object.freeze({ action: 'NONE_WAITING' });
  if (waiting[0].eligibility !== 'eligible') return Object.freeze({ action: 'ELIGIBILITY_REQUIRED' });
  const expiry = now + ttl * 60_000;
  if (!Number.isFinite(expiry) || expiry > 8_640_000_000_000_000) invalid();
  const expiresAtUtc = new Date(expiry).toISOString();
  if (!CANONICAL_UTC.test(expiresAtUtc)) invalid();
  return Object.freeze({
    action: 'OFFER', entryId: waiting[0].id,
    expectedVersion: waiting[0].version,
    expiresAtUtc,
    tenantPolicyRevision: policy.tenantRevision,
    servicePolicyRevision: policy.serviceRevision
  });
}
