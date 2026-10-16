import test from 'node:test';
import assert from 'node:assert/strict';
import { immunizationDateIssues, parseImmunizationInstant } from '../backend/src/modules/verticals/veterinary-immunization-date-policy.ts';

const issues = (administeredAt, nextDueAt) => immunizationDateIssues({ administeredAt, nextDueAt });

test('explicit UTC and offset instants resolve to the same moment', () => {
  assert.equal(parseImmunizationInstant('2026-10-15T17:30:00.000Z'), parseImmunizationInstant('2026-10-15T13:30:00-04:00'));
  assert.deepEqual(issues('2026-10-15T13:30:00-04:00', '2026-11-15T12:00:00-05:00'), []);
});

test('missing optional dates preserve existing default-now and null behavior', () => {
  assert.deepEqual(immunizationDateIssues({}), []);
  assert.deepEqual(immunizationDateIssues({nextDueAt:null}), []);
  assert.deepEqual(immunizationDateIssues({nextDueAt:'2026-12-01T12:00:00Z'}), []);
});

test('date-only and unzoned local timestamps are rejected without guessing a timezone', () => {
  for (const invalid of ['2026-10-15', '2026-10-15T12:00:00', '2026-10-15T12:00', '']) {
    assert.deepEqual(issues(invalid, null).map(item=>item.field), ['administeredAt']);
  }
});

test('impossible calendar dates and invalid clock/offset components fail closed', () => {
  for (const invalid of ['2026-02-29T12:00:00Z', '2026-04-31T12:00:00Z', '2026-13-01T12:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T12:61:00Z', '2026-01-01T12:00:60Z', '2026-01-01T12:00:00+14:01', '2026-01-01T12:00:00+15:00']) {
    assert.equal(parseImmunizationInstant(invalid), null, invalid);
  }
  assert.notEqual(parseImmunizationInstant('2028-02-29T12:00:00Z'), null);
});

test('due date must be later in absolute time even when timezone offsets differ', () => {
  assert.deepEqual(issues('2026-10-15T13:00:00-04:00', '2026-10-15T17:00:00Z').map(item=>item.field), ['nextDueAt']);
  assert.deepEqual(issues('2026-10-15T13:00:00-04:00', '2026-10-15T16:59:59Z').map(item=>item.field), ['nextDueAt']);
  assert.deepEqual(issues('2026-10-15T13:00:00-04:00', '2026-10-15T17:00:01Z'), []);
});

test('invalid dates are reported per field and cannot become a valid schedule', () => {
  assert.deepEqual(issues('not-a-date', 'also-not-a-date').map(item=>item.field), ['administeredAt', 'nextDueAt']);
  assert.deepEqual(issues('2026-10-15T12:00:00Z', 'bad').map(item=>item.field), ['nextDueAt']);
});
