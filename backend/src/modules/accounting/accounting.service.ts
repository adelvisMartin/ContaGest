import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';

export type LedgerLineInput = { accountCode: string; accountName: string; debit?: number; credit?: number; currency?: string; exchangeRate?: number };

export function assertBalanced(lines: LedgerLineInput[]) {
  const debit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const diff = Math.round((debit - credit) * 100) / 100;
  if (diff !== 0) throw new HttpError(422, `Asiento descuadrado. Débito ${debit.toFixed(2)} / Crédito ${credit.toFixed(2)} / Diferencia ${diff.toFixed(2)}`);
  return { debit, credit };
}

export async function assertPeriodOpen(tenantId: string, fiscalPeriod: string) {
  const closed = await prisma.closingPeriod.findFirst({
    where: {
      tenantId,
      period:fiscalPeriod,
      status:'closed',
      module:{ in:['accounting','all'] }
    },
    select:{ id:true, period:true, module:true, closedAt:true }
  });
  if (closed) throw new HttpError(409, `El período ${fiscalPeriod} está cerrado para contabilidad. Registra la corrección en un período abierto mediante reverso o ajuste autorizado.`);
}

export async function createLedgerEntry(input: { tenantId: string; fiscalPeriod: string; description: string; source?: any; sourceId?: string; lines: LedgerLineInput[] }) {
  assertBalanced(input.lines);
  await assertPeriodOpen(input.tenantId, input.fiscalPeriod);
  return prisma.ledgerEntry.create({
    data: {
      tenantId: input.tenantId,
      fiscalPeriod: input.fiscalPeriod,
      description: input.description,
      source: input.source || 'manual',
      sourceId: input.sourceId,
      lines: { create: input.lines.map((l) => ({ accountCode: l.accountCode, accountName: l.accountName, debit: l.debit || 0, credit: l.credit || 0, currency: l.currency || 'VES', exchangeRate: l.exchangeRate || 1 })) }
    },
    include: { lines: true }
  });
}

export function salesInvoiceLinesForLedger(invoice: { subtotal: any; iva: any; igtf: any; total: any }) {
  const total = Number(invoice.total || 0);
  const subtotal = Number(invoice.subtotal || 0);
  const iva = Number(invoice.iva || 0);
  const igtf = Number(invoice.igtf || 0);
  return [
    { accountCode: '1.1.03.001', accountName: 'Clientes nacionales', debit: total },
    { accountCode: '4.1.01', accountName: 'Ventas nacionales gravadas', credit: subtotal },
    { accountCode: '2.1.02.001', accountName: 'IVA débito fiscal', credit: iva },
    ...(igtf ? [{ accountCode: '2.1.02.005', accountName: 'IGTF por pagar', credit: igtf }] : [])
  ];
}

export function purchaseInvoiceLinesForLedger(invoice: { subtotal: any; iva: any; total: any }) {
  const total = Number(invoice.total || 0);
  const subtotal = Number(invoice.subtotal || 0);
  const iva = Number(invoice.iva || 0);
  return [
    { accountCode: '5.1.01', accountName: 'Costo mercancía vendida', debit: subtotal },
    { accountCode: '1.1.05.001', accountName: 'IVA crédito fiscal', debit: iva },
    { accountCode: '2.1.01.001', accountName: 'Proveedores nacionales', credit: total }
  ];
}
