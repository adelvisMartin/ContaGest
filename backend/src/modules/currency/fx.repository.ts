import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { money, serializeDecimal, type DecimalInput, type DecimalValue } from '../../shared/financial/decimal.js';
import { FX_POLICY_VERSION, FX_ROUNDING_MODE, normalizeCurrency, type FunctionalizedLedgerLine, type FxDocumentType } from '../../shared/financial/fx.js';

type FxSourceType = FxDocumentType;
type FxDb = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw' | 'ledgerLine' | 'bankAccount' | 'chartAccount'>;

export type FxPolicyRow = {
  tenantId: string;
  policyVersion: number;
  functionalCurrency: string;
  roundingMode: string;
  moneyScale: number;
  exchangeRateScale: number;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FxDocumentSnapshotRow = {
  id: string;
  tenantId: string;
  documentType: FxDocumentType;
  documentId: string;
  originalCurrency: string;
  functionalCurrency: string;
  exchangeRate: DecimalValue;
  rateDate: Date;
  rateSource: string;
  originalSubtotal: DecimalValue;
  originalTax: DecimalValue;
  originalTotal: DecimalValue;
  functionalSubtotal: DecimalValue;
  functionalTax: DecimalValue;
  functionalTotal: DecimalValue;
  policyVersion: number;
  createdAt: Date;
};

export type FxEventKind = 'realized' | 'unrealized';
export type FxEventRow = {
  id: string;
  tenantId: string;
  kind: FxEventKind;
  sourceType: FxDocumentType;
  sourceId: string;
  bankMovementId: string | null;
  documentCurrency: string;
  settlementCurrency: string | null;
  functionalCurrency: string;
  originalAmount: DecimalValue;
  settlementAmount: DecimalValue | null;
  historicalRate: DecimalValue;
  currentRate: DecimalValue;
  historicalFunctionalAmount: DecimalValue;
  currentFunctionalAmount: DecimalValue;
  difference: DecimalValue;
  fiscalPeriod: string;
  rateDate: Date;
  rateSource: string;
  ledgerEntryId: string;
  reversalLedgerEntryId: string | null;
  reversedAt: Date | null;
  policyVersion: number;
  createdAt: Date;
};

type FxBankAccountMapRow = {
  tenantId: string;
  bankAccountId: string;
  ledgerAccountCode: string;
  createdAt: Date;
  updatedAt: Date;
};

export async function getFxPolicy(tenantId: string, db: FxDb = prisma): Promise<FxPolicyRow> {
  const rows = await db.$queryRaw<FxPolicyRow[]>(Prisma.sql`SELECT * FROM "FinancialFxPolicy" WHERE "tenantId" = ${tenantId} LIMIT 1`);
  return rows[0] || upsertFxPolicy({ tenantId, functionalCurrency: 'VES', updatedBy: null }, db);
}

export async function upsertFxPolicy(input: { tenantId: string; functionalCurrency: string; updatedBy?: string | null }, db: FxDb = prisma): Promise<FxPolicyRow> {
  const rows = await db.$queryRaw<FxPolicyRow[]>(Prisma.sql`
    INSERT INTO "FinancialFxPolicy"
      ("tenantId","policyVersion","functionalCurrency","roundingMode","moneyScale","exchangeRateScale","updatedBy","updatedAt")
    VALUES
      (${input.tenantId},${FX_POLICY_VERSION},${normalizeCurrency(input.functionalCurrency)},${FX_ROUNDING_MODE},2,4,${input.updatedBy || null},NOW())
    ON CONFLICT ("tenantId") DO UPDATE SET
      "policyVersion"=EXCLUDED."policyVersion","functionalCurrency"=EXCLUDED."functionalCurrency","roundingMode"=EXCLUDED."roundingMode",
      "moneyScale"=EXCLUDED."moneyScale","exchangeRateScale"=EXCLUDED."exchangeRateScale","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()
    RETURNING *
  `);
  return rows[0];
}

export async function countDocumentSnapshots(tenantId: string, db: FxDb = prisma) {
  const rows = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "FinancialFxDocumentSnapshot" WHERE "tenantId" = ${tenantId}`);
  return Number(rows[0]?.count || 0n);
}

export async function recordDocumentSnapshot(input: {
  tenantId: string;
  documentType: FxDocumentType;
  documentId: string;
  originalCurrency: string;
  functionalCurrency: string;
  exchangeRate: DecimalInput;
  rateDate: Date;
  rateSource: string;
  originalSubtotal: DecimalInput;
  originalTax: DecimalInput;
  originalTotal: DecimalInput;
  functionalSubtotal: DecimalInput;
  functionalTax: DecimalInput;
  functionalTotal: DecimalInput;
}, db: FxDb): Promise<FxDocumentSnapshotRow> {
  const rows = await db.$queryRaw<FxDocumentSnapshotRow[]>(Prisma.sql`
    INSERT INTO "FinancialFxDocumentSnapshot"
      ("id","tenantId","documentType","documentId","originalCurrency","functionalCurrency","exchangeRate","rateDate","rateSource","originalSubtotal","originalTax","originalTotal","functionalSubtotal","functionalTax","functionalTotal","policyVersion")
    VALUES
      (${randomUUID()}::uuid,${input.tenantId},${input.documentType},${input.documentId},${normalizeCurrency(input.originalCurrency)},${normalizeCurrency(input.functionalCurrency)},${serializeDecimal(input.exchangeRate,4)}::numeric,${input.rateDate},${input.rateSource},${serializeDecimal(input.originalSubtotal,2)}::numeric,${serializeDecimal(input.originalTax,2)}::numeric,${serializeDecimal(input.originalTotal,2)}::numeric,${serializeDecimal(input.functionalSubtotal,2)}::numeric,${serializeDecimal(input.functionalTax,2)}::numeric,${serializeDecimal(input.functionalTotal,2)}::numeric,${FX_POLICY_VERSION})
    ON CONFLICT ("tenantId","documentType","documentId") DO UPDATE SET "documentId"=EXCLUDED."documentId"
    RETURNING *
  `);
  return rows[0];
}

export async function getDocumentSnapshot(input: { tenantId: string; documentType: FxDocumentType; documentId: string }, db: FxDb = prisma): Promise<FxDocumentSnapshotRow | null> {
  const rows = await db.$queryRaw<FxDocumentSnapshotRow[]>(Prisma.sql`
    SELECT * FROM "FinancialFxDocumentSnapshot" WHERE "tenantId"=${input.tenantId} AND "documentType"=${input.documentType} AND "documentId"=${input.documentId} LIMIT 1
  `);
  return rows[0] || null;
}

export async function listDocumentSnapshots(input: { tenantId: string; sourceType?: FxSourceType; sourceId?: string }, db: FxDb = prisma): Promise<FxDocumentSnapshotRow[]> {
  if (input.sourceType && input.sourceId) {
    return db.$queryRaw<FxDocumentSnapshotRow[]>(Prisma.sql`
      SELECT * FROM "FinancialFxDocumentSnapshot" WHERE "tenantId"=${input.tenantId} AND "documentType"=${input.sourceType} AND "documentId"=${input.sourceId} ORDER BY "createdAt","id"
    `);
  }
  return db.$queryRaw<FxDocumentSnapshotRow[]>(Prisma.sql`
    SELECT * FROM "FinancialFxDocumentSnapshot" WHERE "tenantId"=${input.tenantId} ORDER BY "createdAt" DESC,"id" DESC LIMIT 500
  `);
}

export async function recordLedgerLineSnapshots(input: {
  tenantId: string;
  ledgerEntryId: string;
  lines: FunctionalizedLedgerLine[];
  originalCurrency: string;
  functionalCurrency: string;
  exchangeRate: DecimalInput;
  rateDate: Date;
  rateSource: string;
}, db: FxDb) {
  const persisted = await db.ledgerLine.findMany({ where: { entryId: input.ledgerEntryId }, orderBy: { id: 'asc' } });
  const byAccount = new Map<string, typeof persisted>();
  for (const line of persisted) {
    const rows = byAccount.get(line.accountCode) || [];
    rows.push(line);
    byAccount.set(line.accountCode, rows);
  }
  for (const line of input.lines) {
    const rows = byAccount.get(line.accountCode) || [];
    const persistedLine = rows.shift();
    if (!persistedLine) throw new HttpError(409, `No se pudo vincular el snapshot FX con la línea contable ${line.accountCode}.`);
    byAccount.set(line.accountCode, rows);
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "FinancialFxLedgerLineSnapshot"
        ("id","tenantId","ledgerLineId","originalDebit","originalCredit","functionalDebit","functionalCredit","originalCurrency","functionalCurrency","exchangeRate","rateDate","rateSource","policyVersion")
      VALUES
        (${randomUUID()}::uuid,${input.tenantId},${persistedLine.id},${serializeDecimal(line.originalDebit,2)}::numeric,${serializeDecimal(line.originalCredit,2)}::numeric,${serializeDecimal(line.functionalDebit,2)}::numeric,${serializeDecimal(line.functionalCredit,2)}::numeric,${normalizeCurrency(input.originalCurrency)},${normalizeCurrency(input.functionalCurrency)},${serializeDecimal(input.exchangeRate,4)}::numeric,${input.rateDate},${input.rateSource},${FX_POLICY_VERSION})
      ON CONFLICT ("ledgerLineId") DO NOTHING
    `);
  }
}

