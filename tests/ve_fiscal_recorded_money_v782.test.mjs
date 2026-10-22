import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecordedMinor, formatRecordedMinor, summarizeRecordedMoney } from '../backend/src/modules/fiscal/fiscal-recorded-money.ts';
import { buildFiscalBookReadiness } from '../backend/src/modules/fiscal/fiscal-book-readiness.ts';

const row = (currency, id, exact) => Object.freeze({
  id, tenantId: 't-A', number: 'F-' + id, status: 'issued',
  issueDate: '2026-09-01T00:00:00.000Z',
  recordedFacts: { currency, controlNo: null, counterpartyId: 'c-1',
    subtotalExact: exact, ivaExact: '0', igtfExact: '0', retentionExact: '0', totalExact: exact },
});
test('#782 exact decimal parse, formatting and large safe sums', () => {
  assert.equal(parseRecordedMinor('1.01'), 101n);
  assert.equal(parseRecordedMinor('1.2'), 120n);
  assert.equal(parseRecordedMinor('-0.01'), -1n);
  assert.equal(formatRecordedMinor(-1n), '-0.01');
  assert.equal(formatRecordedMinor(123456789012345678900n), '1234567890123456789.00');
  const totals = summarizeRecordedMoney([
    { ...row('VES', '1', '999999999999999999.99').recordedFacts },
    { ...row('VES', '2', '0.01').recordedFacts },
  ]);
  assert.equal(totals[0].recordedTotalsExact.subtotalExact, '1000000000000000000.00');
});
test('#782 mixed currency is separated, canonically ordered, and hash stays stable', () => {
  const rows = [row('USD', '3', '12.34'), row('VES', '1', '7'), row('USD', '2', '0.66')];
  const opts = { tenantId: 't-A', fiscalPeriod: '2026-09', book: 'sales', rows };
  const a = buildFiscalBookReadiness(opts);
  const b = buildFiscalBookReadiness({ ...opts, rows: [...rows].reverse() });
  assert.deepEqual(a, b);
  assert.deepEqual(a.recordedCurrencyTotals.map(x => x.currency), ['USD', 'VES']);
  assert.equal(a.recordedCurrencyTotals[0].recordedTotalsExact.totalExact, '13.00');
  assert.equal(a.recordedCurrencyTotals[1].recordedTotalsExact.totalExact, '7.00');
  assert.equal(a.status, 'BLOCKED_NOT_CERTIFIED');
  assert.ok(Object.isFrozen(a.recordedCurrencyTotals));
});
test('#782 legacy rows are not summed as if their monetary facts were verified', () => {
  const opts = { tenantId: 't-A', fiscalPeriod: '2026-09', book: 'sales', rows: [
    row('VES', '1', '1.00'),
    { id: 'legacy', tenantId: 't-A', number: 'F-legacy', status: 'issued',
      issueDate: '2026-09-03T00:00:00.000Z' },
  ] };
  const report = buildFiscalBookReadiness(opts);
  assert.equal(report.recordedCurrencyTotals, null);
  assert.ok(report.sources[1].blockers.includes('RECORDED_FINANCIAL_FACTS_NOT_CAPTURED'));
});
test('#782 non-canonical, exponent, out-of-range, injected and unsafe money rejects', () => {
  for (const value of ['NaN', '1e3', '01.00', '0.001', '1,00', '', '+3.00', '9'.repeat(19)]) {
    assert.throws(() => parseRecordedMinor(value), { message: 'FISCAL_RECORDED_MONEY_INVALID' });
  }
  assert.throws(() => summarizeRecordedMoney([{
    ...row('VES', '1', '1.00').recordedFacts, currency: 'US$',
  }]));
});
