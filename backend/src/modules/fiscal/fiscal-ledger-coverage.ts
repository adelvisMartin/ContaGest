import { createHash } from 'node:crypto';
import { formatRecordedMinor, parseRecordedMinor } from './fiscal-recorded-money.js';

/** Immutable evidence of existing commercial source → posted GL entries.
 * Zero certification: neither a legal tax snapshot nor a real tax subledger. */
export type FiscalLedgerLine = Readonly<{
  currency: string; accountCode: string; debitExact: string; creditExact: string;
}>;
export type FiscalLedgerSource = Readonly<{
  id: string; tenantId: string; fiscalPeriod: string; posted: boolean;
  reversalOfId: string | null; reversedById: string | null;
  lines: readonly FiscalLedgerLine[];
}>;
const reject = (): never => { throw new Error('FISCAL_LEDGER_EVIDENCE_INVALID'); };
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const CURRENCY = /^[A-Z]{3}$/;
function byteOrder(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }

export function buildFiscalLedgerCoverage(
  tenantId: string, period: string, rows: readonly FiscalLedgerSource[],
) {
  if (!tenantId || !PERIOD.test(period) || !Array.isArray(rows) || rows.length > 3) reject();
  const seen = new Set<string>();
  const entries = rows.map(row => {
    if (!row || typeof row.id !== 'string' || !row.id.trim() || seen.has(row.id) ||
        row.tenantId !== tenantId || !PERIOD.test(row.fiscalPeriod) ||
        typeof row.posted !== 'boolean' || !Array.isArray(row.lines) || row.lines.length > 40 ||
        (row.reversalOfId !== null && typeof row.reversalOfId !== 'string') ||
        (row.reversedById !== null && typeof row.reversedById !== 'string')) reject();
    seen.add(row.id);
    const balances = new Map<string, { debit: bigint; credit: bigint }>();
    for (const line of row.lines) {
      if (!line || !CURRENCY.test(line.currency) || !line.accountCode?.trim()) reject();
      const debit = parseRecordedMinor(line.debitExact);
      const credit = parseRecordedMinor(line.creditExact);
      if (debit < 0n || credit < 0n || (debit > 0n && credit > 0n)) reject();
      const aggregate = balances.get(line.currency) || { debit: 0n, credit: 0n };
      aggregate.debit += debit;
      aggregate.credit += credit;
      balances.set(line.currency, aggregate);
    }
    const currencyBalances = [...balances.entries()].sort(([a], [b]) => byteOrder(a, b))
      .map(([currency, value]) => Object.freeze({
        currency, debitExact: formatRecordedMinor(value.debit),
        creditExact: formatRecordedMinor(value.credit),
        balanced: value.debit === value.credit && value.debit > 0n,
      }));
    const blockers = [
      ...(!row.posted ? ['GL_UNPOSTED'] : []),
      ...(row.fiscalPeriod !== period ? ['GL_WRONG_FISCAL_PERIOD'] : []),
      ...(row.reversalOfId || row.reversedById ? ['GL_REVERSAL_REQUIRES_RECONCILIATION'] : []),
      ...(!currencyBalances.length || currencyBalances.some(b => !b.balanced) ? ['GL_NOT_BALANCED'] : []),
    ];
    return Object.freeze({ entryId: row.id, posted: row.posted, fiscalPeriod: row.fiscalPeriod,
      currencyBalances: Object.freeze(currencyBalances), blockers: Object.freeze(blockers) });
  }).sort((a, b) => byteOrder(a.entryId, b.entryId));
  const blockers = entries.length === 0
    ? ['GL_NOT_LINKED'] : [...new Set(entries.flatMap(entry => entry.blockers))].sort(byteOrder);
  const hash = createHash('sha256').update(JSON.stringify({
    tenantId, period, entries,
  })).digest('hex');
  return Object.freeze({ ledgerEntryCount: entries.length, entries: Object.freeze(entries),
    blockers: Object.freeze(blockers), evidenceSha256: hash });
}