export async function copyLedgerLineSnapshotsForReversal(input: { tenantId: string; originalEntryId: string; reversalEntryId: string }, db: FxDb) {
  const originals = await db.$queryRaw<Array<{ accountCode: string; originalDebit: DecimalValue; originalCredit: DecimalValue; originalCurrency: string; functionalCurrency: string; exchangeRate: DecimalValue; rateDate: Date; rateSource: string }>>(Prisma.sql`
    SELECT l."accountCode",s."originalDebit",s."originalCredit",s."originalCurrency",s."functionalCurrency",s."exchangeRate",s."rateDate",s."rateSource"
    FROM "LedgerLine" l JOIN "FinancialFxLedgerLineSnapshot" s ON s."ledgerLineId"=l."id"
    WHERE s."tenantId"=${input.tenantId} AND l."entryId"=${input.originalEntryId} ORDER BY l."id"
  `);
  if (!originals.length) return;
  const reversals = await db.ledgerLine.findMany({ where: { entryId: input.reversalEntryId }, orderBy: { id: 'asc' } });
  const byAccount = new Map<string, typeof reversals>();
  for (const line of reversals) {
    const rows = byAccount.get(line.accountCode) || [];
    rows.push(line);
    byAccount.set(line.accountCode, rows);
  }
  for (const original of originals) {
    const rows = byAccount.get(original.accountCode) || [];
    const reversal = rows.shift();
    if (!reversal) throw new HttpError(409, `El reverso no conserva la línea FX ${original.accountCode}.`);
    byAccount.set(original.accountCode, rows);
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "FinancialFxLedgerLineSnapshot"
        ("id","tenantId","ledgerLineId","originalDebit","originalCredit","functionalDebit","functionalCredit","originalCurrency","functionalCurrency","exchangeRate","rateDate","rateSource","policyVersion")
      VALUES
        (${randomUUID()}::uuid,${input.tenantId},${reversal.id},${serializeDecimal(original.originalCredit,2)}::numeric,${serializeDecimal(original.originalDebit,2)}::numeric,${serializeDecimal(reversal.debit,2)}::numeric,${serializeDecimal(reversal.credit,2)}::numeric,${original.originalCurrency},${original.functionalCurrency},${serializeDecimal(original.exchangeRate,4)}::numeric,${original.rateDate},${original.rateSource},${FX_POLICY_VERSION})
      ON CONFLICT ("ledgerLineId") DO NOTHING
    `);
  }
}

export async function upsertBankAccountMap(input: { tenantId: string; bankAccountId: string; ledgerAccountCode: string }, db: FxDb = prisma): Promise<FxBankAccountMapRow> {
  const bank = await db.bankAccount.findFirst({ where: { id: input.bankAccountId, tenantId: input.tenantId }, select: { id: true } });
  if (!bank) throw new HttpError(404, 'Cuenta bancaria no encontrada.');
  const account = await db.chartAccount.findFirst({ where: { tenantId: input.tenantId, code: input.ledgerAccountCode, allowPosting: true }, select: { code: true } });
  if (!account) throw new HttpError(422, 'La cuenta contable bancaria debe existir en el tenant y admitir contabilización.');
  const rows = await db.$queryRaw<FxBankAccountMapRow[]>(Prisma.sql`
    INSERT INTO "FinancialFxBankAccountMap" ("tenantId","bankAccountId","ledgerAccountCode","updatedAt")
    VALUES (${input.tenantId},${input.bankAccountId},${account.code},NOW())
    ON CONFLICT ("tenantId","bankAccountId") DO UPDATE SET "ledgerAccountCode"=EXCLUDED."ledgerAccountCode","updatedAt"=NOW() RETURNING *
  `);
  return rows[0];
}

export async function getBankAccountMap(input: { tenantId: string; bankAccountId: string }, db: FxDb = prisma): Promise<FxBankAccountMapRow | null> {
  const rows = await db.$queryRaw<FxBankAccountMapRow[]>(Prisma.sql`SELECT * FROM "FinancialFxBankAccountMap" WHERE "tenantId"=${input.tenantId} AND "bankAccountId"=${input.bankAccountId} LIMIT 1`);
  return rows[0] || null;
}

export async function createFxEvent(input: {
  tenantId: string;
  kind: FxEventKind;
  sourceType: FxSourceType;
  sourceId: string;
  bankMovementId?: string | null;
  documentCurrency: string;
  settlementCurrency?: string | null;
  functionalCurrency: string;
  originalAmount: DecimalInput;
  settlementAmount?: DecimalInput | null;
  historicalRate: DecimalInput;
  currentRate: DecimalInput;
  historicalFunctionalAmount: DecimalInput;
  currentFunctionalAmount: DecimalInput;
  difference: DecimalInput;
  fiscalPeriod: string;
  rateDate: Date;
  rateSource: string;
  ledgerEntryId: string;
}, db: FxDb): Promise<FxEventRow> {
  const rows = await db.$queryRaw<FxEventRow[]>(Prisma.sql`
    INSERT INTO "FinancialFxEvent"
      ("id","tenantId","kind","sourceType","sourceId","bankMovementId","documentCurrency","settlementCurrency","functionalCurrency","originalAmount","settlementAmount","historicalRate","currentRate","historicalFunctionalAmount","currentFunctionalAmount","difference","fiscalPeriod","rateDate","rateSource","ledgerEntryId","policyVersion")
    VALUES
      (${randomUUID()}::uuid,${input.tenantId},${input.kind},${input.sourceType},${input.sourceId},${input.bankMovementId || null},${normalizeCurrency(input.documentCurrency)},${input.settlementCurrency ? normalizeCurrency(input.settlementCurrency) : null},${normalizeCurrency(input.functionalCurrency)},${serializeDecimal(input.originalAmount,2)}::numeric,${input.settlementAmount == null ? null : serializeDecimal(input.settlementAmount,2)}::numeric,${serializeDecimal(input.historicalRate,4)}::numeric,${serializeDecimal(input.currentRate,4)}::numeric,${serializeDecimal(input.historicalFunctionalAmount,2)}::numeric,${serializeDecimal(input.currentFunctionalAmount,2)}::numeric,${serializeDecimal(input.difference,2)}::numeric,${input.fiscalPeriod},${input.rateDate},${input.rateSource},${input.ledgerEntryId},${FX_POLICY_VERSION})
    RETURNING *
  `);
  return rows[0];
}

export async function getFxEvent(input: { tenantId: string; eventId: string }, db: FxDb = prisma): Promise<FxEventRow | null> {
  const rows = await db.$queryRaw<FxEventRow[]>(Prisma.sql`SELECT * FROM "FinancialFxEvent" WHERE "tenantId"=${input.tenantId} AND "id"=${input.eventId}::uuid LIMIT 1`);
  return rows[0] || null;
}

export async function listFxEvents(input: { tenantId: string; sourceType?: FxSourceType; sourceId?: string }, db: FxDb = prisma): Promise<FxEventRow[]> {
  if (input.sourceType && input.sourceId) {
    return db.$queryRaw<FxEventRow[]>(Prisma.sql`SELECT * FROM "FinancialFxEvent" WHERE "tenantId"=${input.tenantId} AND "sourceType"=${input.sourceType} AND "sourceId"=${input.sourceId} ORDER BY "createdAt","id"`);
  }
  return db.$queryRaw<FxEventRow[]>(Prisma.sql`SELECT * FROM "FinancialFxEvent" WHERE "tenantId"=${input.tenantId} ORDER BY "createdAt" DESC,"id" DESC LIMIT 500`);
}

export async function realizedOriginalAmount(input: { tenantId: string; sourceType: FxSourceType; sourceId: string }, db: FxDb = prisma): Promise<DecimalValue> {
  const rows = await db.$queryRaw<Array<{ amount: DecimalValue }>>(Prisma.sql`
    SELECT COALESCE(SUM("originalAmount"),0)::numeric AS amount FROM "FinancialFxEvent"
    WHERE "tenantId"=${input.tenantId} AND "sourceType"=${input.sourceType} AND "sourceId"=${input.sourceId} AND "kind"='realized' AND "reversedAt" IS NULL
  `);
  return money(rows[0]?.amount || '0');
}

export async function latestUnreversedRevaluation(input: { tenantId: string; sourceType: FxSourceType; sourceId: string }, db: FxDb = prisma): Promise<FxEventRow | null> {
  const rows = await db.$queryRaw<FxEventRow[]>(Prisma.sql`
    SELECT * FROM "FinancialFxEvent" WHERE "tenantId"=${input.tenantId} AND "sourceType"=${input.sourceType} AND "sourceId"=${input.sourceId} AND "kind"='unrealized' AND "reversedAt" IS NULL ORDER BY "createdAt" DESC,"id" DESC LIMIT 1
  `);
  return rows[0] || null;
}

export async function markFxEventReversed(input: { tenantId: string; eventId: string; reversalLedgerEntryId: string }, db: FxDb) {
  const rows = await db.$queryRaw<FxEventRow[]>(Prisma.sql`
    UPDATE "FinancialFxEvent" SET "reversalLedgerEntryId"=${input.reversalLedgerEntryId},"reversedAt"=NOW()
    WHERE "tenantId"=${input.tenantId} AND "id"=${input.eventId}::uuid AND "reversedAt" IS NULL RETURNING *
  `);
  if (!rows[0]) throw new HttpError(409, 'El evento cambiario ya fue reversado o no existe en el tenant.');
  return rows[0];
}
