import crypto, { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { assertApprovedFiscalDefinition, assertFiscalRuleTransition, assertFiscalRuleWindow, assertNoSupersessionCycle } from './fiscal-rule-lifecycle-policy.js';

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
  legalSourceId: string | null;
  status: 'DRAFT' | 'REVIEWED' | 'ACTIVE' | 'SUPERSEDED';
  reviewedBy: string | null;
  reviewedAt: Date | null;
  activatedBy: string | null;
  activatedAt: Date | null;
  supersedesId: string | null;
  sourceContentSha256?: string;
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
  legalSourceId: string;
  supersedesId?: string | null;
  documentation: string;
  definition: Record<string, unknown>;
  createdBy: string;
}) {
  assertFiscalRuleWindow(input.effectiveFrom, input.effectiveTo || null);
  const definition = assertApprovedFiscalDefinition(input.definition);
  return prisma.$transaction(async (tx) => {
    // A transaction-scoped advisory lock serializes version allocation and the
    // overlap check for one tenant/ruleKey without requiring privileged DB extensions.
    await tx.$queryRaw<Array<{ locked: unknown }>>(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${input.ruleKey}`}, 561)) AS "locked"
    `);

    const sources = await tx.$queryRaw<Array<{ reference: string; contentSha256: string }>>(Prisma.sql`
      SELECT "reference", "contentSha256" FROM public."FiscalLegalSource"
      WHERE "tenantId"=${input.tenantId} AND "id"=${input.legalSourceId}::uuid
    `);
    if (!sources[0]) throw new HttpError(422, 'Fuente legal de la empresa no encontrada.', { code: 'FISCAL_RULE_SOURCE_NOT_FOUND' });

    const versions = await tx.$queryRaw<Array<{ version: number }>>(Prisma.sql`
      SELECT COALESCE(MAX("version"), 0)::integer AS "version"
      FROM public."FiscalRuleVersion"
      WHERE "tenantId" = ${input.tenantId} AND "ruleKey" = ${input.ruleKey}
    `);
    const version = Number(versions[0]?.version || 0) + 1;
    const id = randomUUID();
    if (input.supersedesId) {
      const ancestry = await tx.$queryRaw<Array<{ id: string; tenantId: string; ruleKey: string; supersedesId: string | null }>>(Prisma.sql`
        WITH RECURSIVE ancestry AS (
          SELECT "id", "tenantId", "ruleKey", "supersedesId" FROM public."FiscalRuleVersion"
          WHERE "tenantId"=${input.tenantId} AND "id"=${input.supersedesId}::uuid
          UNION ALL
          SELECT prior."id", prior."tenantId", prior."ruleKey", prior."supersedesId"
          FROM public."FiscalRuleVersion" prior JOIN ancestry a ON prior."id"=a."supersedesId"
          WHERE prior."tenantId"=${input.tenantId}
        ) SELECT * FROM ancestry LIMIT 257
      `);
      try { assertNoSupersessionCycle(ancestry, id, input.supersedesId, input.tenantId, input.ruleKey); }
      catch { throw new HttpError(422, 'Cadena de sustitución fiscal inválida.', { code: 'FISCAL_RULE_SUPERSESSION_INVALID' }); }
    }
    const hash = fiscalEvidenceHash({
      tenantId: input.tenantId,
      ruleKey: input.ruleKey,
      version,
      effectiveFrom: input.effectiveFrom.toISOString(),
      effectiveTo: input.effectiveTo?.toISOString() || null,
      legalSourceId: input.legalSourceId,
      sourceContentSha256: sources[0].contentSha256,
      supersedesId: input.supersedesId || null,
      source: sources[0].reference,
      documentation: input.documentation,
      definition
    });
    const rows = await tx.$queryRaw<FiscalRuleVersionRow[]>(Prisma.sql`
      INSERT INTO public."FiscalRuleVersion" (
        "id", "tenantId", "ruleKey", "version", "effectiveFrom", "effectiveTo",
        "source", "documentation", "definition", "hash", "createdBy", "legalSourceId", "supersedesId"
      ) VALUES (
        ${id}::uuid, ${input.tenantId}, ${input.ruleKey}, ${version}, ${input.effectiveFrom}, ${input.effectiveTo || null},
        ${sources[0].reference}, ${input.documentation}, ${JSON.stringify(definition)}::jsonb, ${hash}, ${input.createdBy},
        ${input.legalSourceId}::uuid, ${input.supersedesId || null}::uuid
      )
      RETURNING *
    `);
    return rows[0];
  });
}

type RuleWithSource = FiscalRuleVersionRow & { sourceTenantId: string; sourceCreatedBy: string; sourceReviewedBy: string | null; sourceContentSha256: string };

