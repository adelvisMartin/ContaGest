import test from 'node:test';
import assert from 'node:assert/strict';
import { validSoakSampleSummary } from '../scripts/hipico-soak-sample-summary-v120.mjs';

const row = (index, options = {}) => ({
  at: new Date(Date.parse('2026-10-21T00:00:00.000Z') + index * 30_000).toISOString(),
  decisions: index + 10,
  duplicateResponses: 0,
  lostDecisions: 0,
  contextLeaks: 0,
  health: { ok: true, status: 200, reason: 'READY_SHADOW', latencyMs: 3 },
  spool: { available: true, files: 2, bytes: 512, activeFiles: 1,
    queuedFiles: 1, failedFiles: 0, oldestAgeSeconds: 4 },
  ...options
});
const base = [row(0), row(1), row(2)];
const summary = {
  samples: 3, healthChecks: 3, healthFailures: 0, spoolChecks: 3,
  spoolAvailableChecks: 3, maxSpoolBytes: 512, maxBacklogAgeSeconds: 4,
  unexpectedDuplicateResponses: 0, lostDecisions: 0, contextLeaks: 0
};
const check = (rows, value = summary) => validSoakSampleSummary(rows, value);

test('genuine producer-shaped stream matches counts, peaks and cumulative counters', () => {
  assert.equal(check(base), true);
});
test('recomputed hash cannot disguise a failed health probe or missing probe', () => {
  assert.equal(check([base[0], row(1, { health: { ok: false, status: 503, latencyMs: 5 } }), base[2]]), false);
  assert.equal(check([base[0], row(1, { health: null }), base[2]]), false);
});
test('a documented health failure matches only honest summary accounting', () => {
  assert.equal(check([base[0], row(1, { health: { ok: false, status: 503, latencyMs: 5 } }), base[2]],
    { ...summary, healthFailures: 1 }), true);
});
test('recomputed hash cannot conceal spool outage, age or byte spike', () => {
  assert.equal(check([base[0], row(1, { spool: { ...base[1].spool, available: false } }), base[2]]), false);
  assert.equal(check([base[0], row(1, { spool: { ...base[1].spool, bytes: 100000 } }), base[2]]), false);
  assert.equal(check([base[0], row(1, { spool: { ...base[1].spool, oldestAgeSeconds: 400 } }), base[2]]), false);
});
test('lost and duplicated decisions cannot be scrubbed in summary or later samples', () => {
  for (const key of ['duplicateResponses', 'lostDecisions', 'contextLeaks']) {
    assert.equal(check([base[0], row(1, { [key]: 1 }), row(2, { [key]: 1 })]), false);
    assert.equal(check([base[0], row(1, { [key]: 1 }), row(2, { [key]: 0 })]), false);
  }
});
test('counter reset, malicious numeric types or impossible spool balances fail closed', () => {
  assert.equal(check([base[0], row(1, { decisions: 100 }), row(2, { decisions: 12 })]), false);
  assert.equal(check([base[0], row(1, { decisions: '11' }), base[2]]), false);
  assert.equal(check([base[0], row(1, { spool: { ...base[1].spool, activeFiles: 3 } }), base[2]]), false);
  assert.equal(check([base[0], row(1, { health: { ok: true, status: 200, latencyMs: NaN } }), base[2]]), false);
});
test('empty series, absent summary fields or wrong row count never pass', () => {
  assert.equal(check([]), false);
  assert.equal(check(base, { ...summary, samples: 2 }), false);
  assert.equal(check(base, { ...summary, spoolChecks: undefined }), false);
});
