import assert from 'node:assert/strict';
import test from 'node:test';
import { searchMultiStageSlots, MultiStageSlotSearchError } from '../backend/src/modules/scheduling/multi-stage-slot-search.ts';

const iso = (h, m = 0) => '2026-10-15T' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00.000Z';
const step = (stepId, offsetMinutes, durationMinutes, resourceIds, extra = {}) => ({
  stepId, offsetMinutes, durationMinutes, resourceIds, ...extra
});
const query = (overrides = {}) => ({
  candidateQuery: { available: [{ start: iso(9), end: iso(13) }], durationMinutes: 90, stepMinutes: 30 },
  steps: [step('triage', 0, 30, ['room-1']), step('care', 30, 60, ['room-1', 'doctor-1'])],
  ...overrides
});
const starts = value => searchMultiStageSlots(value).suggestions.map(x => x.startsAtUtc);
const invalid = q => assert.throws(() => searchMultiStageSlots(q), e => e instanceof MultiStageSlotSearchError);

test('composes two real scheduling cores and returns fully planned stages', () => {
  const result = searchMultiStageSlots(query());
  assert.equal(result.complete, true);
  assert.equal(result.truncated, false);
  assert.equal(result.suggestions.length, 6);
  assert.equal(result.suggestions[0].startsAtUtc, iso(9));
  assert.equal(result.suggestions[0].endsAtUtc, iso(10,30));
  assert.deepEqual(result.suggestions[0].segments.map(s => s.startsAtUtc), [iso(9), iso(9,30)]);
});
test('rejects conflicting resource without losing later feasible starts', () => {
  const p = query({ existing: [{ resourceId: 'room-1', startsAtUtc: iso(9), endsAtUtc: iso(10,30) }] });
  const res = searchMultiStageSlots(p);
  assert.deepEqual(res.suggestions.map(x => x.startsAtUtc), [iso(10,30), iso(11), iso(11,30)]);
  assert.equal(res.rejectedByResources, 3);
  assert.equal(res.complete, true);
});
test('unrelated resource cannot suppress starts', () => {
  assert.deepEqual(starts(query({ existing: [{ resourceId: 'room-2', startsAtUtc: iso(9), endsAtUtc: iso(13) }] })), starts(query()));
});
test('shared resource conflicts with distinct vertical stages, even when only one stage uses it', () => {
  const res = searchMultiStageSlots(query({ existing: [{ resourceId: 'doctor-1', startsAtUtc: iso(9,30), endsAtUtc: iso(10) }] }));
  assert.equal(res.suggestions[0].startsAtUtc, iso(9,30));
});
test('candidate query availability closure excludes blocked global intervals', () => {
  const q = query();
  q.candidateQuery.blocked = [{ start: iso(10), end: iso(11) }];
  assert.deepEqual(starts(q), [iso(11), iso(11,30)]);
});
test('stages extending beyond advertised envelope fail closed', () => {
  invalid(query({ candidateQuery: { available: [{ start: iso(9), end: iso(13) }], durationMinutes: 30, stepMinutes: 30 } }));
});
test('step pre-buffer must be represented by envelope pre-buffer', () => {
  const q = query({ steps: [step('triage', 0, 30, ['room-1'], { bufferBeforeMinutes: 15 }), step('care', 30, 60, ['room-2'])] });
  invalid(q);
  q.candidateQuery.bufferBeforeMinutes = 15;
  assert.equal(searchMultiStageSlots(q).suggestions[0].startsAtUtc, iso(9,15));
});
test('later-stage post-buffer must be represented by envelope post-buffer', () => {
  const q = query({ steps: [step('triage', 0, 30, ['room-1']), step('care', 30, 60, ['room-2'], { bufferAfterMinutes: 30 })] });
  invalid(q);
  q.candidateQuery.bufferAfterMinutes = 30;
  assert.equal(searchMultiStageSlots(q).suggestions.at(-1).startsAtUtc, iso(11));
});
test('a stage occupying start-before-buffer is checked against preexisting resource claims', () => {
  const q = query({
    candidateQuery: { available: [{ start: iso(9), end: iso(13) }], durationMinutes: 90, stepMinutes: 30, bufferBeforeMinutes: 15 },
    steps: [step('triage', 0, 30, ['room-1'], { bufferBeforeMinutes: 15 }), step('care', 30, 60, ['room-2'])],
    existing: [{ resourceId: 'room-1', startsAtUtc: iso(9), endsAtUtc: iso(9, 10) }]
  });
  assert.equal(searchMultiStageSlots(q).suggestions[0].startsAtUtc, iso(9,45));
});
test('empty availability returns zero without treating invalid steps as valid', () => {
  assert.deepEqual(searchMultiStageSlots(query({ candidateQuery: { available: [], durationMinutes: 90, stepMinutes: 30 } })).suggestions, []);
  assert.throws(() => searchMultiStageSlots(query({ candidateQuery: { available: [], durationMinutes: 90, stepMinutes: 30 }, steps: [step('bad',0,0,['r'])] })), e => e?.code === 'SCHEDULING_SEGMENTS_INVALID');
});
test('limit bounds returned results but scans full candidate set', () => {
  const result = searchMultiStageSlots(query({ limit: 2 }));
  assert.equal(result.suggestions.length, 2);
  assert.equal(result.examinedCandidates, 6);
  assert.equal(result.truncated, true);
  assert.equal(result.complete, true);
});
test('when candidate cap drops later times, results are explicitly incomplete even if empty', () => {
  const q = {
    candidateQuery: { available: [{ start: '2026-10-15T00:00:00.000Z', end: '2026-10-15T12:00:00.000Z' }], durationMinutes: 1, stepMinutes: 1 },
    steps: [step('single', 0, 1, ['room-1'])],
    existing: [{ resourceId: 'room-1', startsAtUtc: '2026-10-15T00:00:00.000Z', endsAtUtc: '2026-10-15T06:00:00.000Z' }]
  };
  const result = searchMultiStageSlots(q);
  assert.equal(result.suggestions.length, 0);
  assert.equal(result.complete, false);
  assert.equal(result.truncated, true);
  assert.equal(result.examinedCandidates, 256);
});
test('rejects forged candidate sample limit and unexpected top-level input', () => {
  invalid(query({ candidateQuery: { ...query().candidateQuery, limit: 1 } }));
  invalid(query({ candidateQuery: { ...query().candidateQuery, tenantId: 'forged' } }));
  invalid({ ...query(), tenantId: 'untrusted' });
  invalid(query({ limit: 0 }));
  invalid(query({ limit: 65 }));
});
test('rejects invalid global dates/offsets propagated from existing validators', () => {
  assert.throws(() => searchMultiStageSlots(query({ steps: [step('x', -1, 30, ['r'])] })), e => e?.code === 'SCHEDULING_SEGMENTS_INVALID');
  assert.throws(() => searchMultiStageSlots(query({ candidateQuery: { available: [{ start: 'bogus', end: iso(13) }], durationMinutes: 90, stepMinutes: 30 } })));
});
test('does not mutate input or persist a booking', () => {
  const q = query();
  const copy = JSON.stringify(q);
  const a = searchMultiStageSlots(q);
  const b = searchMultiStageSlots(q);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(q), copy);
});
