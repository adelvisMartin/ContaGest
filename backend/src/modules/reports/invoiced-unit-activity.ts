/**
 * Tenant-owned invoice LINE quantities are commercial evidence only.
 * This is gross invoiced units, never unmet demand, cash, outbound stock,
 * financial valuation, or authorization to procure.
 */
export const INVOICED_UNIT_ACTIVITY_VERSION = 'gross-invoiced-units-v1';
export const INVOICED_UNIT_STATUSES = Object.freeze(['issued', 'paid', 'overdue'] as const);

type DecimalText = string | { toString(): string };
type InvoiceLineEvidence = {
  id: string;
  quantity: DecimalText;
  invoice: {
    id: string;
    number: string;
    issueDate: Date;
    status: string;
    currency: string;
  };
};

export function exactInvoicedUnits(input: DecimalText | null | undefined): string {
  const value = input === null || input === undefined ? '0' : input.toString();
  if (!/^\d{1,30}(?:\.\d{1,3})?$/.test(value)) {
    throw new TypeError('INVOICED_UNIT_QUANTITY_INVALID');
  }
  const [whole, part = ''] = value.split('.');
  const normalized = BigInt(whole);
  return String(normalized) + '.' + part.padEnd(3, '0');
}

export function summarizeInvoicedUnitActivity(input: {
  totalQuantity: DecimalText | null;
  lineCount: number;
  rows: readonly InvoiceLineEvidence[];
  take: number;
  skip: number;
  windowDays: number;
  asOf: Date;
}) {
  const { lineCount, rows, take, skip, windowDays, asOf } = input;
  if (![lineCount, take, skip, windowDays].every(Number.isSafeInteger) ||
      lineCount < 0 || take < 1 || take > 100 || skip < 0 || skip > 1_000_000 ||
      windowDays < 1 || windowDays > 365 || !Number.isFinite(asOf.getTime()) ||
      rows.length !== Math.min(take, Math.max(0, lineCount - skip))) {
    throw new TypeError('INVOICED_UNIT_RESULT_INVALID');
  }
  const projected = rows.map(row => {
    if (!row.id || !row.invoice?.id || !row.invoice.number ||
        !/^[A-Z][A-Z0-9]{2,7}$/.test(row.invoice.currency) ||
        !INVOICED_UNIT_STATUSES.includes(row.invoice.status as typeof INVOICED_UNIT_STATUSES[number]) ||
        !(row.invoice.issueDate instanceof Date) ||
        !Number.isFinite(row.invoice.issueDate.getTime()) ||
        row.invoice.issueDate.getTime() > asOf.getTime()) {
      throw new TypeError('INVOICED_UNIT_EVIDENCE_INVALID');
    }
    return {
      lineId: row.id,
      invoiceId: row.invoice.id,
      invoiceNumber: row.invoice.number,
      invoiceDate: row.invoice.issueDate.toISOString(),
      invoiceStatus: row.invoice.status,
      invoiceCurrency: row.invoice.currency,
      quantityExact: exactInvoicedUnits(row.quantity)
    };
  });
  const hasMore = skip + rows.length < lineCount;
  return {
    version: INVOICED_UNIT_ACTIVITY_VERSION,
    authority: 'SalesInvoiceLine.quantity+SalesInvoice.status/issueDate',
    interpretation: 'GROSS_INVOICED_PRODUCT_UNITS_NOT_DEMAND_FORECAST',
    statuses: [...INVOICED_UNIT_STATUSES],
    windowDays,
    asOf: asOf.toISOString(),
    summary: {
      invoicedLineCount: lineCount,
      grossInvoicedUnitsExact: exactInvoicedUnits(input.totalQuantity),
      excludesDraftAndCancelled: true,
      returnOrCreditNetting: false,
      demandForecast: false,
      physicalStockOutbound: false,
      automaticPurchasing: false
    },
    rows: projected,
    pagination: {
      skip,
      take,
      hasMore,
      nextSkip: hasMore ? skip + rows.length : null,
      scope: 'INVOICE_LINE_PAGE',
      consistency: 'REQUEST_SNAPSHOT_ONLY'
    }
  };
}
