import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFiscalLedgerCoverage } from '../backend/src/modules/fiscal/fiscal-ledger-coverage.ts';
import { buildFiscalBookReadiness } from '../backend/src/modules/fiscal/fiscal-book-readiness.ts';

const ledger = Object.freeze({
  id: 'entry-1', tenantId: 'A', fiscalPeriod: '2026-09', posted: true,
  reversalOfId: null, reversedById: null,
  lines: [
    { currency: 'VES', accountCode: 'AR', debitExact: '116.00', creditExact: '0.00' },
    { currency: 'VES', accountCode: 'REVENUE', debitExact: '0.00', creditExact: '100.00' },
    { currency: 'VES', accountCode: 'VAT', debitExact: '0.00', creditExact: '16.00' },
  ],
});
const row = { id: 'invoice-1', tenantId: 'A', number: 'F-1',
  status: 'issued', issueDate: '2026-09-15T00:00:00.000Z',
  recordedFacts: { currency: 'VES', controlNo: 'C1', counterpartyId: 'client',
    subtotalExact: '100.00', ivaExact: '16.00', igtfExact: '0.00',
    retentionExact: '0.00', totalExact: '116.00' }, recordedLedger: [ledger] };
const params = { tenantId: 'A', fiscalPeriod: '2026-09', book: 'sales', rows: [row] };

test('#782 actual GL evidence is deterministic under line and entry reorder', () => {
  const a = buildFiscalBookReadiness(params);
  const reordered = buildFiscalBookReadiness({ ...params, rows: [{
    ...row, recordedLedger: [{ ...ledger, lines: [...ledger.lines].reverse() }],
  }] });
  assert.equal(a.status, 'BLOCKED_NOT_CERTIFIED');
  assert.equal(a.sources[0].ledger.entries[0].currencyBalances[0].balanced, true);
  assert.equal(a.sources[0].ledger.entries[0].currencyBalances[0].debitExact, '116.00');
  assert.equal(a.sources[0].ledger.entries[0].currencyBalances[0].creditExact, '116.00');
  assert.equal(a.sourceEvidenceHash, reordered.sourceEvidenceHash);
});
test('#782 GL rejects imbalance and cross-tenant injected entries', () => {
  const wrong = buildFiscalLedgerCoverage('A', '2026-09', [{
    ...ledger, lines: [...ledger.lines.slice(0, 2)],
  }]);
  assert.ok(wrong.blockers.includes('GL_NOT_BALANCED'));
  assert.throws(() => buildFiscalLedgerCoverage('A', '2026-09', [{ ...ledger, tenantId: 'B' }]));
  assert.throws(() => buildFiscalLedgerCoverage('A', '2026-09', [ledger, ledger]));
});
test('#782 reversed/posted/period signals are never treated as reconciled', () => {
  const coverage = buildFiscalLedgerCoverage('A', '2026-09', [{
    ...ledger, posted: false, reversalOfId: 'older-entry', fiscalPeriod: '2026-08',
  }]);
  assert.deepEqual(coverage.blockers, [
    'GL_REVERSAL_REQUIRES_RECONCILIATION', 'GL_UNPOSTED', 'GL_WRONG_FISCAL_PERIOD',
  ]);
  assert.ok(buildFiscalLedgerCoverage('A', '2026-09', []).blockers.includes('GL_NOT_LINKED'));
});
test('#782 multi-currency imbalance cannot cancel a wrong-currency journal', () => {
  const bad = buildFiscalLedgerCoverage('A', '2026-09', [{
    ...ledger, lines: [
      { currency: 'VES', accountCode: 'AR', debitExact: '1.00', creditExact: '0.00' },
      { currency: 'USD', accountCode: 'REVENUE', debitExact: '0.00', creditExact: '1.00' },
    ],
  }]);
  assert.equal(bad.entries[0].currencyBalances.length, 2);
  assert.ok(bad.blockers.includes('GL_NOT_BALANCED'));
});
test('#782 invalid recorded GL values reject rather than round or truncate', () => {
  assert.throws(() => buildFiscalLedgerCoverage('A', '2026-09', [{
    ...ledger, lines: [{ ...ledger.lines[0], debitExact: '1e12' }],
  }]));
  assert.throws(() => buildFiscalLedgerCoverage('A', '2026-09', [{
    ...ledger, lines: [{ ...ledger.lines[0], creditExact: '1.00' }],
  }]));
});

test('#782 GL digest changes when amounts move between accounts without changing total', () => {
  const base = buildFiscalBookReadiness(params);
  const changed = buildFiscalBookReadiness({ ...params, rows: [{
    ...row, recordedLedger: [{ ...ledger, lines: ledger.lines.map(line =>
      line.accountCode === 'REVENUE' ? { ...line, accountCode: 'UNAUTHORIZED_ACCOUNT' } : line) }],
  }] });
  assert.notEqual(base.sources[0].ledger.entries[0].ledgerLinesSha256,
    changed.sources[0].ledger.entries[0].ledgerLinesSha256);
  assert.notEqual(base.sourceEvidenceHash, changed.sourceEvidenceHash);
  assert.equal(base.sources[0].ledger.entries[0].currencyBalances[0].balanced, true);
  assert.equal(changed.sources[0].ledger.entries[0].currencyBalances[0].balanced, true);
});
test('#782 canonical GL digest normalizes equivalent recorded monetary notation', () => {
  const changed = buildFiscalBookReadiness({ ...params, rows: [{
    ...row, recordedLedger: [{ ...ledger, lines: ledger.lines.map(line =>
      line.accountCode === 'AR' ? { ...line, debitExact: '116.0' } : line) }],
  }] });
  assert.equal(buildFiscalBookReadiness(params).sourceEvidenceHash, changed.sourceEvidenceHash);
});
