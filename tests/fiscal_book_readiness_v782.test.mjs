import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFiscalBookReadiness } from '../backend/src/modules/fiscal/fiscal-book-readiness.ts';

const rows = Object.freeze([
  { id: 'b', tenantId: 't-A', number: 'F-2', status: 'issued', issueDate: '2026-09-15T13:00:00.000Z' },
  { id: 'a', tenantId: 't-A', number: 'F-1', status: 'cancelled', issueDate: '2026-09-01T00:00:00.000Z' },
]);
const params = { tenantId: 't-A', fiscalPeriod: '2026-09', book: 'sales', rows };
const denied = (fn) => assert.throws(fn, { message: 'FISCAL_BOOK_SOURCE_NOT_VERIFIABLE' });
test('#782 stable hash independent of SELECT order without rereading current tax rates', () => {
  const first = buildFiscalBookReadiness(params);
  const second = buildFiscalBookReadiness({ ...params, rows: [...rows].reverse() });
  assert.deepEqual(first, second);
  assert.equal(first.sources[0].sourceId, 'a');
  assert.match(first.sourceEvidenceHash, /^[a-f0-9]{64}$/);
});
test('#782 never certifies an accounting or tax book from unlinked invoices', () => {
  const report = buildFiscalBookReadiness(params);
  assert.equal(report.status, 'BLOCKED_NOT_CERTIFIED');
  assert.equal(report.sourceCount, 2);
  assert.ok(report.sources[0].blockers.includes('CANCELLATION_RECONCILIATION_REQUIRED'));
  assert.ok(report.sources[1].blockers.includes('UNLINKED_FISCAL_PROVENANCE'));
  assert.ok(Object.isFrozen(report.sources));
});
test('#782 cross-tenant, duplicate source id or malformed date is rejected', () => {
  denied(() => buildFiscalBookReadiness({ ...params, rows: [{ ...rows[0], tenantId: 't-B' }] }));
  denied(() => buildFiscalBookReadiness({ ...params, rows: [rows[0], rows[0]] }));
  denied(() => buildFiscalBookReadiness({ ...params, rows: [{ ...rows[0], issueDate: '2026-02-30T00:00:00.000Z' }] }));
});
test('#782 empty periods remain uncertified, not silently compliant', () => {
  const report = buildFiscalBookReadiness({ ...params, book: 'purchases', rows: [] });
  assert.equal(report.reason, 'EMPTY_PERIOD_NOT_CERTIFIED');
  assert.notEqual(report.sourceEvidenceHash, buildFiscalBookReadiness(params).sourceEvidenceHash);
});
test('#782 source draft and incorrect calendar month are visible as blockers', () => {
  const report = buildFiscalBookReadiness({ ...params, rows: [{ ...rows[0], status: 'draft', issueDate: '2026-10-01T00:00:00.000Z' }] });
  assert.ok(report.sources[0].blockers.includes('DRAFT_SOURCE'));
  assert.ok(report.sources[0].blockers.includes('ISSUE_DATE_PERIOD_REVIEW_REQUIRED'));
});
test('#782 validates book kind, period, tenant and bounded scan', () => {
  denied(() => buildFiscalBookReadiness({ ...params, tenantId: '' }));
  denied(() => buildFiscalBookReadiness({ ...params, fiscalPeriod: '2026-13' }));
  denied(() => buildFiscalBookReadiness({ ...params, book: 'combined' }));
  denied(() => buildFiscalBookReadiness({ ...params, rows: Array.from({ length: 501 }, (_, i) => ({ ...rows[0], id: String(i) })) }));
});
