import test from 'node:test';
import assert from 'node:assert/strict';
import { igtfEventSelector, previewReviewedIgtfEvent } from '../backend/src/modules/fiscal/ve-igtf-event-preview.ts';

// Fixture rates are synthetic fractions, NOT Venezuelan statutory rates.
const event = Object.freeze({ tenantId: 'tenant-A', eventDate: '2026-06-30',
  currency: 'USD', paymentMethod: 'BANK', operationKind: 'SETTLEMENT',
  taxpayerCategory: 'CATEGORY_A', baseMinor: 101 });
const rule = Object.freeze({ id: 'synthetic-IGTF', tenantId: event.tenantId,
  family: 'IGTF', selector: 'USD|BANK|SETTLEMENT|CATEGORY_A', version: 1,
  effectiveFrom: '2026-01-01', effectiveTo: '2027-01-01', status: 'ACTIVE',
  sourceId: 'synthetic-source', sourceReference: 'Synthetic - not legal',
  sourceContentSha256: 'a'.repeat(64), reviewedBy: 'fixture-reviewer',
  reviewedAt: '2026-01-01T00:00:00Z', numerator: 1, denominator: 2 });
const reject = (fn) => assert.throws(fn);
test('#778 event selector is exact across four classification dimensions', () => {
  assert.equal(igtfEventSelector(event), rule.selector);
  assert.notEqual(igtfEventSelector({ ...event, currency: 'VES' }), rule.selector);
});
test('#778 computes preview only with matching ACTIVE reviewed provenance', () => {
  const result = previewReviewedIgtfEvent(event, rule);
  assert.equal(result.taxMinor, 51);
  assert.equal(result.snapshot.sourceId, 'synthetic-source');
  assert.equal(result.mode, 'NON_POSTING_PREVIEW');
  assert.ok(Object.isFrozen(result));
});
test('#778 denies mismatched tenant, family, selector or date', () => {
  reject(() => previewReviewedIgtfEvent({ ...event, tenantId: 'tenant-B' }, rule));
  reject(() => previewReviewedIgtfEvent(event, { ...rule, family: 'IVA' }));
  reject(() => previewReviewedIgtfEvent({ ...event, paymentMethod: 'CASH' }, rule));
  reject(() => previewReviewedIgtfEvent({ ...event, eventDate: '2027-01-01' }, rule));
});
test('#778 refuses DRAFT, unknown source and ambiguous selector tokens', () => {
  reject(() => previewReviewedIgtfEvent(event, { ...rule, status: 'DRAFT' }));
  reject(() => previewReviewedIgtfEvent(event, { ...rule, reviewedBy: '' }));
  reject(() => previewReviewedIgtfEvent(event, { ...rule, sourceContentSha256: 'not-a-sha' }));
  reject(() => previewReviewedIgtfEvent({ ...event, operationKind: 'A|B' }, rule));
  reject(() => previewReviewedIgtfEvent({ ...event, currency: 'usd' }, rule));
});
test('#778 rejects negative/fractional/overflow base and supports reviewed zero rate', () => {
  for (const baseMinor of [-1, 1.2, Number.MAX_SAFE_INTEGER + 1])
    reject(() => previewReviewedIgtfEvent({ ...event, baseMinor }, rule));
  assert.equal(previewReviewedIgtfEvent(event, { ...rule, numerator: 0 }).taxMinor, 0);
});
