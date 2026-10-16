import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VE_PAYROLL_CONTRIBUTION_FAMILIES, previewVePayrollContribution,
} from '../backend/src/modules/fiscal/ve-payroll-contribution-preview.ts';

const fixture = (overrides = {}) => ({
  id: 'source-version-1', tenantId: 'tenant-A', family: 'FAOV',
  selector: 'PAYROLL/EMPLOYEE/STANDARD', version: 1,
  effectiveFrom: '2026-01-01', effectiveTo: '2027-01-01', status: 'ACTIVE',
  sourceId: 'test-only-source', sourceReference: 'SYNTHETIC_TEST_FIXTURE_NOT_LAW',
  sourceContentSha256: 'a'.repeat(64), reviewedBy: 'test-reviewer',
  reviewedAt: '2026-01-02T00:00:00.000Z', numerator: 1, denominator: 2,
  ...overrides,
});
const input = (overrides = {}) => ({
  tenantId: 'tenant-A', payrollRunId: 'run-001', employeeId: 'employee-001',
  eventDate: '2026-06-01', family: 'FAOV', side: 'EMPLOYEE',
  selector: 'STANDARD', baseMinor: 101, ...overrides,
});
const reject = (rules, value) => assert.throws(
  () => previewVePayrollContribution(rules, value),
  /VE_(PAYROLL_CONTRIBUTION|FISCAL_RULE)_NOT_AUTHORIZED/,
);

test('#781 yields a deterministic, read-only snapshot from a reviewed synthetic rule', () => {
  const r = fixture();
  const first = previewVePayrollContribution([r], input());
  assert.equal(first.contributionMinor, 51);
  assert.equal(first.side, 'EMPLOYEE');
  assert.equal(first.previewOnly, true);
  assert.equal(first.reviewedRuleSnapshotSha256.length, 64);
  assert.equal(first.previewSha256.length, 64);
  assert.deepEqual(first, previewVePayrollContribution([r], input()));
  assert.ok(Object.isFrozen(first));
  assert.equal(r.numerator, 1);
});

test('#781 never supplies rates or payroll/ledger actions when no authority exists', () => {
  reject([], input());
  reject([fixture({ status: 'DRAFT' })], input());
  reject([fixture({ status: 'REVIEWED' })], input());
  reject([fixture({ sourceContentSha256: '' })], input());
  const result = previewVePayrollContribution([fixture()], input());
  for (const illegal of ['postingId', 'journalEntry', 'paid', 'withheld', 'taxRateDefault']) {
    assert.equal(Object.hasOwn(result, illegal), false);
  }
});

test('#781 maintains tenant and employee-vs-employer isolation', () => {
  reject([fixture()], input({ tenantId: 'tenant-B' }));
  reject([fixture()], input({ side: 'EMPLOYER' }));
  reject([fixture({ tenantId: 'tenant-B' })], input());
  const employer = fixture({ id: 'employer-v1', selector: 'PAYROLL/EMPLOYER/STANDARD' });
  assert.equal(previewVePayrollContribution([employer], input({ side: 'EMPLOYER' })).side, 'EMPLOYER');
  assert.notEqual(
    previewVePayrollContribution([fixture()], input()).previewSha256,
    previewVePayrollContribution([employer], input({ side: 'EMPLOYER' })).previewSha256,
  );
});

test('#781 supports only FAOV, IVSS and INCES with explicit reviewed selectors', () => {
  assert.deepEqual([...VE_PAYROLL_CONTRIBUTION_FAMILIES], ['FAOV', 'IVSS', 'INCES']);
  for (const family of VE_PAYROLL_CONTRIBUTION_FAMILIES) {
    const result = previewVePayrollContribution([fixture({ family })], input({ family }));
    assert.equal(result.family, family);
  }
  reject([fixture()], input({ family: 'IVA' }));
  reject([fixture()], input({ family: 'ISLR' }));
  reject([fixture()], input({ selector: 'OTHER' }));
  reject([fixture()], input({ selector: 'STANDARD/EMPLOYER' }));
});

test('#781 respects effective intervals and rejects ambiguous overlaps', () => {
  assert.equal(previewVePayrollContribution([fixture()], input({ eventDate: '2026-01-01' })).contributionMinor, 51);
  reject([fixture()], input({ eventDate: '2027-01-01' }));
  reject([fixture()], input({ eventDate: '2025-12-31' }));
  reject([fixture()], input({ eventDate: '2026-02-30' }));
  reject([fixture(), fixture({ id: 'duplicate', version: 2 })], input());
});

test('#781 requires explicit, bounded IDs and selector', () => {
  for (const value of [
    { tenantId: '' }, { tenantId: ' tenant-A' }, { payrollRunId: '' },
    { employeeId: '' }, { employeeId: 'x'.repeat(129) },
    { employeeId: 'employee\n002' }, { payrollRunId: 'run\r2' },
    { side: 'ALL' }, { side: undefined }, { selector: '' },
    { selector: 'lowercase' }, { selector: 'x'.repeat(65) },
  ]) reject([fixture()], input(value));
  reject(null, input());
  reject([fixture()], null);
});

test('#781 rejects unsafe money and preserves canonical exact minor-unit rounding', () => {
  for (const amount of [-1, 0.3, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    reject([fixture()], input({ baseMinor: amount }));
  }
  assert.equal(previewVePayrollContribution([fixture()], input({ baseMinor: 0 })).contributionMinor, 0);
  assert.equal(previewVePayrollContribution([fixture()], input({ baseMinor: 1 })).contributionMinor, 1);
});

test('#781 identity and rule changes alter the snapshot without changing old previews', () => {
  const a = previewVePayrollContribution([fixture()], input());
  const variants = [
    input({ employeeId: 'employee-002' }),
    input({ payrollRunId: 'run-002' }),
    input({ baseMinor: 102 }),
  ];
  for (const data of variants) {
    assert.notEqual(a.previewSha256, previewVePayrollContribution([fixture()], data).previewSha256);
  }
  const next = previewVePayrollContribution([fixture({ id: 'rule-v2', version: 2 })], input());
  assert.notEqual(next.previewSha256, a.previewSha256);
  assert.equal(a.contributionMinor, 51);
});
