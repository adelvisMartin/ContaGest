import test from 'node:test';
import assert from 'node:assert/strict';
import { parafiscalRuleSelector, previewReviewedPayrollContributions } from '../backend/src/modules/payroll/ve-parafiscal-breakdown-preview.ts';

// Values are synthetic; these are NOT Venezuela FAOV/IVSS/INCES rates or bases.
const event = Object.freeze({ tenantId: 't-A', employeeId: 'employee-1', payrollPeriod: '2026-09',
  eventDate: '2026-09-30', payrollClass: 'CATEGORY_A', riskClass: 'RISK_A', grossMinor: 10001 });
const rule = (family, side, numerator = 5) => ({ id: 'synthetic-' + family + '-' + side, tenantId: 't-A',
  family, selector: 'CATEGORY_A|RISK_A|' + side, version: 1,
  effectiveFrom: '2026-01-01', effectiveTo: '2027-01-01', status: 'ACTIVE',
  sourceId: 'synthetic-source', sourceReference: 'Synthetic fixture only',
  sourceContentSha256: 'c'.repeat(64), reviewedBy: 'synthetic-reviewer',
  reviewedAt: '2026-01-01T00:00:00Z', numerator, denominator: 100 });
const component = (family, side, numerator = 5) => ({ side, rule: rule(family, side, numerator), baseMinor: event.grossMinor });
const denied = (fn) => assert.throws(fn);
test('#781 exact payroll classification and side are part of the reviewed selector', () => {
  assert.equal(parafiscalRuleSelector(event, 'WORKER'), 'CATEGORY_A|RISK_A|WORKER');
  denied(() => parafiscalRuleSelector({ ...event, riskClass: 'A|B' }, 'WORKER'));
});
test('#781 separates worker deductions and employer liabilities without a posting', () => {
  const result = previewReviewedPayrollContributions(event, [component('IVSS', 'WORKER'), component('IVSS', 'EMPLOYER', 7)]);
  assert.equal(result.workerDeductionsMinor, 500);
  assert.equal(result.employerContributionsMinor, 700);
  assert.equal(result.workerAfterContributionsMinor, 9501);
  assert.equal(result.components[0].ruleSnapshot.sourceId, 'synthetic-source');
  assert.equal(result.mode, 'NON_POSTING_PREVIEW');
  assert.ok(Object.isFrozen(result.components));
});
test('#781 rejects wrong tenant, family, date and unreviewed source', () => {
  const c = component('FAOV', 'WORKER');
  denied(() => previewReviewedPayrollContributions({ ...event, tenantId: 't-B' }, [c]));
  denied(() => previewReviewedPayrollContributions(event, [{ ...c, rule: { ...c.rule, family: 'IVA' } }]));
  denied(() => previewReviewedPayrollContributions({ ...event, eventDate: '2027-01-01' }, [c]));
  denied(() => previewReviewedPayrollContributions(event, [{ ...c, rule: { ...c.rule, status: 'DRAFT' } }]));
});
test('#781 duplicate family/side or wrong payroll category is rejected', () => {
  const c = component('INCES', 'EMPLOYER');
  denied(() => previewReviewedPayrollContributions(event, [c, c]));
  denied(() => previewReviewedPayrollContributions({ ...event, payrollClass: 'OTHER' }, [c]));
  denied(() => previewReviewedPayrollContributions(event, [{ ...c, side: 'WORKER' }]));
});
test('#781 invalid bases and deductions greater than salary fail closed', () => {
  const c = component('IVSS', 'WORKER');
  denied(() => previewReviewedPayrollContributions(event, []));
  denied(() => previewReviewedPayrollContributions(event, [{ ...c, baseMinor: -1 }]));
  denied(() => previewReviewedPayrollContributions(event, [{ ...c, baseMinor: 10002 }]));
  denied(() => previewReviewedPayrollContributions(event, [{ ...c, baseMinor: 1.5 }]));
  denied(() => previewReviewedPayrollContributions(event, [{ ...c, rule: rule('IVSS', 'WORKER', 100) }, component('FAOV', 'WORKER', 100)]));
});
