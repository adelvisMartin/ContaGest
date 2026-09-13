import test from 'node:test';
import assert from 'node:assert/strict';
import { freshnessFrom } from './racing-provider.js';

const now = Date.parse('2026-09-12T18:30:00.000Z');

test('provider freshness tolerates small clock skew but never presents far-future evidence as LIVE', () => {
  assert.equal(
    freshnessFrom('2026-09-12T18:31:00.000Z', '2026-09-12T18:30:00.000Z', now),
    'LIVE'
  );
  assert.equal(
    freshnessFrom('2026-09-12T19:30:00.000Z', '2026-09-12T18:30:00.000Z', now),
    'OFFLINE'
  );
});

test('far-future fetchedAt without sourceTimestamp also fails closed as OFFLINE', () => {
  assert.equal(
    freshnessFrom(null, '2026-09-13T18:30:00.000Z', now),
    'OFFLINE'
  );
});

test('invalid timestamps never become fresh data', () => {
  assert.equal(freshnessFrom('not-a-date', 'also-invalid', now), 'OFFLINE');
});