async function findLockedRule(tx: Prisma.TransactionClient, tenantId: string, id: string) {
  const rows = await tx.$queryRaw<RuleWithSource[]>(Prisma.sql`
    SELECT fv.*, src."tenantId" AS "sourceTenantId", src."createdBy" AS "sourceCreatedBy",
           review."reviewedBy" AS "sourceReviewedBy", src."contentSha256" AS "sourceContentSha256"
    FROM public."FiscalRuleVersion" fv
    LEFT JOIN public."FiscalLegalSource" src ON src."tenantId"=fv."tenantId" AND src."id"=fv."legalSourceId"
    LEFT JOIN public."FiscalLegalSourceReview" review ON review."tenantId"=src."tenantId" AND review."legalSourceId"=src."id"
    WHERE fv."tenantId"=${tenantId} AND fv."id"=${id}::uuid
    FOR UPDATE OF fv
  `);
  if (!rows[0]) throw new HttpError(404, 'Versión fiscal no encontrada en esta empresa.', { code: 'FISCAL_RULE_NOT_FOUND' });
  return rows[0];
}

function authorizeTransition(rule: RuleWithSource, target: 'REVIEWED' | 'ACTIVE' | 'SUPERSEDED', userId: string) {
  try {
    assertFiscalRuleTransition(rule, target, { tenantId: rule.tenantId, userId }, {
      id: rule.legalSourceId || '', tenantId: rule.sourceTenantId,
      createdBy: rule.sourceCreatedBy, reviewedBy: rule.sourceReviewedBy,
      contentSha256: rule.sourceContentSha256
    });
  } catch {
    throw new HttpError(409, 'Falta evidencia de revisión o la transición fiscal no está autorizada.', { code: 'FISCAL_RULE_TRANSITION_DENIED' });
  }
}

export async function reviewFiscalRuleVersion(input: { tenantId: string; id: string; userId: string }) {
  return prisma.$transaction(async (tx) => {
    const rule = await findLockedRule(tx, input.tenantId, input.id);
    authorizeTransition(rule, 'REVIEWED', input.userId);
    const rows = await tx.$queryRaw<FiscalRuleVersionRow[]>(Prisma.sql`
      UPDATE public."FiscalRuleVersion" SET "status"='REVIEWED', "reviewedBy"=${input.userId}, "reviewedAt"=now()
      WHERE "tenantId"=${input.tenantId} AND "id"=${input.id}::uuid AND "status"='DRAFT'
      RETURNING *
    `);
    return rows[0];
  });
}

export async function activateFiscalRuleVersion(input: { tenantId: string; id: string; userId: string }) {
  return prisma.$transaction(async (tx) => {
    const rule = await findLockedRule(tx, input.tenantId, input.id);
    authorizeTransition(rule, 'ACTIVE', input.userId);
    await tx.$queryRaw<Array<{ locked: unknown }>>(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${rule.tenantId}:${rule.ruleKey}`}, 561)) AS "locked"
    `);
    if (rule.supersedesId) {
      const prior = await findLockedRule(tx, rule.tenantId, rule.supersedesId);
      if (prior.ruleKey !== rule.ruleKey || prior.status !== 'ACTIVE' || prior.effectiveFrom >= rule.effectiveFrom) {
        throw new HttpError(409, 'La regla reemplazada debe estar activa y preceder la nueva vigencia.', { code: 'FISCAL_RULE_SUPERSESSION_INVALID' });
      }
      authorizeTransition(prior, 'SUPERSEDED', input.userId);
      await tx.$executeRaw(Prisma.sql`
        UPDATE public."FiscalRuleVersion" SET "status"='SUPERSEDED'
        WHERE "tenantId"=${input.tenantId} AND "id"=${rule.supersedesId}::uuid AND "status"='ACTIVE'
      `);
    }
    const rows = await tx.$queryRaw<FiscalRuleVersionRow[]>(Prisma.sql`
      UPDATE public."FiscalRuleVersion" SET "status"='ACTIVE', "activatedBy"=${input.userId}, "activatedAt"=now()
      WHERE "tenantId"=${input.tenantId} AND "id"=${input.id}::uuid AND "status"='REVIEWED'
      RETURNING *
    `);
    return rows[0];
  });
}

export async function listFiscalRuleVersions(tenantId: string, ruleKey?: string) {
  return prisma.$queryRaw<FiscalRuleVersionRow[]>(Prisma.sql`
    SELECT *
    FROM public."FiscalRuleVersion"
    WHERE "tenantId" = ${tenantId}
      AND (${ruleKey || null}::text IS NULL OR "ruleKey" = ${ruleKey || null})
    ORDER BY "ruleKey" ASC, "version" DESC
    LIMIT 500
  `);
}

