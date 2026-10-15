import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSlotCandidates, SlotCandidateError } from '../backend/src/modules/scheduling/slot-candidates.ts';

const time = h => '2026-10-15T' + String(h).padStart(2, '0') + ':00:00.000Z';
const interval = (start, end) => ({ start: time(start), end: time(end) });
const query = (more = {}) => ({ available: [interval(9, 13)], durationMinutes: 60, stepMinutes: 60, ...more });
const starts = x => calculateSlotCandidates(x).slots.map(y => y.start);
const reject = (x, code) => assert.throws(() => calculateSlotCandidates(x), e => e instanceof SlotCandidateError && e.code === code);

test('calculates bounded slots from explicit UTC windows only', () => {
  assert.deepEqual(starts(query()), [time(9), time(10), time(11), time(12)]);
  assert.deepEqual(calculateSlotCandidates(query({ available: [] })), { slots: [], truncated: false, scanned: 0 });
});

test('half-open adjacency allows a slot exactly after a busy interval', () => {
  assert.deepEqual(starts(query({ blocked: [interval(10, 11)] })), [time(9), time(11), time(12)]);
});

test('buffer before/after must fit inside availability and stay free', () => {
  assert.deepEqual(starts(query({ bufferBeforeMinutes: 30, bufferAfterMinutes: 30, blocked: [interval(10, 11)] })), [
    '2026-10-15T11:30:00.000Z'
  ]);
});

test('closure fully blocks an entire window without returning false availability', () => {
  assert.deepEqual(starts(query({ blocked: [interval(9, 13)] })), []);
});

test('overlapping windows deduplicate and sort slots deterministically', () => {
  const r = calculateSlotCandidates(query({ available: [interval(11, 13), interval(9, 12)] }));
  assert.deepEqual(r.slots.map(s => s.start), [time(9), time(10), time(11), time(12)]);
});

test('limit returns explicit truncation, not fabricated complete availability', () => {
  const r = calculateSlotCandidates(query({ limit: 2 }));
  assert.equal(r.truncated, true);
  assert.equal(r.slots.length, 2);
  assert.equal(r.scanned, 4);
});

test('only full duration and buffers within a window are included', () => {
  const r = calculateSlotCandidates(query({ durationMinutes: 120, bufferAfterMinutes: 60 }));
  assert.deepEqual(r.slots.map(s => s.start), [time(9), time(10)]);
});

test('unsafe values and malicious/unbounded inputs fail closed', () => {
  for (const value of [NaN, Infinity, 0, -1, 1.3, '60', null, 100000]) {
    reject(query({ durationMinutes: value }), 'SCHEDULING_SLOT_QUERY_INVALID');
  }
  reject(query({ stepMinutes: 0 }), 'SCHEDULING_SLOT_QUERY_INVALID');
  reject(query({ bufferBeforeMinutes: -1 }), 'SCHEDULING_SLOT_QUERY_INVALID');
  reject(query({ limit: 257 }), 'SCHEDULING_SLOT_QUERY_INVALID');
  reject(query({ available: 'nope' }), 'SCHEDULING_SLOT_QUERY_INVALID');
  reject(query({ available: Array(65).fill(interval(9, 13)) }), 'SCHEDULING_SLOT_QUERY_INVALID');
});

test('invalid/malformed or reversed intervals fail instead of silently passing', () => {
  for (const bad of [
    { start: '2026-10-15T09:00:00Z', end: time(10) },
    { start: '2026-02-30T09:00:00.000Z', end: time(10) },
    { start: time(10), end: time(9) },
    { start: time(9), end: time(9) },
    { start: time(9), end: 'bad' },
    null
  ]) reject(query({ blocked: [bad] }), 'SCHEDULING_SLOT_INTERVAL_INVALID');
});

test('fixed UTC intervals cross DST boundary without adding 24-hour local-time assumptions', () => {
  const r = calculateSlotCandidates({
    available: [{ start: '2026-11-01T05:00:00.000Z', end: '2026-11-01T07:00:00.000Z' }],
    durationMinutes: 30, stepMinutes: 30
  });
  assert.equal(r.slots.length, 4);
  assert.equal(r.slots[0].start, '2026-11-01T05:00:00.000Z');
  assert.equal(r.slots[3].start, '2026-11-01T06:30:00.000Z');
});

test('excessive scan budget fails rather than exhausting request CPU', () => {
  const start = '2026-10-15T00:00:00.000Z', end = '2026-10-22T00:00:00.000Z';
  reject({ available: Array(3).fill({ start, end }), durationMinutes: 1, stepMinutes: 1 }, 'SCHEDULING_SLOT_SCAN_LIMIT');
});

test('does not mutate caller input nor share accidental state across calls', () => {
  const input = query({ blocked: [interval(9, 10)] });
  const before = JSON.stringify(input);
  assert.deepEqual(starts(input), [time(10), time(11), time(12)]);
  assert.deepEqual(starts(input), [time(10), time(11), time(12)]);
  assert.equal(JSON.stringify(input), before);
});
