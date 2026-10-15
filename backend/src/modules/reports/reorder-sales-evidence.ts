/**
 * OPTIONAL gross-invoiced-unit evidence on one reorder catalog page.
 * No conversion to sales demand, reorder quantity or purchase authorization.
 */
export const REORDER_SALES_EVIDENCE_VERSION = 'reorder-invoiced-evidence-v1';
export const REORDER_SALES_MAX_DAYS = 365;
export type ObservedSalesGroup = Readonly<{
  productId: string | null;
  _sum: { quantity: string | { toString(): string } | null };
  _count: { _all: number };
}>;
export type SalesEvidenceCandidate = Readonly<{ productId: string }>;

export function parseReorderSalesOptions(
  enabled: unknown,
  rawWindow: unknown
): { includeSalesEvidence: boolean; salesWindowDays: number } {
  if (enabled !== undefined && enabled !== 'true' && enabled !== 'false') {
    throw new TypeError('REORDER_SALES_QUERY_INVALID');
  }
  const includeSalesEvidence = enabled === 'true';
  if (!includeSalesEvidence && rawWindow !== undefined) {
    throw new TypeError('REORDER_SALES_QUERY_INVALID');
  }
  let salesWindowDays = 90;
  if (rawWindow !== undefined) {
    if (typeof rawWindow !== 'string' || !/^[1-9]\d{0,2}$/.test(rawWindow)) {
      throw new TypeError('REORDER_SALES_QUERY_INVALID');
    }
    salesWindowDays = Number(rawWindow);
    if (salesWindowDays > REORDER_SALES_MAX_DAYS) throw new TypeError('REORDER_SALES_QUERY_INVALID');
  }
  return { includeSalesEvidence, salesWindowDays };
}

function unitsExact(qty: ObservedSalesGroup['_sum']['quantity']): string {
  const raw = qty === null ? '0' : qty.toString();
  if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(raw)) throw new TypeError('REORDER_SALES_QUANTITY_INVALID');
  const [integer, fraction = ''] = raw.split('.');
  return BigInt(integer).toString() + '.' + fraction.padEnd(3,'0');
}

export function projectReorderSalesEvidence(input: {
  candidates: readonly SalesEvidenceCandidate[];
  groups: readonly ObservedSalesGroup[];
  asOf: Date;
  salesWindowDays: number;
}) {
  if (!(input.asOf instanceof Date) || !Number.isFinite(input.asOf.getTime()) ||
      !Number.isSafeInteger(input.salesWindowDays) ||
      input.salesWindowDays < 1 || input.salesWindowDays > REORDER_SALES_MAX_DAYS) {
    throw new TypeError('REORDER_SALES_INPUT_INVALID');
  }
  const wanted = new Set<string>();
  for (const candidate of input.candidates) {
    if (!candidate.productId || wanted.has(candidate.productId)) {
      throw new TypeError('REORDER_SALES_CANDIDATE_INVALID');
    }
    wanted.add(candidate.productId);
  }
  const found = new Map<string, { invoiceLineCount: number; grossInvoicedUnitsExact: string }>();
  for (const group of input.groups) {
    if (!group.productId || !wanted.has(group.productId) || found.has(group.productId) ||
        !Number.isSafeInteger(group._count?._all) || group._count._all <= 0) {
      throw new TypeError('REORDER_SALES_GROUP_INVALID');
    }
    const quantity = unitsExact(group._sum.quantity);
    if (quantity === '0.000') throw new TypeError('REORDER_SALES_GROUP_INVALID');
    found.set(group.productId, { invoiceLineCount: group._count._all, grossInvoicedUnitsExact: quantity });
  }
  return {
    version: REORDER_SALES_EVIDENCE_VERSION,
    source: 'SalesInvoiceLine.quantity+SalesInvoice.status/issueDate',
    interpretation: 'GROSS_INVOICED_UNITS_NOT_NET_DEMAND_OR_PHYSICAL_OUTBOUND',
    statusFilter: ['issued', 'paid', 'overdue'],
    salesWindowDays: input.salesWindowDays,
    asOf: input.asOf.toISOString(),
    scope: 'REORDER_CANDIDATES_IN_SCANNED_CATALOG_PAGE',
    demandForecast: false,
    purchaseOrderCreated: false,
    creditNoteNetting: false,
    items: input.candidates.map(c => ({
      productId: c.productId,
      ...(found.get(c.productId) ?? { invoiceLineCount: 0, grossInvoicedUnitsExact: '0.000' }),
      evidenceAvailable: found.has(c.productId)
    }))
  };
}
