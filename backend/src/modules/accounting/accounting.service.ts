import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { assertManualPostingAccounts } from './manual-posting-policy.js';
import type { SemanticPostingAccount } from '../chart-accounts/semantic-posting-policy.js';
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

type AccountingDb = Pick<Prisma.TransactionClient, 'closingPeriod' | 'ledgerEntry' | '$queryRaw'>;

const PERIOD_CODE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Every accounting posting/close writer must acquire this same PostgreSQL
 * transaction-scoped mutex BEFORE its period-open check and mutation.
 * The lock also covers periods not yet represented by a ClosingPeriod row.
 * A standalone Prisma client is not an ownership boundary; only transaction
 * clients retain this lock until COMMIT/ROLLBACK.
 */
async function lockAccountingPeriodMutation(
  tenantId: string, fiscalPeriod: string, tx: Prisma.TransactionClient
): Promise<void> {
  if (typeof tenantId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId) ||
      typeof fiscalPeriod !== 'string' || !PERIOD_CODE.test(fiscalPeriod)) {
    throw new HttpError(422, 'Identidad o período contable inválido.');
  }
  const lockKey = `cg:ledger-period:v1:${tenantId}:${fiscalPeriod}`;
  await tx.$queryRaw<Array<{ locked: string | null }>>`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS locked
  `;
}

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

