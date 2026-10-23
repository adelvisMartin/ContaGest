import test from 'node:test';
import assert from 'node:assert/strict';
import { previewReviewedIgtfEventFromCatalog } from '../backend/src/modules/fiscal/ve-igtf-event-preview.ts';
import { previewReviewedMunicipalPeriodFromCatalog } from '../backend/src/modules/fiscal/ve-municipal-event-preview.ts';
import { previewReviewedPayrollContributions } from '../backend/src/modules/payroll/ve-parafiscal-breakdown-preview.ts';

// Synthetic fixtures only. No Venezuelan tax rate is asserted.
const rule = (family, selector, tenantId = 'tenant-A') => ({
  id: 'fixture-' + family, tenantId, family, selector, version: 1,
  effectiveFrom: '2026-01-01', effectiveTo: '2027-01-01', status: 'ACTIVE',
  sourceId: 'mock-evidence', sourceReference: 'Synthetic fixture, not law',
  sourceContentSha256: 'c'.repeat(64), reviewedBy: 'fixture-reviewer',
  reviewedAt: '2026-01-01T00:00:00Z', numerator: 1, denominator: 2,
});
const ig = { tenantId: 'tenant-A', eventDate: '2026-09-15', currency: 'USD',
  paymentMethod: 'BANK', operationKind: 'PAYMENT', taxpayerCategory: 'CATEGORY_A', baseMinor: 101 };
const igtf = rule('IGTF', 'USD|BANK|PAYMENT|CATEGORY_A');
test('#778 exact IGTF catalog resolution rejects overlap and out-of-tenant', () => {
  assert.equal(previewReviewedIgtfEventFromCatalog(ig, [igtf]).taxMinor, 51);
  assert.throws(() => previewReviewedIgtfEventFromCatalog(ig, [igtf, { ...igtf, id: 'overlap' }]));
  assert.throws(() => previewReviewedIgtfEventFromCatalog({ ...ig, tenantId: 'tenant-B' }, [igtf]));
  assert.throws(() => previewReviewedIgtfEventFromCatalog(ig, [{ ...igtf, status: 'DRAFT' }]));
  assert.throws(() => previewReviewedIgtfEventFromCatalog(ig, []));
});
test('#778 historical IGTF snapshot survives boundary selection', () => {
  const next = { ...igtf, id: 'v2', version: 2, effectiveFrom: '2027-01-01', effectiveTo: null };
  assert.equal(previewReviewedIgtfEventFromCatalog(ig, [igtf, next]).snapshot.ruleId, igtf.id);
  assert.equal(previewReviewedIgtfEventFromCatalog({ ...ig, eventDate: '2027-01-01' }, [igtf, next]).snapshot.ruleId, next.id);
});
const mun = { tenantId: 'tenant-A', eventDate: '2026-09-15',
  municipalityCode: 'M1', activityCode: 'A1', operationKind: 'SERVICE',
  counterpartyClass: 'REGULAR', taxableBaseMinor: 101 };
const municipal = rule('MUNICIPAL', 'M1|A1|SERVICE|REGULAR');
test('#780 period evidence is order-independent and cannot double-count', () => {
  const events = [{ ...mun, eventId: 'event-2' }, { ...mun, eventId: 'event-1' }];
  const input = { tenantId: 'tenant-A', period: '2026-09', events };
  const a = previewReviewedMunicipalPeriodFromCatalog(input, [municipal]);
  const b = previewReviewedMunicipalPeriodFromCatalog({ ...input, events: [...events].reverse() }, [municipal]);
  assert.deepEqual(a, b);
  assert.equal(a.taxMinor, 102);
  assert.equal(a.mode, 'NON_POSTING_PREVIEW');
  assert.throws(() => previewReviewedMunicipalPeriodFromCatalog({ ...input, events: [events[0], events[0]] }, [municipal]));
  assert.throws(() => previewReviewedMunicipalPeriodFromCatalog({ ...input, period: '2026-08' }, [municipal]));
  assert.throws(() => previewReviewedMunicipalPeriodFromCatalog(input, [municipal, { ...municipal, id: 'overlap' }]));
  const otherEvent = { ...events[0], eventId: 'event-3', municipalityCode: 'M2' };
  const otherRule = { ...municipal, id: 'municipality-m2', selector: 'M2|A1|SERVICE|REGULAR' };
  assert.throws(() => previewReviewedMunicipalPeriodFromCatalog(
    { ...input, events: [events[0], otherEvent] }, [municipal, otherRule]));

});
test('#781 payroll period and effective event month are tied', () => {
  const payroll = { tenantId: 'tenant-A', eventDate: '2026-09-15', payrollPeriod: '2026-09',
    employeeId: 'employee-1', payrollClass: 'PAY', riskClass: 'RISK', grossMinor: 101 };
  const contribution = { side: 'WORKER', baseMinor: 101, rule: rule('IVSS', 'PAY|RISK|WORKER') };
  assert.equal(previewReviewedPayrollContributions(payroll, [contribution]).workerDeductionsMinor, 51);
  assert.throws(() => previewReviewedPayrollContributions({ ...payroll, eventDate: '2026-10-01' }, [contribution]));
  assert.throws(() => previewReviewedPayrollContributions({ ...payroll, eventDate: '' }, [contribution]));
});
