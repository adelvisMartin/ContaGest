import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveLocalWallClock, WallClockError } from '../backend/src/modules/scheduling/wall-clock.ts';

const local = (localDateTime, timezone = 'America/New_York', disambiguation) =>
  resolveLocalWallClock({ localDateTime, timezone, disambiguation });

function rejectCode(fn, code) {
  assert.throws(fn, error => error instanceof WallClockError && error.code === code);
}

test('converts unique winter and summer times to different UTC offsets', () => {
  assert.equal(local('2026-01-15T09:00').utcInstant, '2026-01-15T14:00:00.000Z');
  assert.equal(local('2026-07-15T09:00').utcInstant, '2026-07-15T13:00:00.000Z');
});

test('DST spring-forward gap is rejected, not normalized to another local hour', () => {
  rejectCode(() => local('2026-03-08T02:30'), 'SCHEDULING_LOCAL_TIME_NONEXISTENT');
});

test('fall-back overlap requires explicit earlier/later choice', () => {
  rejectCode(() => local('2026-11-01T01:30'), 'SCHEDULING_LOCAL_TIME_AMBIGUOUS');
  const earlier = local('2026-11-01T01:30', 'America/New_York', 'earlier');
  const later = local('2026-11-01T01:30', 'America/New_York', 'later');
  assert.equal(earlier.utcInstant, '2026-11-01T05:30:00.000Z');
  assert.equal(later.utcInstant, '2026-11-01T06:30:00.000Z');
  assert.equal(earlier.disambiguated, true);
  assert.equal(later.disambiguated, true);
});

test('a valid unique wall clock does not imply ambiguity when later is requested', () => {
  assert.equal(local('2026-06-01T08:15', 'America/New_York', 'later').disambiguated, false);
});

test('half-hour DST overlap in Australia/Lord_Howe is not assumed to be one hour', () => {
  const a = local('2026-04-05T01:45', 'Australia/Lord_Howe', 'earlier');
  const b = local('2026-04-05T01:45', 'Australia/Lord_Howe', 'later');
  assert.equal((Date.parse(b.utcInstant) - Date.parse(a.utcInstant)) / 60000, 30);
});

test('Samoa skipped civil date does not silently book the following day', () => {
  rejectCode(() => local('2011-12-30T12:00', 'Pacific/Apia'), 'SCHEDULING_LOCAL_TIME_NONEXISTENT');
});

test('year boundary, leap date and explicit seconds round-trip', () => {
  assert.equal(local('2024-02-29T23:59:57', 'UTC').utcInstant, '2024-02-29T23:59:57.000Z');
  assert.equal(local('2026-12-31T23:59', 'UTC').utcInstant, '2026-12-31T23:59:00.000Z');
});

test('invalid civil date, timezone and offsets fail closed', () => {
  for (const invalid of ['2026-02-29T09:00', '2026-13-01T00:00', '2026-10-15T24:00', '2026-10-15T10:60', '2026-10-15T10:00Z', '2026-10-15T10:00-05:00', '15/10/2026 10:00', '2026-10-15T10:00:60', '', null, 42]) {
    rejectCode(() => local(invalid), 'SCHEDULING_LOCAL_DATETIME_INVALID');
  }
  for (const zone of ['Bad/Location', '', null, 7]) {
    rejectCode(() => local('2026-01-15T09:00', zone), 'SCHEDULING_TIMEZONE_INVALID');
  }
  rejectCode(() => local('2026-01-15T09:00', 'UTC', 'guess'), 'SCHEDULING_DISAMBIGUATION_INVALID');
});

test('conversion is independent of local process timezone', () => {
  assert.equal(local('2026-11-01T02:30').utcInstant, '2026-11-01T07:30:00.000Z');
});

test('existing route performs tenant-scoped lookup and preserves explicit conflict errors', () => {
  const routeFile = fileURLToPath(new URL('../backend/src/modules/business-locations/business-locations.routes.ts', import.meta.url));
  const src = readFileSync(routeFile, 'utf8');
  assert.match(src, /router\.get\('\/:id\/time\/resolve'/);
  assert.match(src, /await getOwned\(context\(req\)\.tenantId,req\.params\.id\)/);
  assert.match(src, /resolveLocalWallClock\(\{/);
  assert.match(src, /code: error\.code/);
  assert.match(src, /router\.use\(requireTenant\)/);
});
