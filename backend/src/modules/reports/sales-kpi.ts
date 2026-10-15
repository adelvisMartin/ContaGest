/** Canonical #771 sales KPI projection: no floats, no implicit FX conversion. */
export const SALES_KPI_STATUSES = Object.freeze(['issued', 'paid', 'overdue'] as const);
export const SALES_KPI_VERSION = 'sales-kpi-v1';

type RawDecimal = { toString(): string } | string;
export type SalesKpiAggregate = {
  currency: string;
  status: string;
  _count: { _all: number };
  _sum: { total: RawDecimal | null; subtotal: RawDecimal | null; iva: RawDecimal | null };
};

export function salesKpiDecimal(value: RawDecimal | null | undefined): string {
  const text = value === null || value === undefined ? '0' : value.toString();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new TypeError('KPI_DECIMAL_NOT_CANONICAL');
  return text;
}

export function salesKpiRows(groups: readonly SalesKpiAggregate[]) {
  return groups.map((group) => {
    if (!/^[A-Z]{3}$/.test(group.currency) ||
      !SALES_KPI_STATUSES.includes(group.status as typeof SALES_KPI_STATUSES[number]) ||
      !Number.isSafeInteger(group._count._all) || group._count._all < 0) {
      throw new TypeError('KPI_GROUP_INVALID');
    }
    return {
      currency: group.currency,
      status: group.status,
      invoiceCount: group._count._all,
      subtotalExact: salesKpiDecimal(group._sum.subtotal),
      ivaExact: salesKpiDecimal(group._sum.iva),
      totalExact: salesKpiDecimal(group._sum.total)
    };
  });
}

export function salesKpiDocumentRows(invoices: ReadonlyArray<{
  id: string; number: string; issueDate: Date; fiscalPeriod: string;
  currency: string; status: string; subtotal: RawDecimal; iva: RawDecimal; total: RawDecimal;
}>) {
  return invoices.map(invoice => ({
    id: invoice.id,
    number: invoice.number,
    issueDate: invoice.issueDate.toISOString(),
    fiscalPeriod: invoice.fiscalPeriod,
    currency: invoice.currency,
    status: invoice.status,
    subtotalExact: salesKpiDecimal(invoice.subtotal),
    ivaExact: salesKpiDecimal(invoice.iva),
    totalExact: salesKpiDecimal(invoice.total)
  }));
}
