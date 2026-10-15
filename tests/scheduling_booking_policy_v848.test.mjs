import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveBookingPolicy, decideBookingWindow, decideCancellationWindow,
  slotQueryWithPolicy, BookingPolicyError
} from '../backend/src/modules/scheduling/booking-policy.ts';
import { calculateSlotCandidates } from '../backend/src/modules/scheduling/slot-candidates.ts';

const now = '2026-10-15T12:00:00.000Z';
const values = Object.freeze({ minAdvanceMinutes: 30, maxAdvanceDays: 14,
  cancellationNoticeMinutes: 120, bufferBeforeMinutes: 15, bufferAfterMinutes: 10,
  waitlistEnabled: true, waitlistOfferTtlMinutes: 60 });
const tenant = { revision: 'tenant.4', effectiveFromUtc: '2026-01-01T00:00:00.000Z', values };
const override = (props = {}) => ({ revision: 'service.2', effectiveFromUtc: '2026-10-01T00:00:00.000Z', values: props });
const policy = () => resolveBookingPolicy({ tenant, atUtc: now });
const invalid = (fn, code = 'SCHEDULING_POLICY_INVALID') =>
  assert.throws(fn, e => e instanceof BookingPolicyError && e.code === code);

test('requires an explicit complete tenant policy, not silent business defaults', () => {
  invalid(() => resolveBookingPolicy({ tenant: { ...tenant, values: { minAdvanceMinutes: 1 } }, atUtc: now }));
});
test('tenant-only fallback preserves all seven policy values with provenance', () => {
  const result = policy();
  assert.deepEqual(result.values, values);
  assert.equal(result.serviceRevision, null);
  assert.ok(Object.values(result.sources).every(x => x === 'tenant'));
});
test('service override changes only explicit fields and records both revisions', () => {
  const result = resolveBookingPolicy({ tenant, service: override({ bufferBeforeMinutes: 35, minAdvanceMinutes: 5 }), atUtc: now });
  assert.equal(result.values.bufferBeforeMinutes, 35);
  assert.equal(result.values.bufferAfterMinutes, 10);
  assert.equal(result.sources.bufferBeforeMinutes, 'service');
  assert.equal(result.sources.bufferAfterMinutes, 'tenant');
  assert.equal(result.tenantRevision, 'tenant.4');
  assert.equal(result.serviceRevision, 'service.2');
});
test('snapshots cannot be mutated or retroactively changed by caller', () => {
  const result = policy();
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.values));
  assert.ok(Object.isFrozen(result.sources));
  assert.throws(() => { result.values.minAdvanceMinutes = 0; }, TypeError);
  assert.equal(values.minAdvanceMinutes, 30);
});
test('future-effective tenant or service policy fails closed', () => {
  invalid(() => resolveBookingPolicy({ tenant: { ...tenant, effectiveFromUtc: '2026-11-01T00:00:00.000Z' }, atUtc: now }), 'SCHEDULING_POLICY_NOT_EFFECTIVE');
  invalid(() => resolveBookingPolicy({ tenant, service: { ...override(), effectiveFromUtc: '2026-10-16T00:00:00.000Z' }, atUtc: now }), 'SCHEDULING_POLICY_NOT_EFFECTIVE');
});
test('strict revision/effective timestamp and unexpected fields are rejected', () => {
  invalid(() => resolveBookingPolicy({ tenant: { ...tenant, revision: 'bad/rev' }, atUtc: now }));
  invalid(() => resolveBookingPolicy({ tenant: { ...tenant, hidden: 'secret' }, atUtc: now }));
  invalid(() => resolveBookingPolicy({ tenant: { ...tenant, effectiveFromUtc: '2026-10-01' }, atUtc: now }), 'SCHEDULING_POLICY_INSTANT_INVALID');
  invalid(() => resolveBookingPolicy({ tenant, atUtc: 'invalid' }), 'SCHEDULING_POLICY_INSTANT_INVALID');
});
test('invalid numeric and hidden/undefined service field inputs fail closed', () => {
  for (const x of [-1, 1.5, NaN, Infinity, '10', null, 100_000]) {
    invalid(() => resolveBookingPolicy({ tenant, service: override({ bufferBeforeMinutes: x }), atUtc: now }));
  }
  invalid(() => resolveBookingPolicy({ tenant, service: override({ unknownKey: 5 }), atUtc: now }));
  invalid(() => resolveBookingPolicy({ tenant, service: override({ cancellationNoticeMinutes: undefined }), atUtc: now }));
});
test('cross-field impossible windows and waitlist TTL mismatch are rejected', () => {
  invalid(() => resolveBookingPolicy({ tenant, service: override({ minAdvanceMinutes: 3000, maxAdvanceDays: 1 }), atUtc: now }));
  invalid(() => resolveBookingPolicy({ tenant, service: override({ waitlistEnabled: false }), atUtc: now }));
  invalid(() => resolveBookingPolicy({ tenant, service: override({ waitlistOfferTtlMinutes: 0 }), atUtc: now }));
  assert.equal(resolveBookingPolicy({ tenant, service: override({ waitlistEnabled: false, waitlistOfferTtlMinutes: 0 }), atUtc: now }).values.waitlistEnabled, false);
});
test('booking window includes exact boundaries and rejects too-early/too-late', () => {
  const p = policy();
  assert.deepEqual(decideBookingWindow(p, now, '2026-10-15T12:29:59.999Z'), { allowed: false, reason: 'TOO_EARLY' });
  assert.equal(decideBookingWindow(p, now, '2026-10-15T12:30:00.000Z').allowed, true);
  assert.equal(decideBookingWindow(p, now, '2026-10-29T12:00:00.000Z').allowed, true);
  assert.deepEqual(decideBookingWindow(p, now, '2026-10-29T12:00:00.001Z'), { allowed: false, reason: 'TOO_LATE' });
});
test('cancellation cutoff includes exact boundary and rejects late cancel', () => {
  const p = policy();
  assert.equal(decideCancellationWindow(p, now, '2026-10-15T14:00:00.000Z').allowed, true);
  assert.equal(decideCancellationWindow(p, now, '2026-10-15T13:59:59.999Z').reason, 'CANCELLATION_CUTOFF_PASSED');
});
test('zero cancellation notice permits cancellation at appointment start only', () => {
  const p = resolveBookingPolicy({ tenant, service: override({ cancellationNoticeMinutes: 0 }), atUtc: now });
  assert.equal(decideCancellationWindow(p, now, now).allowed, true);
  assert.equal(decideCancellationWindow(p, now, '2026-10-15T11:59:59.999Z').allowed, false);
});
test('policy buffers flow through to already merged UTC slot calculator', () => {
  const p = policy();
  const input = slotQueryWithPolicy({ policy: p, durationMinutes: 60, stepMinutes: 60, available: [
    { start: '2026-10-15T09:00:00.000Z', end: '2026-10-15T13:00:00.000Z' }] });
  assert.equal(input.bufferBeforeMinutes, 15);
  assert.equal(input.bufferAfterMinutes, 10);
  assert.deepEqual(calculateSlotCandidates(input).slots.map(x => x.start), [
    '2026-10-15T09:15:00.000Z', '2026-10-15T10:15:00.000Z', '2026-10-15T11:15:00.000Z'
  ]);
});
test('booking/cancellation timestamp invalid or naive strings are not coerced', () => {
  const p = policy();
  invalid(() => decideBookingWindow(p, '2026-10-15T12:00:00', now), 'SCHEDULING_POLICY_INSTANT_INVALID');
  invalid(() => decideCancellationWindow(p, now, '2026-02-30T15:00:00.000Z'), 'SCHEDULING_POLICY_INSTANT_INVALID');
});
test('service policy in the future is not silently substituted by tenant', () => {
  invalid(() => resolveBookingPolicy({ tenant, atUtc: now, service: { ...override(), effectiveFromUtc: '2027-01-01T00:00:00.000Z' } }), 'SCHEDULING_POLICY_NOT_EFFECTIVE');
});
