import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFiscalBookReadiness } from '../backend/src/modules/fiscal/fiscal-book-readiness.ts';
import { buildCompliancePeriodReadiness } from '../backend/src/modules/fiscal/fiscal-compliance-readiness.ts';

const facts = Object.freeze({ currency: 'VES', controlNo: 'C-1', counterpartyId: 'client-1',
  subtotalExact: '100.00', ivaExact: '0.00', igtfExact: '1.00',
  retentionExact: '0.00', totalExact: '101.00' });
const invoice = Object.freeze({ id: 'invoice-1', tenantId: 'tenant-A', number: 'F-1',
  status: 'issued', issueDate: '2026-09-15T00:00:00.000Z', recordedFacts: facts });
const source = { tenantId: 'tenant-A', book: 'sales', fiscalPeriod: '2026-09', rows: [invoice] };

test('#782 exact stored invoice money changes readiness digest, not tax recalculation', () => {
  const a = buildFiscalBookReadiness(source);
  const b = buildFiscalBookReadiness({ ...source, rows: [{
    ...invoice, recordedFacts: { ...facts, igtfExact: '2.00' },
  }] });
  assert.notEqual(a.sourceEvidenceHash, b.sourceEvidenceHash);
  assert.equal(a.sources[0].recordedFacts.igtfExact, '1.00');
  assert.equal(a.status, 'BLOCKED_NOT_CERTIFIED');
  assert.ok(Object.isFrozen(a.sources[0].recordedFacts));
  assert.notEqual(a.sourceEvidenceHash, buildFiscalBookReadiness({
    ...source, rows: [{ ...invoice, recordedFacts: { ...facts, counterpartyId: 'client-2' } }],
  }).sourceEvidenceHash);
});

test('#782 malformed invoice facts, cross-tenant and duplicate numbers fail closed', () => {
  assert.throws(() => buildFiscalBookReadiness({ ...source, rows: [{
    ...invoice, recordedFacts: { ...facts, totalExact: '1e3' },
  }] }));
  assert.throws(() => buildFiscalBookReadiness({ ...source, rows: [{ ...invoice, tenantId: 'tenant-B' }] }));
  assert.throws(() => buildFiscalBookReadiness({ ...source, rows: [
    invoice, { ...invoice, id: 'invoice-2' },
  ] }));
});

const period = Object.freeze({ id: 'period-1', status: 'closed',
  recordedBalancesExact: { ivaDebit: '200.00', ivaCredit: '80.00', igtfPaid: '0.00' } });
const compliance = { tenantId: 'tenant-A', period: '2026-09', taxPeriod: period,
  declarations: [{ id: 'dec-1', kind: 'igtf', status: 'paid', amountExact: '50.00' }],
  closings: [{ module: 'igtf', status: 'closed' }], fiscalDocumentCount: 1 };

test('#783 persisted tax balance changes evidence but never verifies official filing', () => {
  const a = buildCompliancePeriodReadiness(compliance);
  const b = buildCompliancePeriodReadiness({ ...compliance, taxPeriod: {
    ...period, recordedBalancesExact: { ...period.recordedBalancesExact, igtfPaid: '1.00' },
  } });
  assert.notEqual(a.evidenceSha256, b.evidenceSha256);
  assert.equal(a.taxPeriod.recordedBalancesExact.igtfPaid, '0.00');
  assert.equal(a.status, 'BLOCKED_NOT_READY');
  assert.equal(a.officialFilingIntegration, false);
  assert.equal(a.safeToFileOrPay, false);
});

test('#783 reject malformed stored balance values and isolate tenant evidence', () => {
  assert.throws(() => buildCompliancePeriodReadiness({ ...compliance, taxPeriod: {
    ...period, recordedBalancesExact: { ...period.recordedBalancesExact, ivaDebit: 'NaN' },
  } }));
  const a = buildCompliancePeriodReadiness(compliance);
  const b = buildCompliancePeriodReadiness({ ...compliance, tenantId: 'tenant-B' });
  assert.notEqual(a.evidenceSha256, b.evidenceSha256);
});
