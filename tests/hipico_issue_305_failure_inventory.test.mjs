import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const inventory = JSON.parse(readFileSync(new URL('../ops/roadmap/hipico-preqa-305-diagnosis.json', import.meta.url), 'utf8'));
const classifications = new Set([
  'stale-contract',
  'valid-regression',
  'missing-implementation',
  'duplicate-or-conflicting-authority'
]);

test('issue #305 preserves a complete diagnosis of the 34 real baseline pre-QA failures', () => {
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.ticket, 305);
  assert.equal(inventory.baseline.sha, 'a76de8b50a90438924d3bc26b861212be33fb449');
  assert.equal(inventory.baseline.tests, 360);
  assert.equal(inventory.baseline.passed, 326);
  assert.equal(inventory.baseline.failed, 34);
  assert.equal(inventory.failures.length, 34);
  assert.equal(new Set(inventory.failures.map((row) => row.id)).size, 34);
});

test('every #305 diagnosis row is actionable and uses only the ticket classification vocabulary', () => {
  for (const row of inventory.failures) {
    assert.match(row.id, /^B\d{3}$/);
    assert.match(row.testFile, /^(tests|backend)\//);
    assert.ok(Number.isInteger(row.line) && row.line > 0, `${row.id}: invalid line`);
    assert.ok(String(row.testName || '').trim(), `${row.id}: missing test name`);
    assert.ok(String(row.expected || '').trim(), `${row.id}: missing expected`);
    assert.ok(String(row.actual || '').trim(), `${row.id}: missing actual`);
    assert.ok(classifications.has(row.classification), `${row.id}: invalid classification`);
    assert.ok(String(row.decision || '').trim().length >= 20, `${row.id}: missing decision`);
    assert.ok(Array.isArray(row.resolutionEvidence) && row.resolutionEvidence.length > 0, `${row.id}: missing resolution evidence`);
    assert.equal(row.verification, 'PENDING_EXACT_REVERIFY');
  }
});

test('baseline diagnosis distinguishes real regressions from stale or conflicting contracts', () => {
  const regressions = inventory.failures.filter((row) => row.classification === 'valid-regression');
  assert.ok(regressions.length >= 6, 'real regressions must remain explicit instead of being rewritten as stale tests');
  assert.ok(inventory.failures.some((row) => row.classification === 'stale-contract'));
  assert.ok(inventory.failures.some((row) => row.classification === 'duplicate-or-conflicting-authority'));
  for (const row of regressions) {
    assert.ok(row.resolutionEvidence.some((entry) => /^(tests|backend|frontend|products|scripts|\.github)\//.test(entry)));
  }
});
