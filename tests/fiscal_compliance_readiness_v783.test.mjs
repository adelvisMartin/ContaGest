import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompliancePeriodReadiness } from '../backend/src/modules/fiscal/fiscal-compliance-readiness.ts';

const original = Object.freeze({
  tenantId: 'tenant-A', period: '2026-09',
  taxPeriod: { id: 'tax-1', status: 'closed' },
  declarations: [
    { id: 'decl-b', kind: 'iva', status: 'filed', amountExact: '120.00' },
    { id: 'decl-a', kind: 'islr', status: 'paid', amountExact: '-5.20' },
  ],
  closings: [{ module: 'iva', status: 'closed' }, { module: 'fiscal', status: 'closed' }],
  fiscalDocumentCount: 3,
});
const fail = fn => assert.throws(fn, { message: 'COMPLIANCE_PERIOD_EVIDENCE_INVALID' });
test('#783 internal filed/paid/closed flags never certify official filing or reconciliation', () => {
  const r = buildCompliancePeriodReadiness(original);
  assert.equal(r.status, 'BLOCKED_NOT_READY');
  assert.equal(r.officialFilingIntegration, false);
  assert.equal(r.safeToFileOrPay, false);
  assert.equal(r.declarations[0].externalFiling, 'NOT_VERIFIED');
  assert.equal(r.declarations[1].bankReconciliation, 'NOT_VERIFIED');
  assert.ok(r.blockers.includes('LEGAL_RULE_PROVENANCE_NOT_LINKED'));
});
test('#783 digest stable independent of DB record ordering', () => {
  const r = buildCompliancePeriodReadiness(original);
  const reordered = buildCompliancePeriodReadiness({
    ...original, declarations: [...original.declarations].reverse(), closings: [...original.closings].reverse(),
  });
  assert.equal(r.evidenceSha256, reordered.evidenceSha256);
  assert.match(r.evidenceSha256, /^[0-9a-f]{64}$/);
  assert.ok(Object.isFrozen(r.declarations));
});
test('#783 different tenants and periods never share the same digest', () => {
  const a = buildCompliancePeriodReadiness(original);
  const b = buildCompliancePeriodReadiness({ ...original, tenantId: 'tenant-B' });
  const c = buildCompliancePeriodReadiness({ ...original, period: '2026-10' });
  assert.notEqual(a.evidenceSha256, b.evidenceSha256);
  assert.notEqual(a.evidenceSha256, c.evidenceSha256);
});
test('#783 unknown period remains blocked with no fabricated obligations', () => {
  const report = buildCompliancePeriodReadiness({
    tenantId: 'tenant-A', period: '2026-10', taxPeriod: null,
    declarations: [], closings: [], fiscalDocumentCount: 0,
  });
  assert.equal(report.declarations.length, 0);
  assert.ok(report.blockers.includes('TAX_PERIOD_NOT_REGISTERED'));
  assert.ok(report.blockers.includes('NO_DECLARATIONS_TO_REVIEW'));
});
test('#783 reject cross-source duplicates, untrusted status and amounts', () => {
  fail(() => buildCompliancePeriodReadiness({ ...original, declarations: [original.declarations[0], original.declarations[0]] }));
  fail(() => buildCompliancePeriodReadiness({ ...original, declarations: [{ ...original.declarations[0], amountExact: '1e10' }] }));
  fail(() => buildCompliancePeriodReadiness({ ...original, declarations: [{ ...original.declarations[0], kind: 'unknown' }] }));
  fail(() => buildCompliancePeriodReadiness({ ...original, taxPeriod: null }));
});
test('#783 reject unbounded inputs and malformed calendar periods', () => {
  fail(() => buildCompliancePeriodReadiness({ ...original, period: '2026-13' }));
  fail(() => buildCompliancePeriodReadiness({ ...original, tenantId: '' }));
  fail(() => buildCompliancePeriodReadiness({ ...original, fiscalDocumentCount: -1 }));
  fail(() => buildCompliancePeriodReadiness({ ...original, declarations: Array.from({ length: 201 }, (_, i) => ({...original.declarations[0], id:String(i) })) }));
  fail(() => buildCompliancePeriodReadiness({ ...original, closings: [{ module: 'iva', status: 'closed' }, { module: 'iva', status: 'open' }] }));
});