export async function resolveFiscalRules(db: FiscalDb, input: { tenantId: string; ruleKeys: string[]; effectiveAt: Date }) {
  if (!input.ruleKeys.length) return [];
  const rows = await db.$queryRaw<FiscalRuleVersionRow[]>(Prisma.sql`
    SELECT DISTINCT ON (fv."ruleKey") fv.*, src."contentSha256" AS "sourceContentSha256"
    FROM public."FiscalRuleVersion" fv
    JOIN public."FiscalLegalSource" src
      ON src."tenantId"=fv."tenantId" AND src."id"=fv."legalSourceId"
    JOIN public."FiscalLegalSourceReview" review
      ON review."tenantId"=fv."tenantId" AND review."legalSourceId"=fv."legalSourceId"
    WHERE fv."tenantId" = ${input.tenantId}
      AND fv."ruleKey" IN (${Prisma.join(input.ruleKeys)})
      AND fv."status" IN ('ACTIVE','SUPERSEDED')
      AND fv."effectiveFrom" <= ${input.effectiveAt}
      AND (fv."effectiveTo" IS NULL OR fv."effectiveTo" > ${input.effectiveAt})
      AND (fv."status"='ACTIVE' OR NOT EXISTS (
        SELECT 1 FROM public."FiscalRuleVersion" successor
        WHERE successor."tenantId"=fv."tenantId" AND successor."supersedesId"=fv."id"
          AND successor."status" IN ('ACTIVE','SUPERSEDED') AND successor."effectiveFrom" <= ${input.effectiveAt}
      ))
    ORDER BY fv."ruleKey", fv."effectiveFrom" DESC, fv."version" DESC
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
    VALUES (${input.tenantId}, ${input.kind}, ${input.prefix}, ${input.width}, 2)
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
        "effectiveFrom", "effectiveTo", "source", "documentation", "definition",
        "legalSourceId", "sourceContentSha256", "reviewedBy", "reviewedAt", "activatedBy", "activatedAt"
      ) VALUES (
        ${randomUUID()}::uuid, ${input.tenantId}, ${input.fiscalDocumentId},
        ${rule.ruleKey}, ${rule.version}, ${rule.hash}, ${rule.effectiveFrom}, ${rule.effectiveTo},
        ${rule.source}, ${rule.documentation}, ${JSON.stringify(rule.definition)}::jsonb,
        ${rule.legalSourceId}::uuid, ${rule.sourceContentSha256 || null},
        ${rule.reviewedBy}, ${rule.reviewedAt}, ${rule.activatedBy}, ${rule.activatedAt}
      )
    `);
  }
}

export async function getDocumentRuleSnapshots(tenantId: string, fiscalDocumentId: string) {
  return prisma.$queryRaw<Array<{
    ruleKey: string; ruleVersion: number; ruleHash: string; effectiveFrom: Date; effectiveTo: Date | null;
    source: string; documentation: string; definition: unknown; capturedAt: Date;
    legalSourceId: string | null; sourceContentSha256: string | null;
    reviewedBy: string | null; reviewedAt: Date | null; activatedBy: string | null; activatedAt: Date | null;
  }>>(Prisma.sql`
    SELECT "ruleKey", "ruleVersion", "ruleHash", "effectiveFrom", "effectiveTo", "source", "documentation",
           "definition", "capturedAt", "legalSourceId", "sourceContentSha256", "reviewedBy", "reviewedAt", "activatedBy", "activatedAt"
    FROM public."FiscalDocumentRuleSnapshot"
    WHERE "tenantId" = ${tenantId} AND "fiscalDocumentId" = ${fiscalDocumentId}
    ORDER BY "ruleKey" ASC
  `);
}

export async function buildCloseEvidence(db: FiscalDb, input: { tenantId: string; period: string; module: string }) {
  const [unposted, draftSales, draftPurchases, imbalancedEntries, fiscalDocuments] = await Promise.all([
    db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM public."LedgerEntry" WHERE "tenantId"=${input.tenantId} AND "fiscalPeriod"=${input.period} AND "posted"=false`),
    db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM public."SalesInvoice" WHERE "tenantId"=${input.tenantId} AND "fiscalPeriod"=${input.period} AND "status"::text='draft'`),
    db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM public."PurchaseInvoice" WHERE "tenantId"=${input.tenantId} AND "fiscalPeriod"=${input.period} AND "status"::text='draft'`),
    db.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT e."id"
        FROM public."LedgerEntry" e
        JOIN public."LedgerLine" l ON l."entryId"=e."id"
        WHERE e."tenantId"=${input.tenantId} AND e."fiscalPeriod"=${input.period} AND e."posted"=true
        GROUP BY e."id"
        HAVING ROUND(SUM(l."debit"),2) <> ROUND(SUM(l."credit"),2)
      ) q
    `),
    db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM public."FiscalDocument" WHERE "tenantId"=${input.tenantId} AND "period"=${input.period}`)
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
      ${id}::uuid, ${input.tenantId}, ${input.closingPeriodId}, ${input.period}, ${input.module},
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
    WHERE "tenantId"=${tenantId} AND "period"=${period} AND "module"=${module}
    ORDER BY "createdAt" DESC
    LIMIT 1
  `);
  return rows[0] || null;
}
