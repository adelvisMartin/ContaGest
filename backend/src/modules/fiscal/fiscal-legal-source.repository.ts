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
           "status", "createdBy", "createdAt"
    FROM public."FiscalLegalSource"
    WHERE "tenantId" = ${tenantId}
    ORDER BY "capturedAt" DESC, "id" DESC
    LIMIT 200
  `);
}
