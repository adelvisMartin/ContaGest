import crypto, { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';

export type FiscalDb = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;

export type FiscalRuleVersionRow = {
  id: string;
  tenantId: string;
  ruleKey: string;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  source: string;
  documentation: string;
  definition: unknown;
  hash: string;
  createdBy: string | null;
  createdAt: Date;
};

type FiscalSequenceRow = { prefix: string; width: number; value: bigint };
type CountRow = { count: bigint };

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  return String(value);
}

export function fiscalEvidenceHash(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

export async function createFiscalRuleVersion(input: {
  tenantId: string;
  ruleKey: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  source: string;
  documentation: string;
  definition: Record<string, unknown>;
  createdBy?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    // A transaction-scoped advisory lock serializes version allocation and the
    // overlap check for one tenant/ruleKey without requiring privileged DB extensions.
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${input.ruleKey}`}, 561))
    `);

    const overlapping = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM public."FiscalRuleVersion"
      WHERE "tenantId" = ${input.tenantId}::uuid
        AND "ruleKey" = ${input.ruleKey}
        AND tstzrange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::timestamptz), '[)')
            && tstzrange(${input.effectiveFrom}, COALESCE(${input.effectiveTo || null}::timestamptz, 'infinity'::timestamptz), '[)')
      LIMIT 1
    `);
    if (overlapping.length) {
      throw new HttpError(409, 'La vigencia de la regla fiscal se solapa con una versión existente.', { code: 'FISCAL_RULE_OVERLAP', ruleKey: input.ruleKey });
    }

    const versions = await tx.$queryRaw<Array<{ version: number }>>(Prisma.sql`
      SELECT COALESCE(MAX("version"), 0)::integer AS "version"
      FROM public."FiscalRuleVersion"
      WHERE "tenantId" = ${input.tenantId}::uuid AND "ruleKey" = ${input.ruleKey}
    `);
    const version = Number(versions[0]?.version || 0) + 1;
    const id = randomUUID();
    const hash = fiscalEvidenceHash({
      tenantId: input.tenantId,
      ruleKey: input.ruleKey,
      version,
      effectiveFrom: input.effectiveFrom.toISOString(),
      effectiveTo: input.effectiveTo?.toISOString() || null,
      source: input.source,
      documentation: input.documentation,
      definition: input.definition
    });
    const rows = await tx.$queryRaw<FiscalRuleVersionRow[]>(Prisma.sql`
      INSERT INTO public."FiscalRuleVersion" (
        "id", "tenantId", "ruleKey", "version", "effectiveFrom", "effectiveTo",
        "source", "documentation", "definition", "hash", "createdBy"
      ) VALUES (
        ${id}::uuid, ${input.tenantId}::uuid, ${input.ruleKey}, ${version}, ${input.effectiveFrom}, ${input.effectiveTo || null},
        ${input.source}, ${input.documentation}, ${JSON.stringify(input.definition)}::jsonb, ${hash}, ${input.createdBy || null}
      )
      RETURNING *
    `);
    return rows[0];
  });
}

export async function listFiscalRuleVersions(tenantId: string, ruleKey?: string) {
  return prisma.$queryRaw<FiscalRuleVersionRow[]>(Prisma.sql`
    SELECT *
    FROM public."FiscalRuleVersion"
    WHERE "tenantId" = ${tenantId}::uuid
      AND (${ruleKey || null}::text IS NULL OR "ruleKey" = ${ruleKey || null})
    ORDER BY "ruleKey" ASC, "version" DESC
    LIMIT 500
  `);
}

export async function resolveFiscalRules(db: FiscalDb, input: { tenantId: string; ruleKeys: string[]; effectiveAt: Date }) {
  if (!input.ruleKeys.length) return [];
  const rows = await db.$queryRaw<FiscalRuleVersionRow[]>(Prisma.sql`
    SELECT DISTINCT ON ("ruleKey") *
    FROM public."FiscalRuleVersion"
    WHERE "tenantId" = ${input.tenantId}::uuid
      AND "ruleKey" IN (${Prisma.join(input.ruleKeys)})
      AND "effectiveFrom" <= ${input.effectiveAt}
      AND ("effectiveTo" IS NULL OR "effectiveTo" > ${input.effectiveAt})
    ORDER BY "ruleKey", "effectiveFrom" DESC, "version" DESC
  `);
  const found = new Set(rows.map((row) => row.ruleKey));
  const missing = input.ruleKeys.filter((key) => !found.has(key));
  if (missing.length) {
    throw new HttpError(422, 'No existe una regla fiscal vigente para todos los ruleKeys solicitados.', { code: 'FISCAL_RULE_NOT_EFFECTIVE', missing });
  }
  return rows;
}

export async function allocateFiscalNumber(db: FiscalDb, input: { tenantId: string; kind: string; prefix: string; width: number }) {
  const rows = await db.$queryRaw<FiscalSequenceRow[]>(Prisma.sql`
    INSERT INTO public."FiscalSequence" ("tenantId", "kind", "prefix", "width", "nextValue")
    VALUES (${input.tenantId}::uuid, ${input.kind}, ${input.prefix}, ${input.width}, 2)
    ON CONFLICT ("tenantId", "kind") DO UPDATE
      SET "nextValue" = public."FiscalSequence"."nextValue" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "prefix", "width", ("nextValue" - 1)::bigint AS "value"
  `);
  const row = rows[0];
  if (!row) throw new HttpError(500, 'No fue posible asignar la secuencia fiscal.', { code: 'FISCAL_SEQUENCE_UNAVAILABLE' });
  return `${row.prefix}${row.value.toString().padStart(row.width, '0')}`;
}

export async function recordDocumentRuleSnapshots(db: FiscalDb, input: { tenantId: string; fiscalDocumentId: string; rules: FiscalRuleVersionRow[] }) {
  for (const rule of input.rules) {
    await db.$executeRaw(Prisma.sql`
      INSERT INTO public."FiscalDocumentRuleSnapshot" (
        "id", "tenantId", "fiscalDocumentId", "ruleKey", "ruleVersion", "ruleHash",
        "effectiveFrom", "effectiveTo", "source", "documentation", "definition"
      ) VALUES (
        ${randomUUID()}::uuid, ${input.tenantId}::uuid, ${input.fiscalDocumentId}::uuid,
        ${rule.ruleKey}, ${rule.version}, ${rule.hash}, ${rule.effectiveFrom}, ${rule.effectiveTo},
        ${rule.source}, ${rule.documentation}, ${JSON.stringify(rule.definition)}::jsonb
      )
    `);
  }
}

export async function getDocumentRuleSnapshots(tenantId: string, fiscalDocumentId: string) {
  return prisma.$queryRaw<Array<{
    ruleKey: string; ruleVersion: number; ruleHash: string; effectiveFrom: Date; effectiveTo: Date | null;
    source: string; documentation: string; definition: unknown; capturedAt: Date;
  }>>(Prisma.sql`
    SELECT "ruleKey", "ruleVersion", "ruleHash", "effectiveFrom", "effectiveTo", "source", "documentation", "definition", "capturedAt"
    FROM public."FiscalDocumentRuleSnapshot"
    WHERE "tenantId" = ${tenantId}::uuid AND "fiscalDocumentId" = ${fiscalDocumentId}::uuid
    ORDER BY "ruleKey" ASC
  `);
}

export async function buildCloseEvidence(db: FiscalDb, input: { tenantId: string; period: string; module: string }) {
  const [unposted, draftSales, draftPurchases, imbalancedEntries, fiscalDocuments] = await Promise.all([
    db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM public."LedgerEntry" WHERE "tenantId"=${input.tenantId}::uuid AND "fiscalPeriod"=${input.period} AND "posted"=false`),
    db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM public."SalesInvoice" WHERE "tenantId"=${input.tenantId}::uuid AND "fiscalPeriod"=${input.period} AND "status"::text='draft'`),
    db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM public."PurchaseInvoice" WHERE "tenantId"=${input.tenantId}::uuid AND "fiscalPeriod"=${input.period} AND "status"::text='draft'`),
    db.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT e."id"
        FROM public."LedgerEntry" e
        JOIN public."LedgerLine" l ON l."entryId"=e."id"
        WHERE e."tenantId"=${input.tenantId}::uuid AND e."fiscalPeriod"=${input.period} AND e."posted"=true
        GROUP BY e."id"
        HAVING ROUND(SUM(l."debit"),2) <> ROUND(SUM(l."credit"),2)
      ) q
    `),
    db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM public."FiscalDocument" WHERE "tenantId"=${input.tenantId}::uuid AND "period"=${input.period}`)
  ]);

  return {
    period: input.period,
    module: input.module,
    unpostedLedgerEntries: Number(unposted[0]?.count || 0n),
    draftSalesDocuments: Number(draftSales[0]?.count || 0n),
    draftPurchaseDocuments: Number(draftPurchases[0]?.count || 0n),
    imbalancedPostedEntries: Number(imbalancedEntries[0]?.count || 0n),
    fiscalDocumentCount: Number(fiscalDocuments[0]?.count || 0n)
  };
}

