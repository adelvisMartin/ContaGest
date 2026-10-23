import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { assertFiscalRuleSnapshotIntegrity, assertFiscalRuleVersionIntegrity, fiscalEvidenceHash } from './fiscal-rule-snapshot-integrity.js';
import { assertRuleReview, assertRuleActivation, assertSupersession, assertFiscalRatioDefinition, type LegalEvidence, type VersionEvidence } from './fiscal-rule-governance-policy.js';
export { fiscalEvidenceHash } from './fiscal-rule-snapshot-integrity.js';

export type FiscalDb = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;

/** Serialize fiscal issue, external capture and close/reopen for the same tenant
 * and calendar period. A shared advisory lock works even when a closing row
 * has not been created yet; it is scoped to one PG transaction only. */
export async function lockFiscalPeriodMutation(
  db: FiscalDb, tenantId: string, period: string,
): Promise<void> {
  if (!tenantId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    throw new HttpError(422, 'Período o tenant inválido para mutación fiscal.',
      { code: 'FISCAL_PERIOD_LOCK_SCOPE_INVALID' });
  await db.$queryRaw<Array<{ locked: unknown }>>(Prisma.sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${'fiscal-period:'+tenantId+':'+period}, 910)
    ) AS "locked"
  `);
}

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
  legalSourceSha256: string | null;
  status: 'DRAFT' | 'REVIEWED' | 'ACTIVE' | 'SUPERSEDED';
  reviewedBy: string | null;
  activatedBy: string | null;
  supersedesId: string | null;
};

type FiscalSequenceRow = { prefix: string; width: number; value: bigint };
type CountRow = { count: bigint };

export async function createFiscalRuleVersion(input: {
  tenantId: string;
  ruleKey: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  source: string;
  documentation: string;
  definition: Record<string, unknown>;
  createdBy?: string | null;
  legalSourceId?: string | null;
  supersedesId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    // A transaction-scoped advisory lock serializes version allocation and the
    // overlap check for one tenant/ruleKey without requiring privileged DB extensions.
    await tx.$queryRaw<Array<{ locked: unknown }>>(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${input.ruleKey}`}, 561)) AS "locked"
    `);

    const overlapping = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM public."FiscalRuleVersion"
      WHERE "tenantId" = ${input.tenantId}
        AND "ruleKey" = ${input.ruleKey}
        -- A staged replacement may overlap exactly its own predecessor.
        -- Only ACTIVE candidates participate in productive rule resolution.
        AND ("id" <> ${input.supersedesId || null}::uuid OR ${input.supersedesId || null}::uuid IS NULL)
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
      WHERE "tenantId" = ${input.tenantId} AND "ruleKey" = ${input.ruleKey}
    `);
    const version = Number(versions[0]?.version || 0) + 1;
    // Legacy drafts are permitted for audit, but cannot be activated without
    // an independently reviewed legal source and its captured content digest.
    let legalSourceSha256: string | null = null;
    if (input.legalSourceId) {
      const sources = await tx.$queryRaw<LegalEvidence[]>(Prisma.sql`
        SELECT "id", "tenantId", "status", "reference",
               "contentSha256", "reviewedBy", "reviewedAt"
        FROM public."FiscalLegalSource"
        WHERE "tenantId"=${input.tenantId} AND "id"=${input.legalSourceId}::uuid FOR SHARE
      `);
      if (sources[0]?.status !== 'REVIEWED' || sources[0].reviewedBy === null) {
        throw new HttpError(422, 'La fuente legal debe existir y estar revisada antes de vincularla.', { code: 'FISCAL_RULE_SOURCE_NOT_REVIEWED' });
      }
      legalSourceSha256 = sources[0].contentSha256;
      // Source reference is derived from the reviewed capture, not trusted
      // independently as a substitute for legal provenance.
      if (sources[0].reference !== input.source) {
        throw new HttpError(422, 'La referencia debe coincidir con la fuente legal capturada.', { code: 'FISCAL_RULE_SOURCE_REFERENCE_MISMATCH' });
      }
    }
    if (input.supersedesId) {
      const parents = await tx.$queryRaw<FiscalRuleVersionRow[]>(Prisma.sql`
        SELECT * FROM public."FiscalRuleVersion"
        WHERE "tenantId"=${input.tenantId} AND "id"=${input.supersedesId}::uuid
      `);
      if (!parents[0] || parents[0].ruleKey !== input.ruleKey) {
        throw new HttpError(422, 'Supersession debe mantener la misma familia y tenant.', { code: 'FISCAL_RULE_SUPERSESSION_INVALID' });
      }
    }
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
        "source", "documentation", "definition", "hash", "createdBy",
        "legalSourceId", "legalSourceSha256", "supersedesId"
      ) VALUES (
        ${id}::uuid, ${input.tenantId}, ${input.ruleKey}, ${version}, ${input.effectiveFrom}, ${input.effectiveTo || null},
        ${input.source}, ${input.documentation}, ${JSON.stringify(input.definition)}::jsonb, ${hash}, ${input.createdBy || null},
        ${input.legalSourceId || null}::uuid, ${legalSourceSha256}, ${input.supersedesId || null}::uuid
      )
      RETURNING *
    `);
    await tx.auditLog.create({data: {
      tenantId: input.tenantId, userId: input.createdBy || null,
      entity: 'FiscalRuleVersion', entityId: id, action: 'fiscal.rule.draft_captured',
      after: { ruleKey: input.ruleKey, version, hash, legalSourceId: input.legalSourceId || null,
        legalSourceSha256, status: 'DRAFT' }
    }});
    return rows[0];
  });
}


/** All review, activation and supersession updates commit with the audit trail. */
export async function transitionFiscalRule(input: {
  tenantId: string; ruleId: string; actorId: string;
  action: 'REVIEW' | 'ACTIVATE'; reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<FiscalRuleVersionRow[]>(Prisma.sql`
      SELECT * FROM public."FiscalRuleVersion"
      WHERE "tenantId"=${input.tenantId} AND "id"=${input.ruleId}::uuid FOR UPDATE
    `);
    const rule = rows[0];
    if (!rule) throw new HttpError(404, 'Versión fiscal no encontrada.', { code: 'FISCAL_RULE_NOT_FOUND' });
    const sources = await tx.$queryRaw<LegalEvidence[]>(Prisma.sql`
      SELECT "id", "tenantId", "status", "reference", "contentSha256", "reviewedBy", "reviewedAt"
      FROM public."FiscalLegalSource"
      WHERE "tenantId"=${input.tenantId} AND "id"=${rule.legalSourceId}::uuid FOR SHARE
    `);
    const source = sources[0];
    try {
      if (input.action === 'REVIEW') assertRuleReview(rule as VersionEvidence, input.actorId, source);
      else assertRuleActivation(rule as VersionEvidence, input.actorId, source);
      assertFiscalRatioDefinition(rule.definition);
    } catch {
      throw new HttpError(409, 'La revisión, fórmula o activación fiscal no satisface la autoridad requerida.', { code: 'FISCAL_RULE_GOVERNANCE_DENIED' });
    }

    if (input.action === 'ACTIVATE') {
      // Same advisory key as version allocation and the DB trigger.
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${input.tenantId + ':' + rule.ruleKey},561)) AS "locked"
      `);
      if (rule.supersedesId) {
        const predecessors = await tx.$queryRaw<FiscalRuleVersionRow[]>(Prisma.sql`
          SELECT * FROM public."FiscalRuleVersion"
          WHERE "id"=${rule.supersedesId}::uuid AND "tenantId"=${input.tenantId} FOR UPDATE
        `);
        const old = predecessors[0];
        try { assertSupersession(rule as VersionEvidence, old as VersionEvidence); }
        catch { throw new HttpError(409, 'Supersession inválida o no acíclica.', { code: 'FISCAL_RULE_SUPERSESSION_INVALID' }); }
        await tx.$executeRaw(Prisma.sql`
          UPDATE public."FiscalRuleVersion" SET "status"='SUPERSEDED'
          WHERE "id"=${old.id}::uuid AND "tenantId"=${input.tenantId} AND "status"='ACTIVE'
        `);
      }
    }
    const result = input.action === 'REVIEW'
      ? await tx.$queryRaw<FiscalRuleVersionRow[]>(Prisma.sql`
          UPDATE public."FiscalRuleVersion"
          SET "status"='REVIEWED',"reviewedBy"=${input.actorId},"reviewedAt"=now()
          WHERE "tenantId"=${input.tenantId} AND "id"=${rule.id}::uuid AND "status"='DRAFT'
          RETURNING *
        `)
      : await tx.$queryRaw<FiscalRuleVersionRow[]>(Prisma.sql`
          UPDATE public."FiscalRuleVersion"
          SET "status"='ACTIVE',"activatedBy"=${input.actorId},"activatedAt"=now()
          WHERE "tenantId"=${input.tenantId} AND "id"=${rule.id}::uuid AND "status"='REVIEWED'
          RETURNING *
        `);
    if (!result[0]) throw new HttpError(409, 'Estado fiscal modificado concurrentemente.', { code: 'FISCAL_RULE_REVIEW_RACE' });
    await tx.auditLog.create({data: {
      tenantId: input.tenantId, userId: input.actorId, action: input.action === 'REVIEW' ? 'fiscal.rule.reviewed' : 'fiscal.rule.activated',
      entity: 'FiscalRuleVersion', entityId: rule.id,
      before: {status: rule.status, hash: rule.hash},
      after: {status: result[0].status, legalSourceId: rule.legalSourceId, sourceSha256: rule.legalSourceSha256, reason: input.reason}
    }});
    return result[0];
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
    SELECT r.*
    FROM public."FiscalRuleVersion" r
    JOIN public."FiscalLegalSource" s
      ON s."tenantId"=r."tenantId" AND s."id"=r."legalSourceId"
    WHERE r."tenantId" = ${input.tenantId}
      AND r."ruleKey" IN (${Prisma.join(input.ruleKeys)})
      AND r."status" = 'ACTIVE' AND s."status" = 'REVIEWED'
      AND r."legalSourceSha256" = s."contentSha256"
      AND r."effectiveFrom" <= ${input.effectiveAt}
      AND (r."effectiveTo" IS NULL OR r."effectiveTo" > ${input.effectiveAt})
    ORDER BY r."ruleKey", r."effectiveFrom" DESC, r."version" DESC
  `);
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.ruleKey, (counts.get(row.ruleKey) ?? 0) + 1);
  const missing = input.ruleKeys.filter(key => !counts.has(key));
  if (missing.length) {
    throw new HttpError(422, 'No existe una regla fiscal vigente para todos los ruleKeys solicitados.', { code: 'FISCAL_RULE_NOT_EFFECTIVE', missing });
  }
  if (input.ruleKeys.some(key => counts.get(key) !== 1)) {
    throw new HttpError(409, 'Más de una regla fiscal vigente coincide con el selector.', { code: 'FISCAL_RULE_AMBIGUOUS' });
  }
  try {
    for (const rule of rows) assertFiscalRuleVersionIntegrity(rule, input.tenantId, input.effectiveAt);
  } catch {
    throw new HttpError(409, 'La regla fiscal vigente no conserva evidencia íntegra.', { code: 'FISCAL_RULE_EVIDENCE_INTEGRITY' });
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
    try { assertFiscalRuleVersionIntegrity(rule, input.tenantId, rule.effectiveFrom); }
    catch { throw new HttpError(409, 'La regla fiscal aplicada no conserva evidencia íntegra.', { code: 'FISCAL_RULE_EVIDENCE_INTEGRITY' }); }
    await db.$executeRaw(Prisma.sql`
      INSERT INTO public."FiscalDocumentRuleSnapshot" (
        "id", "tenantId", "fiscalDocumentId", "ruleKey", "ruleVersion", "ruleHash",
        "effectiveFrom", "effectiveTo", "source", "documentation", "definition",
        "legalSourceId", "legalSourceSha256"
      ) VALUES (
        ${randomUUID()}::uuid, ${input.tenantId}, ${input.fiscalDocumentId},
        ${rule.ruleKey}, ${rule.version}, ${rule.hash}, ${rule.effectiveFrom}, ${rule.effectiveTo},
        ${rule.source}, ${rule.documentation}, ${JSON.stringify(rule.definition)}::jsonb,
        ${rule.legalSourceId}::uuid, ${rule.legalSourceSha256}
      )
    `);
  }
}

export async function getDocumentRuleSnapshots(tenantId: string, fiscalDocumentId: string) {
  const snapshots = await prisma.$queryRaw<Array<{
    tenantId: string; ruleKey: string; ruleVersion: number; ruleHash: string; effectiveFrom: Date; effectiveTo: Date | null;
    source: string; documentation: string; definition: unknown; capturedAt: Date;
    legalSourceId: string | null; legalSourceSha256: string | null;
  }>>(Prisma.sql`
    SELECT "tenantId", "ruleKey", "ruleVersion", "ruleHash", "effectiveFrom", "effectiveTo", "source", "documentation", "definition", "capturedAt", "legalSourceId", "legalSourceSha256"
    FROM public."FiscalDocumentRuleSnapshot"
    WHERE "tenantId" = ${tenantId} AND "fiscalDocumentId" = ${fiscalDocumentId}
    ORDER BY "ruleKey" ASC
  `);
  try {
    for (const snapshot of snapshots) assertFiscalRuleSnapshotIntegrity(snapshot, tenantId);
  } catch {
    throw new HttpError(409, 'La evidencia histórica de la regla fiscal no coincide con su hash original.', { code: 'FISCAL_RULE_SNAPSHOT_INTEGRITY' });
  }
  return snapshots;
}

export async function buildCloseEvidence(db: FiscalDb, input: { tenantId: string; period: string; module: string }) {
  const [unposted, draftSales, draftPurchases, imbalancedEntries, fiscalDocuments, unverifiedFiscalDocuments] = await Promise.all([
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
    db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM public."FiscalDocument" WHERE "tenantId"=${input.tenantId} AND "period"=${input.period}`),
    // Legacy/external fiscal documents without rule snapshots are evidence,
    // not certified fiscal issues. They must block an authoritative close.
    db.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count FROM public."FiscalDocument" d
      WHERE d."tenantId"=${input.tenantId} AND d."period"=${input.period}
        AND (d."status" <> 'issued' OR NOT EXISTS (
          SELECT 1 FROM public."FiscalDocumentRuleSnapshot" s
          WHERE s."tenantId"=d."tenantId" AND s."fiscalDocumentId"=d."id"
        ))
    `)
  ]);

  return {
    period: input.period,
    module: input.module,
    unpostedLedgerEntries: Number(unposted[0]?.count || 0n),
    draftSalesDocuments: Number(draftSales[0]?.count || 0n),
    draftPurchaseDocuments: Number(draftPurchases[0]?.count || 0n),
    imbalancedPostedEntries: Number(imbalancedEntries[0]?.count || 0n),
    fiscalDocumentCount: Number(fiscalDocuments[0]?.count || 0n),
    unverifiedFiscalDocuments: Number(unverifiedFiscalDocuments[0]?.count || 0n)
  };
}

export function assertFiscalClosePreconditions(prechecks: Awaited<ReturnType<typeof buildCloseEvidence>>) {
  const blockers = {
    unpostedLedgerEntries: prechecks.unpostedLedgerEntries,
    draftSalesDocuments: prechecks.draftSalesDocuments,
    draftPurchaseDocuments: prechecks.draftPurchaseDocuments,
    imbalancedPostedEntries: prechecks.imbalancedPostedEntries,
    unverifiedFiscalDocuments: prechecks.unverifiedFiscalDocuments
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
