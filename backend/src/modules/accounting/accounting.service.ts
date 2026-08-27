import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import {
  ONE,
  ZERO,
  add,
  exchangeRate,
  money,
  serializeDecimal,
  subtract,
  type DecimalInput
} from '../../shared/financial/decimal.js';

export type LedgerLineInput = {
  accountCode: string;
  accountName: string;
  debit?: DecimalInput;
  credit?: DecimalInput;
  currency?: string;
  exchangeRate?: DecimalInput;
};

type AccountingDb = Pick<Prisma.TransactionClient, 'closingPeriod' | 'ledgerEntry'>;

export function assertBalanced(lines: LedgerLineInput[]) {
  const debit = add(...lines.map((line) => money(line.debit ?? ZERO)));
  const credit = add(...lines.map((line) => money(line.credit ?? ZERO)));
  const diff = subtract(debit, credit);
  if (!diff.isZero()) {
    throw new HttpError(
      422,
      `Asiento descuadrado. Débito ${serializeDecimal(debit, 2)} / Crédito ${serializeDecimal(credit, 2)} / Diferencia ${serializeDecimal(diff, 2)}`
    );
  }
  return { debit, credit };
}

export async function assertPeriodOpen(tenantId: string, fiscalPeriod: string, db: AccountingDb = prisma) {
  const closed = await db.closingPeriod.findFirst({
    where: {
      tenantId,
      period: fiscalPeriod,
      status: 'closed',
      module: { in: ['accounting', 'all'] }
    },
    select: { id: true, period: true, module: true, closedAt: true }
  });
  if (closed) throw new HttpError(409, `El período ${fiscalPeriod} está cerrado para contabilidad. Registra la corrección en un período abierto mediante reverso o ajuste autorizado.`);
}

export async function createLedgerEntry(
  input: { tenantId: string; fiscalPeriod: string; description: string; source?: any; sourceId?: string; lines: LedgerLineInput[] },
  db: AccountingDb = prisma
) {
  const normalizedLines = input.lines.map((line) => ({
    ...line,
    debit: money(line.debit ?? ZERO),
    credit: money(line.credit ?? ZERO),
    exchangeRate: exchangeRate(line.exchangeRate ?? ONE)
  }));
  assertBalanced(normalizedLines);
  await assertPeriodOpen(input.tenantId, input.fiscalPeriod, db);
  return db.ledgerEntry.create({
    data: {
      tenantId: input.tenantId,
      fiscalPeriod: input.fiscalPeriod,
      description: input.description,
      source: input.source || 'manual',
      sourceId: input.sourceId,
      lines: {
        create: normalizedLines.map((line) => ({
          accountCode: line.accountCode,
          accountName: line.accountName,
          debit: line.debit,
          credit: line.credit,
          currency: line.currency || 'VES',
          exchangeRate: line.exchangeRate
        }))
      }
    },
    include: { lines: true }
  });
}

export function salesInvoiceLinesForLedger(invoice: { subtotal: DecimalInput; iva: DecimalInput; igtf: DecimalInput; total: DecimalInput }) {
  const total = money(invoice.total ?? ZERO);
  const subtotal = money(invoice.subtotal ?? ZERO);
  const iva = money(invoice.iva ?? ZERO);
  const igtf = money(invoice.igtf ?? ZERO);
  return [
    { accountCode: '1.1.03.001', accountName: 'Clientes nacionales', debit: total },
    { accountCode: '4.1.01', accountName: 'Ventas nacionales gravadas', credit: subtotal },
    { accountCode: '2.1.02.001', accountName: 'IVA débito fiscal', credit: iva },
    ...(!igtf.isZero() ? [{ accountCode: '2.1.02.005', accountName: 'IGTF por pagar', credit: igtf }] : [])
  ];
}

export function purchaseInvoiceLinesForLedger(invoice: { subtotal: DecimalInput; iva: DecimalInput; total: DecimalInput }) {
  const total = money(invoice.total ?? ZERO);
  const subtotal = money(invoice.subtotal ?? ZERO);
  const iva = money(invoice.iva ?? ZERO);
  return [
    { accountCode: '5.1.01', accountName: 'Costo mercancía vendida', debit: subtotal },
    { accountCode: '1.1.05.001', accountName: 'IVA crédito fiscal', debit: iva },
    { accountCode: '2.1.01.001', accountName: 'Proveedores nacionales', credit: total }
  ];
}