export function assertFiscalClosePreconditions(prechecks: Awaited<ReturnType<typeof buildCloseEvidence>>) {
  const blockers = {
    unpostedLedgerEntries: prechecks.unpostedLedgerEntries,
    draftSalesDocuments: prechecks.draftSalesDocuments,
    draftPurchaseDocuments: prechecks.draftPurchaseDocuments,
    imbalancedPostedEntries: prechecks.imbalancedPostedEntries
  };
  if (Object.values(blockers).some((value) => value > 0)) {
    throw new HttpError(409, 'El período no puede cerrarse porque existen invariantes fiscales/contables pendientes.', { code: 'FISCAL_CLOSE_PRECHECK_FAILED', blockers });
  }
}

export async function persistCloseEvidence(db: FiscalDb, input: {
  tenantId: string;
  closingPeriodId: string;
  period: string;
  module: string;
  prechecks: Record<string, unknown>;
  postCloseReport: Record<string, unknown>;
  postCloseHash: string;
  closedBy?: string | null;
}) {
  const id = randomUUID();
  await db.$executeRaw(Prisma.sql`
    INSERT INTO public."FiscalCloseEvidence" (
      "id", "tenantId", "closingPeriodId", "period", "module", "prechecks", "postCloseReport", "postCloseHash", "closedBy"
    ) VALUES (
      ${id}::uuid, ${input.tenantId}::uuid, ${input.closingPeriodId}::uuid, ${input.period}, ${input.module},
      ${JSON.stringify(input.prechecks)}::jsonb, ${JSON.stringify(input.postCloseReport)}::jsonb, ${input.postCloseHash}, ${input.closedBy || null}
    )
  `);
  return { id, ...input };
}

export async function getCloseEvidence(tenantId: string, period: string, module: string) {
  const rows = await prisma.$queryRaw<Array<{
    id: string; period: string; module: string; prechecks: unknown; postCloseReport: unknown; postCloseHash: string; closedBy: string | null; createdAt: Date;
  }>>(Prisma.sql`
    SELECT "id", "period", "module", "prechecks", "postCloseReport", "postCloseHash", "closedBy", "createdAt"
    FROM public."FiscalCloseEvidence"
    WHERE "tenantId"=${tenantId}::uuid AND "period"=${period} AND "module"=${module}
    ORDER BY "createdAt" DESC
    LIMIT 1
  `);
  return rows[0] || null;
}
