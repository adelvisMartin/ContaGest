import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import type { prepareFiscalLegalSourceDraft } from './fiscal-legal-source-policy.js';
import { prepareFiscalLegalSourceReview } from './fiscal-legal-source-policy.js';

type Draft = ReturnType<typeof prepareFiscalLegalSourceDraft>;
type FiscalLegalSourceRow = {
  id: string; tenantId: string; sourceType: string; reference: string; title: string;
  sourceUrl: string | null; publishedAt: Date | null; capturedAt: Date;
  contentSha256: string; snapshotMetadata: unknown; status: 'DRAFT' | 'REVIEWED' | 'REJECTED';
  reviewedBy: string | null; reviewedAt: Date | null; reviewReason: string | null;
  createdBy: string; createdAt: Date;
};

/** Adds evidence without granting authority to evaluate or post a fiscal rule. */
export async function createFiscalLegalSourceDraft(draft: Draft) {
  const rows = await prisma.$queryRaw<FiscalLegalSourceRow[]>(Prisma.sql`
    INSERT INTO public."FiscalLegalSource" (
      "tenantId", "sourceType", "reference", "title", "sourceUrl", "publishedAt",
      "capturedAt", "contentSha256", "snapshotMetadata", "status", "createdBy"
    ) VALUES (
      ${draft.tenantId}, ${draft.sourceType}, ${draft.reference}, ${draft.title}, ${draft.sourceUrl},
      ${draft.publishedAt ? new Date(draft.publishedAt) : null}, ${new Date(draft.capturedAt)},
      ${draft.contentSha256}, ${JSON.stringify(draft.snapshotMetadata)}::jsonb, ${draft.status}, ${draft.createdBy}
    )
    ON CONFLICT ON CONSTRAINT "FiscalLegalSource_unique_capture" DO NOTHING
    RETURNING *
  `);
  if (!rows[0]) throw new HttpError(409, 'La misma captura legal ya existe para esta empresa.', { code: 'FISCAL_LEGAL_SOURCE_DUPLICATE' });
  return rows[0];
}

export async function listFiscalLegalSources(tenantId: string) {
  return prisma.$queryRaw<FiscalLegalSourceRow[]>(Prisma.sql`
    SELECT "id", "tenantId", "sourceType", "reference", "title", "sourceUrl",
           "publishedAt", "capturedAt", "contentSha256", "snapshotMetadata",
           "status", "createdBy", "createdAt", "reviewedBy", "reviewedAt", "reviewReason"
    FROM public."FiscalLegalSource"
    WHERE "tenantId" = ${tenantId}
    ORDER BY "capturedAt" DESC, "id" DESC
    LIMIT 200
  `);
}

/** Serialize review for one tenant/source and persist the audit in the same tx. */
export async function reviewFiscalLegalSource(input: {
  tenantId: string;
  userId: string;
  sourceId: string;
  approved: boolean;
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<FiscalLegalSourceRow[]>(Prisma.sql`
      SELECT * FROM public."FiscalLegalSource"
      WHERE "id" = ${input.sourceId}::uuid AND "tenantId" = ${input.tenantId}
      FOR UPDATE
    `);
    const source = rows[0];
    if (!source) throw new HttpError(404, 'Fuente legal no encontrada.', { code: 'FISCAL_LEGAL_SOURCE_NOT_FOUND' });
    let review: ReturnType<typeof prepareFiscalLegalSourceReview>;
    try {
      review = prepareFiscalLegalSourceReview({ approved: input.approved, reason: input.reason },
        { tenantId: input.tenantId, userId: input.userId }, source);
    } catch {
      throw new HttpError(409, 'La fuente no puede revisarse con este actor o estado.', { code: 'FISCAL_LEGAL_SOURCE_REVIEW_CONFLICT' });
    }
    const updated = await tx.$queryRaw<FiscalLegalSourceRow[]>(Prisma.sql`
      UPDATE public."FiscalLegalSource"
      SET "status" = ${review.status}, "reviewedBy" = ${review.reviewedBy},
          "reviewedAt" = ${new Date(review.reviewedAt)}, "reviewReason" = ${review.reviewReason}
      WHERE "id" = ${review.id}::uuid AND "tenantId" = ${review.tenantId} AND "status" = 'DRAFT'
      RETURNING *
    `);
    if (!updated[0]) throw new HttpError(409, 'Revisión concurrente de la fuente legal.', { code: 'FISCAL_LEGAL_SOURCE_REVIEW_RACE' });
    // Unlike the best-effort generic logger, review evidence must commit atomically.
    await tx.auditLog.create({ data: {
      tenantId: input.tenantId, userId: input.userId,
      action: 'fiscal.legal_source.reviewed', entity: 'FiscalLegalSource', entityId: source.id,
      before: { status: source.status },
      after: { status: review.status, reviewedBy: review.reviewedBy, reviewedAt: review.reviewedAt, reason: review.reviewReason }
    } });
    return updated[0];
  });
}
