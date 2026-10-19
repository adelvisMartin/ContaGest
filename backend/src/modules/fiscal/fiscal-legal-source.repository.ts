import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import type { prepareFiscalLegalSourceDraft } from './fiscal-legal-source-policy.js';

type Draft = ReturnType<typeof prepareFiscalLegalSourceDraft>;
type FiscalLegalSourceRow = {
  id: string; tenantId: string; sourceType: string; reference: string; title: string;
  sourceUrl: string | null; publishedAt: Date | null; capturedAt: Date;
  contentSha256: string; snapshotMetadata: unknown; status: 'DRAFT';
  createdBy: string; createdAt: Date;
  reviewedBy?: string | null; reviewedAt?: Date | null; reviewReason?: string | null;
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
    SELECT src.*, review."reviewedBy", review."reviewedAt", review."reason" AS "reviewReason"
    FROM public."FiscalLegalSource" src
    LEFT JOIN public."FiscalLegalSourceReview" review
      ON review."tenantId"=src."tenantId" AND review."legalSourceId"=src."id"
    WHERE src."tenantId" = ${tenantId}
    ORDER BY src."capturedAt" DESC, src."id" DESC
    LIMIT 200
  `);
}

/** Approval is an append-only second-person attestation, not a mutation of the capture. */
export async function reviewFiscalLegalSource(input: { tenantId: string; id: string; reviewedBy: string; reason: string }) {
  const rows = await prisma.$queryRaw<Array<{ tenantId: string; legalSourceId: string; reviewedBy: string; reason: string; reviewedAt: Date }>>(Prisma.sql`
    INSERT INTO public."FiscalLegalSourceReview" ("tenantId", "legalSourceId", "reviewedBy", "reason")
    SELECT src."tenantId", src."id", ${input.reviewedBy}, ${input.reason}
    FROM public."FiscalLegalSource" src
    WHERE src."tenantId"=${input.tenantId} AND src."id"=${input.id}::uuid
      AND src."createdBy"<>${input.reviewedBy}
    ON CONFLICT ON CONSTRAINT "FiscalLegalSourceReview_pk" DO NOTHING
    RETURNING *
  `);
  if (!rows[0]) throw new HttpError(409, 'La fuente no existe, ya fue revisada o el autor no puede revisarla.', { code: 'FISCAL_LEGAL_SOURCE_REVIEW_DENIED' });
  return rows[0];
}
