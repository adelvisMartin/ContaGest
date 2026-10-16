import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  FifoCohortError, parseFifoCohortOptions, projectFifoCohortDrilldown
} from '../backend/src/modules/reports/fifo-cohort-drilldown.ts';

const asOf = new Date('2026-10-15T12:00:00.000Z');
const good = {
  cohorts: [{ movementId: 'receipt-1', receivedAt: asOf.getTime() - 31 * 86400000, quantity: 1250n }],
  asOf,
  onHandUnits: 1250n,
  options: { take: 25, skip: 0 }
};
const expectCode = (fn, code) => assert.throws(fn, error =>
  error instanceof FifoCohortError && error instanceof TypeError && error.code === code);

test('typed FIFO errors preserve prior TypeError compatibility without classifying arbitrary exceptions', () => {
  assert.equal(new FifoCohortError('FIFO_COHORT_INPUT_INVALID').name, 'FifoCohortError');
  assert.equal(new TypeError('prisma query failed') instanceof FifoCohortError, false);
  assert.equal(new Error('unexpected runtime failure') instanceof FifoCohortError, false);
});
test('bad request parameters raise only typed FIFO parser errors', () => {
  expectCode(() => parseFifoCohortOptions('true', '0', undefined), 'FIFO_COHORT_QUERY_INVALID');
  expectCode(() => parseFifoCohortOptions('false', '25', undefined), 'FIFO_COHORT_QUERY_INVALID');
  expectCode(() => parseFifoCohortOptions('true', undefined, undefined, 'other'), 'FIFO_COHORT_QUERY_INVALID');
  expectCode(() => parseFifoCohortOptions('true', undefined, undefined, undefined, '3'), 'FIFO_COHORT_QUERY_INVALID');
});
test('invalid projection requests and chronology are explicitly typed', () => {
  expectCode(() => projectFifoCohortDrilldown({ ...good, options: { take: 101, skip: 0 } }), 'FIFO_COHORT_INPUT_INVALID');
  expectCode(() => projectFifoCohortDrilldown({ ...good, cohorts: [
    good.cohorts[0], good.cohorts[0]
  ], onHandUnits: 2500n }), 'FIFO_COHORT_INVALID');
});
test('full reconciliation conflict stays typed before page filtering', () => {
  expectCode(() => projectFifoCohortDrilldown({
    ...good, onHandUnits: 1249n, options: { take: 1, skip: 5000, fixedBucket: 'day181Plus' }
  }), 'FIFO_COHORT_RECONCILIATION_FAILED');
});
test('valid FIFO response remains unchanged and is still read-only', () => {
  const result = projectFifoCohortDrilldown(good);
  assert.equal(result.totalQuantityExact, '1.250');
  assert.equal(result.pageQuantityExact, '1.250');
  assert.equal(result.rows[0].fixedBucket, 'day31to90');
  assert.equal(result.rows[0].physicalLotAllocationVerified, false);
  assert.equal(result.provenance, 'RECONCILED_FIFO_ESTIMATE_NOT_PHYSICAL_LOT_OR_LOCATION');
});
test('HTTP ageing route maps only expected FIFO errors; unexpected TypeErrors are not hidden as inventory conflicts', () => {
  const source = readFileSync(new URL('../backend/src/modules/reports/reports.routes.ts', import.meta.url), 'utf8');
  assert.match(source, /import \{ FifoCohortError, parseFifoCohortOptions \} from '\.\/fifo-cohort-drilldown\.js'/);
  const start = source.indexOf("router.get('/inventory/ageing',");
  const end = source.indexOf('// Catalog-only alert.', start);
  assert.ok(start >= 0 && end > start);
  const route = source.slice(start, end);
  assert.match(route, /error instanceof StockAgeingError/);
  assert.match(route, /error instanceof FifoCohortError/);
  assert.doesNotMatch(route, /error instanceof TypeError/);
  assert.match(route, /code: 'AGEING_COHORT_RECONCILIATION_INVALID'/);
  assert.match(route, /Prisma.TransactionIsolationLevel.RepeatableRead/);
  assert.match(route, /tenantId: ctx.tenantId/);
  assert.match(source, /router.use\(requireTenant, requirePermission\('reports.view'\)\)/);
});
