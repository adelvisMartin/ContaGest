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

export type LedgerAuditContext = {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
};

export type LedgerLifecycleAction = 'post' | 'reverse' | 'edit' | 'delete';
export type LedgerLifecycleSnapshot = {
  posted: boolean;
  reversalOfId?: string | null;
  reversedBy?: { id?: string } | null;
};

export function assertLedgerActionAllowed(entry: LedgerLifecycleSnapshot, action: LedgerLifecycleAction) {
  if (action === 'post') {
    if (entry.posted) throw new HttpError(409, 'El asiento ya está contabilizado y es inmutable.');
    if (entry.reversalOfId) throw new HttpError(409, 'Un reverso no puede existir como borrador.');
    return;
  }

  if (action === 'reverse') {
    if (!entry.posted) throw new HttpError(409, 'Solo un asiento contabilizado puede reversarse.');
    if (entry.reversalOfId) throw new HttpError(409, 'No se permite reversar un reverso. Registra un ajuste nuevo y auditable.');
    if (entry.reversedBy) throw new HttpError(409, 'El asiento ya posee un reverso relacionado.');
    return;
  }

  if (entry.posted) {
    throw new HttpError(409, 'El asiento contabilizado es inmutable. Usa reverso o ajuste; no edites ni borres el histórico.');
  }
}

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

