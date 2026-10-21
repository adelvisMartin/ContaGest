/**
 * POS change preview only. It is NOT payment acceptance, invoice posting,
 * FX conversion or a replacement for financial Decimal/ledger authorities.
 * The caller must independently validate a server-computed invoice amount.
 * This boundary accepts only exact decimal strings (scale 2), never floats.
 */
export type PosTenderMethod = 'cash' | 'card' | 'transfer';
export type PosTenderLine = Readonly<{ method: PosTenderMethod; currency: string; amount: string }>;
export type PosTenderPreviewInput = Readonly<{
  currency: string;
  due: string;
  tenders: readonly PosTenderLine[];
}>;
export type PosTenderPreview = Readonly<{
  currency: string;
  due: string;
  paid: string;
  remaining: string;
  change: string;
  status: 'pending' | 'exact' | 'change';
  /** Non-authoritative amounts for display; no allocation or posting is performed. */
  cashTendered: string;
  nonCashTendered: string;
}>;

export type PosTenderErrorCode =
  | 'INVALID_INPUT' | 'INVALID_CURRENCY' | 'INVALID_MONEY'
  | 'INVALID_METHOD' | 'NONCASH_OVERPAYMENT' | 'CURRENCY_MISMATCH'
  | 'AMOUNT_OVERFLOW';

export class PosTenderPreviewError extends Error {
  readonly code: PosTenderErrorCode;
  constructor(code: PosTenderErrorCode) {
    super('POS_TENDER_' + code);
    this.code = code;
    this.name = 'PosTenderPreviewError';
  }
}

const MAX_MINOR = 999999999999999999n; // Decimal(18,2)
const MONEY = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,2})?$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_TENDERS = 12;

function currencyCode(value: unknown): string {
  if (typeof value !== 'string') throw new PosTenderPreviewError('INVALID_CURRENCY');
  const normalized = value.trim().toUpperCase();
  if (!CURRENCY.test(normalized)) throw new PosTenderPreviewError('INVALID_CURRENCY');
  return normalized;
}

function parseMinor(value: unknown): bigint {
  if (typeof value !== 'string' || !MONEY.test(value)) {
    throw new PosTenderPreviewError('INVALID_MONEY');
  }
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
  if (result > MAX_MINOR) throw new PosTenderPreviewError('AMOUNT_OVERFLOW');
  return result;
}

function formatMinor(value: bigint): string {
  if (value < 0n || value > MAX_MINOR) throw new PosTenderPreviewError('AMOUNT_OVERFLOW');
  return String(value / 100n) + '.' + (value % 100n).toString().padStart(2, '0');
}

/**
 * Fail-closed read-only check for a *single currency* tender proposal.
 * Card/transfer never receive cash change and cannot exceed invoice amount.
 * Cross-currency tenders require a separately authorized FX settlement path.
 */
export function previewPosTender(input: PosTenderPreviewInput): PosTenderPreview {
  if (!input || typeof input !== 'object' || !Array.isArray(input.tenders)
      || input.tenders.length > MAX_TENDERS) {
    throw new PosTenderPreviewError('INVALID_INPUT');
  }
  const currency = currencyCode(input.currency);
  const due = parseMinor(input.due);
  if (due === 0n) throw new PosTenderPreviewError('INVALID_MONEY');

  let cash = 0n;
  let nonCash = 0n;
  for (const tender of input.tenders) {
    if (!tender || typeof tender !== 'object') throw new PosTenderPreviewError('INVALID_INPUT');
    if (currencyCode(tender.currency) !== currency) {
      throw new PosTenderPreviewError('CURRENCY_MISMATCH');
    }
    if (tender.method !== 'cash' && tender.method !== 'card' && tender.method !== 'transfer') {
      throw new PosTenderPreviewError('INVALID_METHOD');
    }
    const amount = parseMinor(tender.amount);
    if (amount === 0n) throw new PosTenderPreviewError('INVALID_MONEY');
    if (tender.method === 'cash') cash += amount;
    else nonCash += amount;
    if (nonCash > due) throw new PosTenderPreviewError('NONCASH_OVERPAYMENT');
    if (cash > MAX_MINOR || nonCash > MAX_MINOR || cash + nonCash > MAX_MINOR) {
      throw new PosTenderPreviewError('AMOUNT_OVERFLOW');
    }
  }

  const paid = cash + nonCash;
  const remaining = paid < due ? due - paid : 0n;
  const change = paid > due ? paid - due : 0n;
  // TS Readonly is compile-time only. Prevent downstream UI code from
  // mutating a computed payment/change preview into a misleading receipt.
  return Object.freeze({
    currency,
    due: formatMinor(due),
    paid: formatMinor(paid),
    remaining: formatMinor(remaining),
    change: formatMinor(change),
    status: remaining > 0n ? 'pending' : change > 0n ? 'change' : 'exact',
    cashTendered: formatMinor(cash),
    nonCashTendered: formatMinor(nonCash)
  });
}
