/**
 * Manual-only signal: contrast CURRENT free product stock with HISTORICAL
 * gross invoiced units over a fixed window and a user-entered lead time.
 * Invoice throughput is not net demand, future demand, or physical dispatch.
 */
export const GROSS_INVOICE_LEADTIME_REVIEW_VERSION = 'gross-invoice-leadtime-review-v1';
const UNIT_SCALE = 1000n;

type Candidate = Readonly<{ productId: string; availableExact: string }>;
type Sale = Readonly<{
  productId: string;
  grossInvoicedUnitsExact: string;
  invoiceLineCount: number;
  evidenceAvailable: boolean;
}>;

export function parseGrossInvoiceLeadTime(raw: unknown, salesEnabled: boolean): number | null {
  if (raw === undefined) return null;
  if (salesEnabled !== true || typeof raw !== 'string' ||
      !/^[1-9]\d{0,2}$/.test(raw)) {
    throw new TypeError('INVOICE_LEADTIME_QUERY_INVALID');
  }
  const days = Number(raw);
  if (!Number.isSafeInteger(days) || days > 365) {
    throw new TypeError('INVOICE_LEADTIME_QUERY_INVALID');
  }
  return days;
}

function parseExactUnits(text: string): bigint {
  if (typeof text !== 'string' || !/^(0|[1-9]\d{0,14})(?:\.\d{1,3})?$/.test(text)) {
    throw new TypeError('INVOICE_LEADTIME_QUANTITY_INVALID');
  }
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * UNIT_SCALE + BigInt(fraction.padEnd(3, '0'));
}

function asExact(units: bigint): string {
  return String(units / UNIT_SCALE) + '.' + String(units % UNIT_SCALE).padStart(3, '0');
}

export function projectGrossInvoiceLeadTimeReview(input: {
  candidates: readonly Candidate[];
  salesItems: readonly Sale[];
  salesWindowDays: number;
  leadTimeDays: number;
}) {
  const { candidates, salesItems, salesWindowDays, leadTimeDays } = input;
  if (!Number.isSafeInteger(salesWindowDays) || salesWindowDays < 1 || salesWindowDays > 365 ||
      !Number.isSafeInteger(leadTimeDays) || leadTimeDays < 1 || leadTimeDays > 365 ||
      candidates.length !== salesItems.length || candidates.length > 1000) {
    throw new TypeError('INVOICE_LEADTIME_INPUT_INVALID');
  }
  const seen = new Set<string>();
  const rows = candidates.map((candidate, index) => {
    const sale = salesItems[index];
    if (!candidate?.productId || seen.has(candidate.productId) ||
        sale?.productId !== candidate.productId ||
        !Number.isSafeInteger(sale.invoiceLineCount) || sale.invoiceLineCount < 0 ||
        typeof sale.evidenceAvailable !== 'boolean') {
      throw new TypeError('INVOICE_LEADTIME_EVIDENCE_INVALID');
    }
    seen.add(candidate.productId);
    const available = parseExactUnits(candidate.availableExact);
    const gross = parseExactUnits(sale.grossInvoicedUnitsExact);
    if ((gross === 0n) !== (sale.invoiceLineCount === 0) ||
        sale.evidenceAvailable !== (sale.invoiceLineCount > 0)) {
      throw new TypeError('INVOICE_LEADTIME_EVIDENCE_INVALID');
    }
    // Preserve full precision for comparison; rounding the displayed coverage
    // first could otherwise change the risk at the lead-time boundary.
    const coverageCentidays = gross > 0n
      ? (2n * available * BigInt(salesWindowDays) * 100n + gross) / (2n * gross)
      : null;
    const reviewStatus = available === 0n ? 'NO_FREE_STOCK' : gross === 0n
      ? 'NO_GROSS_INVOICES_IN_WINDOW' :
      available * BigInt(salesWindowDays) <= gross * BigInt(leadTimeDays)
        ? 'AT_OR_BELOW_LEADTIME_PROXY' : 'ABOVE_LEADTIME_PROXY';
    return {
      productId: candidate.productId,
      availableExact: asExact(available),
      grossInvoicedUnitsExact: asExact(gross),
      invoiceLineCount: sale.invoiceLineCount,
      observedCoverageDaysExact: coverageCentidays === null ? null :
        String(coverageCentidays / 100n) + '.' + String(coverageCentidays % 100n).padStart(2, '0'),
      reviewStatus,
      requiresManualVerification: true,
      createsPurchaseOrder: false
    };
  });
  return {
    version: GROSS_INVOICE_LEADTIME_REVIEW_VERSION,
    interpretation: 'GROSS_INVOICE_THROUGHPUT_PROXY_NOT_DEMAND_FORECAST',
    scope: 'REORDER_CANDIDATES_ON_SCANNED_CATALOG_PAGE',
    salesWindowDays, leadTimeDays,
    netReturnsKnown: false,
    physicalStockOutboundAuthority: false,
    locationAllocationVerified: false,
    demandForecast: false,
    automatedProcurement: false,
    rows
  };
}