export async function assertPeriodOpen(tenantId: string, fiscalPeriod: string) {
  const closed = await prisma.closingPeriod.findFirst({
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

function normalizeLedgerLines(lines: LedgerLineInput[]) {
  return lines.map((line) => ({
    ...line,
    debit: money(line.debit ?? ZERO),
    credit: money(line.credit ?? ZERO),
    exchangeRate: exchangeRate(line.exchangeRate ?? ONE)
  }));
}

export function inverseLedgerLines(lines: LedgerLineInput[]) {
  const inverse = lines.map((line) => ({
    accountCode: line.accountCode,
    accountName: line.accountName,
    debit: money(line.credit ?? ZERO),
    credit: money(line.debit ?? ZERO),
    currency: line.currency || 'VES',
    exchangeRate: exchangeRate(line.exchangeRate ?? ONE)
  }));
  assertBalanced(inverse);
  return inverse;
}

export async function createLedgerEntry(input: {
  tenantId: string;
  fiscalPeriod: string;
  description: string;
  source?: any;
  sourceId?: string;
  lines: LedgerLineInput[];
}) {
  const normalizedLines = normalizeLedgerLines(input.lines);
  assertBalanced(normalizedLines);
  await assertPeriodOpen(input.tenantId, input.fiscalPeriod);
  return prisma.ledgerEntry.create({
    data: {
      tenantId: input.tenantId,
      fiscalPeriod: input.fiscalPeriod,
      description: input.description,
      source: input.source || 'manual',
      sourceId: input.sourceId,
      posted: false,
      postedAt: null,
      postedBy: null,
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
    include: { lines: true, reversalOf: true, reversedBy: true }
  });
}

export async function updateDraftLedgerEntry(input: {
  tenantId: string;
  entryId: string;
  fiscalPeriod: string;
  description: string;
  lines: LedgerLineInput[];
}) {
  const entry = await prisma.ledgerEntry.findFirst({
    where: { id: input.entryId, tenantId: input.tenantId },
    include: { lines: true, reversalOf: true, reversedBy: true }
  });
  if (!entry) throw new HttpError(404, 'Asiento contable no encontrado.');
  assertLedgerActionAllowed(entry, 'edit');
  if (entry.source !== 'manual') throw new HttpError(409, 'Solo los asientos manuales en borrador pueden editarse.');

  const normalizedLines = normalizeLedgerLines(input.lines);
  assertBalanced(normalizedLines);
  await assertPeriodOpen(input.tenantId, input.fiscalPeriod);

  return prisma.ledgerEntry.update({
    where: { id: entry.id },
    data: {
      fiscalPeriod: input.fiscalPeriod,
      description: input.description,
      lines: {
        deleteMany: {},
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
    include: { lines: true, reversalOf: true, reversedBy: true }
  });
}

export async function deleteDraftLedgerEntry(input: { tenantId: string; entryId: string }) {
  const entry = await prisma.ledgerEntry.findFirst({
    where: { id: input.entryId, tenantId: input.tenantId },
    include: { lines: true, reversalOf: true, reversedBy: true }
  });
  if (!entry) throw new HttpError(404, 'Asiento contable no encontrado.');
  assertLedgerActionAllowed(entry, 'delete');
  if (entry.source !== 'manual') throw new HttpError(409, 'Solo los asientos manuales en borrador pueden eliminarse.');
  await assertPeriodOpen(input.tenantId, entry.fiscalPeriod);
  await prisma.ledgerEntry.delete({ where: { id: entry.id } });
  return entry;
}

export async function postLedgerEntry(input: {
  tenantId: string;
  entryId: string;
  postedBy?: string;
  audit?: LedgerAuditContext;
}) {
  const entry = await prisma.ledgerEntry.findFirst({
    where: { id: input.entryId, tenantId: input.tenantId },
    include: { lines: true, reversalOf: true, reversedBy: true }
  });
  if (!entry) throw new HttpError(404, 'Asiento contable no encontrado.');
  assertLedgerActionAllowed(entry, 'post');

  assertBalanced(entry.lines);
  await assertPeriodOpen(input.tenantId, entry.fiscalPeriod);

  const postedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.ledgerEntry.updateMany({
      where: { id: entry.id, tenantId: input.tenantId, posted: false },
      data: { posted: true, postedAt, postedBy: input.postedBy || null }
    });
    if (updated.count !== 1) throw new HttpError(409, 'El asiento ya fue contabilizado por otra operación.');
    const posted = await tx.ledgerEntry.findUniqueOrThrow({
      where: { id: entry.id },
      include: { lines: true, reversalOf: true, reversedBy: true }
    });
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.audit?.userId || null,
        action: 'ledger.entry.posted',
        entity: 'LedgerEntry',
        entityId: posted.id,
        before: { posted: false, fiscalPeriod: entry.fiscalPeriod },
        after: { posted: true, postedAt: postedAt.toISOString(), postedBy: input.postedBy || null, fiscalPeriod: entry.fiscalPeriod },
        ipAddress: input.audit?.ipAddress || null,
        userAgent: input.audit?.userAgent || null
      }
    });
    return posted;
  });
}

export async function reverseLedgerEntry(input: {
  tenantId: string;
  entryId: string;
  fiscalPeriod: string;
  postedBy?: string;
  date?: Date;
  description?: string;
  audit?: LedgerAuditContext;
}) {
  const original = await prisma.ledgerEntry.findFirst({
    where: { id: input.entryId, tenantId: input.tenantId },
    include: { lines: true, reversalOf: true, reversedBy: true }
  });
  if (!original) throw new HttpError(404, 'Asiento contable no encontrado.');
  assertLedgerActionAllowed(original, 'reverse');

  await assertPeriodOpen(input.tenantId, input.fiscalPeriod);
  const lines = inverseLedgerLines(original.lines);
  const postedAt = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const draft = await tx.ledgerEntry.create({
        data: {
          tenantId: input.tenantId,
          date: input.date || postedAt,
          fiscalPeriod: input.fiscalPeriod,
          description: input.description || `Reverso de asiento ${original.id}`,
          source: 'manual',
          sourceId: `ledger-reversal:${original.id}`,
          posted: false,
          postedAt: null,
          postedBy: null,
          lines: {
            create: lines.map((line) => ({
              accountCode: line.accountCode,
              accountName: line.accountName,
              debit: line.debit,
              credit: line.credit,
              currency: line.currency,
              exchangeRate: line.exchangeRate
            }))
          }
        }
      });
      const reversal = await tx.ledgerEntry.update({
        where: { id: draft.id },
        data: {
          posted: true,
          postedAt,
          postedBy: input.postedBy || null,
          reversalOfId: original.id
        },
        include: { lines: true, reversalOf: true, reversedBy: true }
      });
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.audit?.userId || null,
          action: 'ledger.entry.reversed',
          entity: 'LedgerEntry',
          entityId: reversal.id,
          before: { originalId: original.id, originalPostedAt: original.postedAt?.toISOString() || null, fiscalPeriod: original.fiscalPeriod },
          after: { reversalId: reversal.id, reversalOfId: original.id, postedAt: postedAt.toISOString(), fiscalPeriod: input.fiscalPeriod },
          ipAddress: input.audit?.ipAddress || null,
          userAgent: input.audit?.userAgent || null
        }
      });
      return reversal;
    });
  } catch (error: any) {
    if (error?.code === 'P2002') throw new HttpError(409, 'El asiento ya fue reversado.');
    throw error;
  }
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
