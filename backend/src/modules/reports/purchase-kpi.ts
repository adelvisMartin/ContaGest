import { SALES_KPI_STATUSES, salesKpiDecimal } from './sales-kpi.js';

export const PURCHASE_KPI_VERSION = 'purchase-kpi-v1';

type Money = string | { toString(): string };

export type PurchaseKpiGroup = {
  currency: string;
  status: string;
  _count: { _all: number };
  _sum: {
    subtotal: Money | null;
    iva: Money | null;
    igtf: Money | null;
    retiva: Money | null;
    total: Money | null;
  };
};

export function purchaseKpiRows(groups: readonly PurchaseKpiGroup[]) {
  return groups.map(group => {
    if (!/^[A-Z][A-Z0-9]{2,7}$/.test(group.currency) ||
      !SALES_KPI_STATUSES.includes(group.status as typeof SALES_KPI_STATUSES[number]) ||
      !Number.isSafeInteger(group._count._all) || group._count._all < 0) {
      throw new TypeError('PURCHASE_KPI_GROUP_INVALID');
    }
    return {
      currency: group.currency,
      status: group.status,
      invoiceCount: group._count._all,
      subtotalExact: salesKpiDecimal(group._sum.subtotal),
      ivaExact: salesKpiDecimal(group._sum.iva),
      igtfExact: salesKpiDecimal(group._sum.igtf),
      retivaExact: salesKpiDecimal(group._sum.retiva),
      totalExact: salesKpiDecimal(group._sum.total)
    };
  });
}

export function purchaseKpiDocumentRows(invoices: ReadonlyArray<{
  id: string;
  number: string;
  issueDate: Date;
  fiscalPeriod: string;
  currency: string;
  status: string;
  subtotal: Money;
  iva: Money;
  igtf: Money;
  retiva: Money;
  total: Money;
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
    igtfExact: salesKpiDecimal(invoice.igtf),
    retivaExact: salesKpiDecimal(invoice.retiva),
    totalExact: salesKpiDecimal(invoice.total)
  }));
}
