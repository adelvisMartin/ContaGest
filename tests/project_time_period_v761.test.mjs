import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProjectTimePeriod, parseOffsetTimestamp, PROJECT_TIME_PERIOD_VERSION } from '../backend/src/modules/projects/time-entry-period.ts';

const example = (changes = {}) => ({
  tenantId: 'tenant-a', clientId: 'client-a', memberId: 'member-a',
  project: { id: 'project-a', tenantId: 'tenant-a', clientId: 'client-a' },
  task: { id: 'task-a', tenantId: 'tenant-a', projectId: 'project-a' },
  source: 'manual',
  startedAt: '2026-10-15T09:00:00-04:00',
  endedAt: '2026-10-15T10:30:00-04:00',
  recordedMinutes: 90, ...changes
});

test('#761 manual time entry is exact, immutable evidence with no billing authorization', () => {
  const value = normalizeProjectTimePeriod(example());
  assert.equal(value.version, PROJECT_TIME_PERIOD_VERSION);
  assert.equal(value.durationMinutes, 90);
  assert.equal(value.startedAtUtc, '2026-10-15T13:00:00.000Z');
  assert.equal(value.endedAtUtc, '2026-10-15T14:30:00.000Z');
  assert.equal(value.tenantId, 'tenant-a');
  assert.equal(value.clientId, 'client-a');
  assert.equal(value.taskId, 'task-a');
  assert.equal(value.billableAuthorized, false);
  assert.equal(value.invoiceAuthorized, false);
  assert.equal(Object.isFrozen(value), true);
  assert.deepEqual(Object.keys(value).filter(key=> /rate|money|invoiceId|ledger/i.test(key)), []);
});

test('#761 timer and manual inputs normalize to same interval without trusting client minutes', () => {
  const manual = normalizeProjectTimePeriod(example());
  const timer = normalizeProjectTimePeriod(example({ source: 'timer', recordedMinutes: undefined }));
  assert.equal(timer.durationMinutes, manual.durationMinutes);
  assert.equal(timer.startedAtUtc, manual.startedAtUtc);
  assert.throws(() => normalizeProjectTimePeriod(example({ recordedMinutes: 89 })), /PROJECT_TIME_DURATION_MISMATCH/);
  for (const value of [0, 90.1, -90, NaN, 2**53]) {
    assert.throws(() => normalizeProjectTimePeriod(example({ recordedMinutes: value })), /PROJECT_TIME_DURATION_MISMATCH/);
  }
});

test('#761 crossing spring-forward DST uses elapsed UTC, not wall-clock hours', () => {
  const value=normalizeProjectTimePeriod(example({
    startedAt:'2026-03-08T01:30:00-05:00',endedAt:'2026-03-08T03:30:00-04:00',recordedMinutes:60
  }));
  assert.equal(value.durationMinutes, 60);
});

test('#761 fall-back repeated clock hour is not ambiguous when offsets are supplied', () => {
  const value=normalizeProjectTimePeriod(example({
    startedAt:'2026-11-01T01:30:00-04:00',endedAt:'2026-11-01T01:30:00-05:00',recordedMinutes:60
  }));
  assert.equal(value.durationMinutes,60);
});

test('#761 reject local timestamps without offset, bad calendar days, leap seconds and offsets', () => {
  for (const str of [
    '2026-10-15T09:00:00', '2026-02-30T09:00:00Z', '2026-02-29T09:00:00Z',
    '2026-10-15T24:00:00Z', '2026-10-15T09:00:60Z', '2026-10-15T09:00:00+14:30',
    '2026-10-15T09:00:00+23:00', '2026-10-15 09:00:00Z',
    '2026-10-15T09:00:00.1234Z', '2026-10-15T09:00Z',
    '2026-10-15T09:00:00Z\n', '', 'NaN'
  ]) assert.throws(() => parseOffsetTimestamp(str), /PROJECT_TIME_TIMESTAMP_INVALID/, str);
  assert.equal(new Date(parseOffsetTimestamp('2028-02-29T15:30:00+05:30')).toISOString(), '2028-02-29T10:00:00.000Z');
});

test('#761 require minute-aligned, positive, bounded, chronologically ordered periods', () => {
  const pairs = [
    ['2026-10-15T09:00:00Z','2026-10-15T09:00:00Z'],
    ['2026-10-15T10:00:00Z','2026-10-15T09:00:00Z'],
    ['2026-10-15T09:00:00Z','2026-10-16T09:01:00Z'],
    ['2026-10-15T09:00:01Z','2026-10-15T09:01:00Z'],
    ['2026-10-15T09:00:00.500Z','2026-10-15T09:01:00Z']
  ];
  for (const [startedAt,endedAt] of pairs) {
    assert.throws(()=>normalizeProjectTimePeriod(example({startedAt,endedAt,recordedMinutes:undefined})), /PROJECT_TIME_DURATION_INVALID/);
  }
  const valid=normalizeProjectTimePeriod(example({startedAt:'2026-10-15T00:00:00Z',endedAt:'2026-10-16T00:00:00Z',recordedMinutes:1440}));
  assert.equal(valid.durationMinutes,1440);
});

test('#761 do not accept a task from a different project or tenant', () => {
  for (const task of [
    {id:'task-x',tenantId:'tenant-b',projectId:'project-a'},
    {id:'task-x',tenantId:'tenant-a',projectId:'project-b'}
  ]) assert.throws(()=>normalizeProjectTimePeriod(example({task})), /PROJECT_TIME_SCOPE_MISMATCH/);
  assert.equal(normalizeProjectTimePeriod(example({task:null})).taskId, null);
});

test('#761 reject client/project or tenant/project mismatch before duration computation', () => {
  for (const project of [
    {id:'project-a',tenantId:'tenant-b',clientId:'client-a'},
    {id:'project-a',tenantId:'tenant-a',clientId:'client-b'}
  ]) assert.throws(()=>normalizeProjectTimePeriod(example({project})), /PROJECT_TIME_SCOPE_MISMATCH/);
});

test('#761 input IDs and source fail closed; do not leak caller objects into output', () => {
  for (const value of ['', 'a b', null, undefined, 42, 'a/b']) {
    assert.throws(()=>normalizeProjectTimePeriod(example({memberId:value})), /PROJECT_TIME_REFERENCE_INVALID/);
  }
  assert.throws(()=>normalizeProjectTimePeriod(example({source:'imported'})), /PROJECT_TIME_SOURCE_INVALID/);
  assert.throws(()=>normalizeProjectTimePeriod(null), /PROJECT_TIME_REFERENCE_INVALID/);
  const result=normalizeProjectTimePeriod(example({task:null}));
  assert.equal(Object.hasOwn(result,'task'), false);
  assert.equal(Object.hasOwn(result,'project'), false);
});

test('#761 time normalization never performs monetary settlement, DB or I/O', () => {
  const value=normalizeProjectTimePeriod(example());
  assert.deepEqual(Object.keys(value).sort(),[
    'version','tenantId','clientId','memberId','projectId','taskId','source','startedAtUtc','endedAtUtc',
    'durationMinutes','billableAuthorized','invoiceAuthorized'
  ].sort());
});
