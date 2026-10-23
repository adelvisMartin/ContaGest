/** Exact-decimal evidence projection from already persisted commercial documents.
 * This is not a VAT/IGTF formula, posting, tax liability or FX conversion. */
export type RecordedMoney = Readonly<{
  currency: string;
  subtotalExact: string;
  ivaExact: string;
  igtfExact: string;
  retentionExact: string;
  totalExact: string;
}>;

const FIELDS = ['subtotalExact', 'ivaExact', 'igtfExact', 'retentionExact', 'totalExact'] as const;
type Field = (typeof FIELDS)[number];
const DECIMAL = /^(-?)(0|[1-9]\d{0,17})(?:\.(\d{1,2}))?$/;

function reject(): never { throw new Error('FISCAL_RECORDED_MONEY_INVALID'); }

export function parseRecordedMinor(value: string): bigint {
  if (typeof value !== 'string') reject();
  const match = DECIMAL.exec(value);
  if (!match) reject();
  const minor = BigInt(match[2]) * 100n + BigInt((match[3] || '').padEnd(2, '0'));
  return match[1] === '-' ? -minor : minor;
}

export function formatRecordedMinor(minor: bigint): string {
  const magnitude = minor < 0n ? -minor : minor;
  const whole = magnitude / 100n;
  const cents = String(magnitude % 100n).padStart(2, '0');
  return (minor < 0n ? '-' : '') + whole.toString() + '.' + cents;
}

/** No mixing of currencies, summing JS floats, or conflating evidence with tax owed. */
export function summarizeRecordedMoney(rows: readonly RecordedMoney[]) {
  if (!Array.isArray(rows) || rows.length > 500) reject();
  const totals = new Map<string, { count: number; amounts: Record<Field, bigint> }>();
  for (const row of rows) {
    if (!row || typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency)) reject();
    let aggregate = totals.get(row.currency);
    if (!aggregate) {
      aggregate = { count: 0, amounts: {
        subtotalExact: 0n, ivaExact: 0n, igtfExact: 0n, retentionExact: 0n, totalExact: 0n,
      } };
      totals.set(row.currency, aggregate);
    }
    aggregate.count++;
    for (const field of FIELDS) aggregate.amounts[field] += parseRecordedMinor(row[field]);
  }
  return Object.freeze([...totals.entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([currency, aggregate]) => Object.freeze({
      currency, documentCount: aggregate.count,
      recordedTotalsExact: Object.freeze(Object.fromEntries(FIELDS.map(field =>
        [field, formatRecordedMinor(aggregate.amounts[field])])) as Record<Field, string>),
    })));
}
