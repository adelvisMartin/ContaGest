import assert from 'node:assert/strict';
import test from 'node:test';
import { planExclusiveSegments, ResourceSegmentError } from '../backend/src/modules/scheduling/resource-segments.ts';

const day = '2026-10-15T';
const utc = hm => `${day}${hm}:00.000Z`;
const step = (stepId, offsetMinutes, durationMinutes, resourceIds, more = {}) => ({
  stepId, offsetMinutes, durationMinutes, resourceIds, ...more
});
const basic = () => ({ startsAtUtc: utc('09:00'), steps: [
  step('intake', 0, 30, ['room-1', 'employee-1']),
  step('procedure', 30, 60, ['room-1', 'employee-2'])
] });
const expectInvalid = input => assert.throws(() => planExclusiveSegments(input),
  e => e instanceof ResourceSegmentError && e.code === 'SCHEDULING_SEGMENTS_INVALID');

test('multi-stage sequential booking produces correct UTC segments and no writes', () => {
  const result = planExclusiveSegments(basic());
  assert.equal(result.ok, true);
  assert.deepEqual(result.segments.map(x => x.startsAtUtc), [utc('09:00'), utc('09:30')]);
  assert.deepEqual(result.segments.map(x => x.endsAtUtc), [utc('09:30'), utc('10:30')]);
});
test('different resources can be booked for parallel stages', () => {
  const result = planExclusiveSegments({ startsAtUtc: utc('09:00'), steps: [
    step('a', 0, 60, ['room-A']), step('b', 0, 60, ['room-B'])
  ] });
  assert.equal(result.ok, true);
});
test('same-resource overlapping stages fail as one atomic preview', () => {
  const result = planExclusiveSegments({ startsAtUtc: utc('09:00'), steps: [
    step('a', 0, 60, ['room-A']), step('b', 30, 45, ['room-A'])
  ] });
  assert.deepEqual(result, { ok: false, conflict: { stepId: 'b', reason: 'INTRA_BOOKING_RESOURCE_CONFLICT' }, segments: [] });
});
test('touching half-open boundaries permit sequential reuse of same resource', () => {
  assert.equal(planExclusiveSegments(basic()).ok, true);
});
test('external preexisting occupied allocation blocks only intersecting resource', () => {
  const input = basic();
  assert.deepEqual(planExclusiveSegments({ ...input, existing: [
    { resourceId: 'room-1', startsAtUtc: utc('09:20'), endsAtUtc: utc('09:40') }
  ] }), { ok: false, conflict: { stepId: 'intake', reason: 'EXISTING_RESOURCE_CONFLICT' }, segments: [] });
  assert.equal(planExclusiveSegments({ ...input, existing: [
    { resourceId: 'room-9', startsAtUtc: utc('09:20'), endsAtUtc: utc('09:40') }
  ] }).ok, true);
});
test('existing booking ending exactly at new start does not conflict', () => {
  assert.equal(planExclusiveSegments({ ...basic(), existing: [
    { resourceId: 'room-1', startsAtUtc: utc('08:00'), endsAtUtc: utc('09:00') }
  ] }).ok, true);
});
test('buffers expand occupied interval rather than customer-visible duration', () => {
  const input = { startsAtUtc: utc('09:00'), steps: [
    step('a', 0, 60, ['room-1'], { bufferAfterMinutes: 15 }),
    step('b', 60, 30, ['room-1'])
  ] };
  assert.equal(planExclusiveSegments(input).ok, false);
  assert.equal(planExclusiveSegments({ ...input, steps: [input.steps[0], step('b', 75, 30, ['room-1'])] }).ok, true);
});
test('buffer before catches overlapping previous booking', () => {
  const plan = planExclusiveSegments({ startsAtUtc: utc('09:00'), steps: [
    step('a', 0, 30, ['room-1'], { bufferBeforeMinutes: 15 })
  ], existing: [{ resourceId: 'room-1', startsAtUtc: utc('08:50'), endsAtUtc: utc('08:55') }] });
  assert.equal(plan.ok, false);
});
test('all input steps are validated before conflict evaluation', () => {
  expectInvalid({ startsAtUtc: utc('09:00'), steps: [step('a', 0, 60, ['r']), step('b', 0, 0, ['r'])] });
});
test('invalid external allocations fail closed even if no resource is selected', () => {
  expectInvalid({ ...basic(), existing: [{ resourceId: 'unrelated', startsAtUtc: utc('11:00'), endsAtUtc: utc('10:00') }] });
});
test('duplicate step ids and duplicate resource claims are invalid', () => {
  expectInvalid({ startsAtUtc: utc('09:00'), steps: [step('a', 0, 60, ['r']), step('a', 60, 30, ['r'])] });
  expectInvalid({ startsAtUtc: utc('09:00'), steps: [step('a', 0, 60, ['r', 'r'])] });
});
test('unknown fields and forged object shapes fail closed', () => {
  expectInvalid({ ...basic(), tenantId: 'attacker' });
  expectInvalid({ startsAtUtc: utc('09:00'), steps: [{ ...basic().steps[0], ignoreConflicts: true }] });
  expectInvalid({ startsAtUtc: utc('09:00'), steps: [], existing: [] });
});
test('malformed dates, offsets and oversized horizons are rejected', () => {
  expectInvalid({ ...basic(), startsAtUtc: '2026-10-15T09:00:00Z' });
  expectInvalid({ startsAtUtc: utc('09:00'), steps: [step('a', -1, 30, ['r'])] });
  expectInvalid({ startsAtUtc: utc('09:00'), steps: [step('a', 7*24*60, 30, ['r'])] });
});
test('unbounded steps, resources and external allocations fail closed', () => {
  expectInvalid({ startsAtUtc: utc('09:00'), steps: Array(17).fill(step('a', 0, 30, ['r'])) });
  expectInvalid({ startsAtUtc: utc('09:00'), steps: [step('a', 0, 30, Array(9).fill('r'))] });
  expectInvalid({ ...basic(), existing: Array(513).fill({ resourceId: 'r', startsAtUtc: utc('10:00'), endsAtUtc: utc('11:00') }) });
});
test('result is deterministic, frozen and caller-owned arrays remain intact', () => {
  const input = basic(); const serialized = JSON.stringify(input);
  const a = planExclusiveSegments(input), b = planExclusiveSegments(input);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(input), serialized);
  assert.equal(Object.isFrozen(a), true);
  assert.equal(Object.isFrozen(a.segments), true);
  assert.equal(Object.isFrozen(a.segments[0].resourceIds), true);
});
test('step with no exclusive resource cannot bypass reservation checks', () => {
  expectInvalid({ startsAtUtc: utc('09:00'), steps: [step('a', 0, 30, [])] });
});
