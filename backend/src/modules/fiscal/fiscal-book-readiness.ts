import { createHash } from 'node:crypto';
import { summarizeRecordedMoney, parseRecordedMinor } from './fiscal-recorded-money.js';

// #782: diagnostic of real commercial-document coverage, NOT a tax book.
// FiscalDocument has no verified FK to SalesInvoice/PurchaseInvoice in this schema.
export type FiscalBookKind = 'sales' | 'purchases';
export type FiscalSourceRow = Readonly<{
  id: string; tenantId: string; number: string;
  status: string; issueDate: string;
  recordedFacts?: Readonly<{ currency: string; controlNo: string | null; counterpartyId: string | null;
    subtotalExact: string; ivaExact: string; igtfExact: string; retentionExact: string; totalExact: string }>;
}>;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const SHA_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function blocked(): never { throw new Error('FISCAL_BOOK_SOURCE_NOT_VERIFIABLE'); }
export function buildFiscalBookReadiness(input: Readonly<{
  tenantId: string; fiscalPeriod: string; book: FiscalBookKind;
  rows: readonly FiscalSourceRow[];
}>) {
  if (!input || typeof input.tenantId !== 'string' || !input.tenantId.trim() ||
      !PERIOD.test(input.fiscalPeriod) || !['sales', 'purchases'].includes(input.book) ||
      !Array.isArray(input.rows) || input.rows.length > 500) blocked();
  const seen = new Set<string>();
  const numbers = new Set<string>();
  const evidence = input.rows.map((row) => {
    if (!row || row.tenantId !== input.tenantId ||
        typeof row.id !== 'string' || !row.id.trim() || seen.has(row.id) ||
        typeof row.number !== 'string' || !row.number.trim() || numbers.has(row.number) ||
        !['draft', 'issued', 'paid', 'cancelled', 'overdue'].includes(row.status) ||
        typeof row.issueDate !== 'string' || !SHA_DATE.test(row.issueDate) ||
        !Number.isFinite(Date.parse(row.issueDate)) ||
        new Date(row.issueDate).toISOString() !== row.issueDate) blocked();
    seen.add(row.id);
    numbers.add(row.number);
    const f = row.recordedFacts;
    if (f !== undefined && (
      !f || typeof f !== 'object' || Object.keys(f).length !== 8 ||
      !/^[A-Z]{3}$/.test(f.currency) ||
      (f.controlNo !== null && (typeof f.controlNo !== 'string' || f.controlNo.length > 160)) ||
      (f.counterpartyId !== null && (typeof f.counterpartyId !== 'string' || !f.counterpartyId.trim())) ||
      ![f.subtotalExact, f.ivaExact, f.igtfExact, f.retentionExact, f.totalExact].every(v => {
        try { parseRecordedMinor(v); return true; } catch { return false; }
      })
    )) blocked();
    const reasons = ['UNLINKED_FISCAL_PROVENANCE'];
    if (!f) reasons.push('RECORDED_FINANCIAL_FACTS_NOT_CAPTURED');
    if (row.status === 'draft') reasons.push('DRAFT_SOURCE');
    if (row.status === 'cancelled') reasons.push('CANCELLATION_RECONCILIATION_REQUIRED');
    if (row.issueDate.slice(0, 7) !== input.fiscalPeriod) reasons.push('ISSUE_DATE_PERIOD_REVIEW_REQUIRED');
    return Object.freeze({ sourceId: row.id, number: row.number,
      issueDate: row.issueDate, sourceStatus: row.status,
      recordedFacts: f ? Object.freeze({ ...f }) : null,
      blockers: Object.freeze(reasons) });
  }).sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0);
  // Report recorded amounts only; never treat invoice sums as certified fiscal liability.
  // Null means at least one legacy source lacks trustworthy recorded money evidence.
  const recordedCurrencyTotals = evidence.every(row => row.recordedFacts !== null)
    ? summarizeRecordedMoney(evidence.map(row => row.recordedFacts!)) : null;
  const digest = createHash('sha256').update(JSON.stringify({
    tenantId: input.tenantId, fiscalPeriod: input.fiscalPeriod, book: input.book, evidence,
  }), 'utf8').digest('hex');
  return Object.freeze({
    tenantId: input.tenantId, fiscalPeriod: input.fiscalPeriod, book: input.book,
    sourceCount: evidence.length, sourceEvidenceHash: digest, recordedCurrencyTotals,
    sources: Object.freeze(evidence),
    status: 'BLOCKED_NOT_CERTIFIED' as const,
    reason: evidence.length ? 'UNLINKED_FISCAL_PROVENANCE' : 'EMPTY_PERIOD_NOT_CERTIFIED',
  });
}