export async function assertPeriodOpen(tenantId: string, fiscalPeriod: string, db: AccountingDb = prisma) {
  // The root Prisma client can perform a read-only precheck; writers MUST pass
  // their active transaction so the advisory lock survives to the ledger write.
  if (db !== prisma) await lockAccountingPeriodMutation(tenantId, fiscalPeriod, db as Prisma.TransactionClient);
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



/**
 * Single command authority for opening a period.
 * The lock must match posting and close, including when no row exists yet.
 * Audit creation is committed/rolled back with the period, never best effort.
 */
export async function createAccountingPeriod(input: {
  tenantId: string; period: string; note?: string;
  actorId?: string; audit?: LedgerAuditContext;
}) {
  const actorId = requirePostingActor(input.actorId || input.audit?.userId);
  return prisma.$transaction(async tx => {
    await lockAccountingPeriodMutation(input.tenantId, input.period, tx);
    const existing = await tx.closingPeriod.findFirst({
      where: { tenantId: input.tenantId, period: input.period, module: 'accounting' }
    });
    if (existing) throw new HttpError(409, 'El período contable ya está registrado.');
    const period = await tx.closingPeriod.create({
      data: { tenantId: input.tenantId, period: input.period,
        module: 'accounting', status: 'open', note: input.note || null }
    });
    await tx.auditLog.create({
      data: { tenantId: input.tenantId, userId: actorId,
        action: 'accounting.period-create', entity: 'ClosingPeriod', entityId: period.id,
        after: { period: period.period, module: 'accounting', status: 'open' },
        ipAddress: input.audit?.ipAddress || null, userAgent: input.audit?.userAgent || null }
    });
    return period;
  });
}

/**
 * #637 Incremental command owner for an accounting period close.
 * Serializes competing closes for the same tenant row and commits audit with
 * the transition. Other posting paths must also coordinate period locks before
 * claiming close-vs-post serializability; this alone is not the final gate.
 */
export async function closeAccountingPeriod(input: {
  tenantId: string; periodId: string; note?: string;
  actorId?: string; audit?: LedgerAuditContext;
}) {
  const actorId = requirePostingActor(input.actorId || input.audit?.userId);
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.closingPeriod.findFirst({
      where: { id: input.periodId, tenantId: input.tenantId, module: 'accounting' },
      select: { period: true }
    });
    if (!candidate) throw new HttpError(404, 'Período contable no encontrado.');
    await lockAccountingPeriodMutation(input.tenantId, candidate.period, tx);
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM public."ClosingPeriod"
      WHERE "id" = ${input.periodId} AND "tenantId" = ${input.tenantId} AND "module" = 'accounting'
      FOR UPDATE
    `;
    if (locked.length !== 1) throw new HttpError(404, 'Período contable no encontrado.');
    const existing = await tx.closingPeriod.findFirst({
      where: { id: input.periodId, tenantId: input.tenantId, module: 'accounting' }
    });
    if (!existing) throw new HttpError(404, 'Período contable no encontrado.');
    if (existing.status === 'closed') throw new HttpError(409, 'El período ya está cerrado.');
    const now = new Date();
    const updated = await tx.closingPeriod.updateMany({
      where: { id: existing.id, tenantId: input.tenantId, module: 'accounting', status: 'open' },
      data: { status: 'closed', closedAt: now, closedBy: actorId, note: input.note || existing.note || null }
    });
    if (updated.count !== 1) throw new HttpError(409, 'El período no está abierto.');
    const period = await tx.closingPeriod.findFirstOrThrow({
      where: { id: existing.id, tenantId: input.tenantId, module: 'accounting' }
    });
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId, userId: actorId,
        action: 'accounting.period-close', entity: 'ClosingPeriod', entityId: period.id,
        before: { status: existing.status, period: existing.period },
        after: { status: period.status, period: period.period, closedAt: now.toISOString() },
        ipAddress: input.audit?.ipAddress || null, userAgent: input.audit?.userAgent || null
      }
    });
    return period;
  });
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

function requirePostingActor(value?: string) {
  const actorId = String(value || '').trim();
  if (!actorId) throw new HttpError(401, 'La operación contable requiere un actor autenticado.');
  return actorId;
}

export async function createLedgerEntry(
  input: { tenantId: string; fiscalPeriod: string; description: string; source?: any; sourceId?: string; lines: LedgerLineInput[] },
  db: AccountingDb
) {
  // Do not let a caller bypass the advisory period lock by using a standalone
  // Prisma client. The same transaction must own guard + inserted draft.
  if (!db || db === prisma) {
    throw new HttpError(500, 'El asiento requiere una transacción de dominio autorizada.');
  }
  const normalizedLines = normalizeLedgerLines(input.lines);
  assertBalanced(normalizedLines);
  await assertPeriodOpen(input.tenantId, input.fiscalPeriod, db);
  return db.ledgerEntry.create({
    data: {
      tenantId: input.tenantId,
      fiscalPeriod: input.fiscalPeriod,
      description: input.description,
      source: input.source || 'manual',
      sourceId: input.sourceId,
      posted: false,
      postedAt: null,
      postedBy: null,
      reversalOfId: null,
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

async function lockScopedLedgerEntry(tx: Prisma.TransactionClient, tenantId: string, entryId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM public."LedgerEntry"
    WHERE "id" = ${entryId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new HttpError(404, 'Asiento contable no encontrado.');
}

export async function updateDraftLedgerEntry(input: {
  tenantId: string; entryId: string; fiscalPeriod: string; description: string; lines: LedgerLineInput[];
}) {
  return prisma.$transaction(async (tx) => {
    await lockScopedLedgerEntry(tx, input.tenantId, input.entryId);
    const entry = await tx.ledgerEntry.findFirst({
      where: { id: input.entryId, tenantId: input.tenantId },
      include: { lines: true, reversalOf: true, reversedBy: true }
    });
    if (!entry) throw new HttpError(404, 'Asiento contable no encontrado.');
    assertLedgerActionAllowed(entry, 'edit');
    if (entry.source !== 'manual') throw new HttpError(409, 'Solo los asientos manuales en borrador pueden editarse.');
    const normalizedLines = normalizeLedgerLines(input.lines);
    assertBalanced(normalizedLines);
    await assertPeriodOpen(input.tenantId, entry.fiscalPeriod, tx);
    await assertPeriodOpen(input.tenantId, input.fiscalPeriod, tx);
    return tx.ledgerEntry.update({
      where: { id: entry.id, tenantId: input.tenantId },
      data: {
        fiscalPeriod: input.fiscalPeriod, description: input.description,
        lines: {
          deleteMany: {},
          create: normalizedLines.map((line) => ({
            accountCode: line.accountCode, accountName: line.accountName,
            debit: line.debit, credit: line.credit,
            currency: line.currency || 'VES', exchangeRate: line.exchangeRate
          }))
        }
      },
      include: { lines: true, reversalOf: true, reversedBy: true }
    });
  });
}

export async function deleteDraftLedgerEntry(input: { tenantId: string; entryId: string }) {
  return prisma.$transaction(async (tx) => {
    await lockScopedLedgerEntry(tx, input.tenantId, input.entryId);
    const entry = await tx.ledgerEntry.findFirst({
      where: { id: input.entryId, tenantId: input.tenantId },
      include: { lines: true, reversalOf: true, reversedBy: true }
    });
    if (!entry) throw new HttpError(404, 'Asiento contable no encontrado.');
    assertLedgerActionAllowed(entry, 'delete');
    if (entry.source !== 'manual') throw new HttpError(409, 'Solo los asientos manuales en borrador pueden eliminarse.');
    await assertPeriodOpen(input.tenantId, entry.fiscalPeriod, tx);
    await tx.ledgerEntry.delete({ where: { id: entry.id, tenantId: input.tenantId } });
    return entry;
  });
}

export async function postLedgerEntry(input: {
  tenantId: string; entryId: string; postedBy?: string; audit?: LedgerAuditContext;
}) {
  const actorId = requirePostingActor(input.postedBy || input.audit?.userId);
  return prisma.$transaction(async (tx) => {
    await lockScopedLedgerEntry(tx, input.tenantId, input.entryId);
    const entry = await tx.ledgerEntry.findFirst({
      where: { id: input.entryId, tenantId: input.tenantId },
      include: { lines: true, reversalOf: true, reversedBy: true }
    });
    if (!entry) throw new HttpError(404, 'Asiento contable no encontrado.');
    assertLedgerActionAllowed(entry, 'post');
    assertBalanced(entry.lines);
    await assertPeriodOpen(input.tenantId, entry.fiscalPeriod, tx);
    if (entry.source === 'manual') {
      const accountCodes = [...new Set(entry.lines.map(line => line.accountCode))];
      const accounts = await tx.chartAccount.findMany({
        where: { tenantId: input.tenantId, code: { in: accountCodes } },
        select: { tenantId: true, code: true, active: true, allowPosting: true }
      });
      try {
        assertManualPostingAccounts(input.tenantId, entry.lines, accounts);
      } catch {
        throw new HttpError(422, 'El asiento contiene cuentas inexistentes, inactivas o que no permiten contabilización.', {
          code: 'MANUAL_POSTING_ACCOUNT_NOT_AUTHORIZED'
        });
      }
    }
    const postedAt = new Date();
    const updated = await tx.ledgerEntry.updateMany({
      where: { id: entry.id, tenantId: input.tenantId, posted: false },
      data: { posted: true, postedAt, postedBy: actorId }
    });
    if (updated.count !== 1) throw new HttpError(409, 'El asiento ya fue contabilizado por otra operación.');
    const posted = await tx.ledgerEntry.findUniqueOrThrow({
      where: { id: entry.id },
      include: { lines: true, reversalOf: true, reversedBy: true }
    });
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId, userId: actorId, action: 'ledger.entry.posted',
        entity: 'LedgerEntry', entityId: posted.id,
        before: { posted: false, fiscalPeriod: entry.fiscalPeriod },
        after: { posted: true, postedAt: postedAt.toISOString(), postedBy: actorId, fiscalPeriod: entry.fiscalPeriod },
        ipAddress: input.audit?.ipAddress || null, userAgent: input.audit?.userAgent || null
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
  const actorId = requirePostingActor(input.postedBy || input.audit?.userId);

  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize reversal against post/edit/delete of the same tenant entry.
      // All authorization/state and target-period checks use this transaction.
      await lockScopedLedgerEntry(tx, input.tenantId, input.entryId);
      const original = await tx.ledgerEntry.findFirst({
        where: { id: input.entryId, tenantId: input.tenantId },
        include: { lines: true, reversalOf: true, reversedBy: true }
      });
      if (!original) throw new HttpError(404, 'Asiento contable no encontrado.');
      assertLedgerActionAllowed(original, 'reverse');
      await assertPeriodOpen(input.tenantId, input.fiscalPeriod, tx);
      const lines = inverseLedgerLines(original.lines);
      const postedAt = new Date();
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
          reversalOfId: null,
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
          postedBy: actorId,
          reversalOfId: original.id
        },
        include: { lines: true, reversalOf: true, reversedBy: true }
      });
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: actorId,
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

type PostingAccounts = Readonly<Record<string, SemanticPostingAccount>>;

export function salesInvoiceLinesForLedger(invoice: { subtotal: DecimalInput; iva: DecimalInput; igtf: DecimalInput; total: DecimalInput }, accounts: PostingAccounts) {
  const total = money(invoice.total ?? ZERO);
  const subtotal = money(invoice.subtotal ?? ZERO);
  const iva = money(invoice.iva ?? ZERO);
  const igtf = money(invoice.igtf ?? ZERO);
  return [
    { accountCode: accounts.ar.accountCode, accountName: accounts.ar.name, debit: total },
    { accountCode: accounts.revenue.accountCode, accountName: accounts.revenue.name, credit: subtotal },
    { accountCode: accounts.vat_output.accountCode, accountName: accounts.vat_output.name, credit: iva },
    ...(!igtf.isZero() ? [{ accountCode: accounts.tax_payable.accountCode, accountName: accounts.tax_payable.name, credit: igtf }] : [])
  ];
}

export function purchaseInvoiceLinesForLedger(invoice: { subtotal: DecimalInput; iva: DecimalInput; total: DecimalInput }, accounts: PostingAccounts) {
  const total = money(invoice.total ?? ZERO);
  const subtotal = money(invoice.subtotal ?? ZERO);
  const iva = money(invoice.iva ?? ZERO);
  return [
    { accountCode: accounts.cost_of_sales.accountCode, accountName: accounts.cost_of_sales.name, debit: subtotal },
    { accountCode: accounts.vat_input.accountCode, accountName: accounts.vat_input.name, debit: iva },
    { accountCode: accounts.ap.accountCode, accountName: accounts.ap.name, credit: total }
  ];
}
