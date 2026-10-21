/** #751: only immutable, tenant-owned DRAFT provenance may enter the catalog. */
export const FISCAL_LEGAL_SOURCE_TYPES = Object.freeze([
  'official_gazette', 'statute', 'regulation', 'administrative_ruling', 'other',
] as const);
export type FiscalLegalSourceType = typeof FISCAL_LEGAL_SOURCE_TYPES[number];
export type FiscalLegalSourceDraftInput = Readonly<{
  sourceType: FiscalLegalSourceType;
  reference: string;
  title: string;
  sourceUrl?: string | null;
  publishedAt?: string | null;
  contentSha256: string;
  snapshotMetadata?: Readonly<{
    captureMethod: 'manual' | 'archive';
    contentBytes?: number;
  }>;
}>;
export type FiscalLegalSourceActor = Readonly<{ tenantId: string; userId: string }>;

const SHA256 = /^[a-f0-9]{64}$/i;
const UTC_TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const fail = (): never => { throw new Error('FISCAL_LEGAL_SOURCE_DRAFT_INVALID'); };
const text = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max && value.trim() === value;

function utcInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return false;
  // No normalized invalid dates (e.g. February 30th) and no implicit timezone.
  return parsed.toISOString().replace(/\.000Z$/, 'Z') === value.replace(/\.000Z$/, 'Z');
}

export function prepareFiscalLegalSourceDraft(
  input: FiscalLegalSourceDraftInput,
  actor: FiscalLegalSourceActor,
  clock: Date = new Date(),
) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !actor || !text(actor.tenantId, 1, 128) || !text(actor.userId, 1, 128) ||
      !(clock instanceof Date) || !Number.isFinite(clock.getTime())) fail();
  const allowed = ['sourceType', 'reference', 'title', 'sourceUrl', 'publishedAt', 'contentSha256', 'snapshotMetadata'];
  if (Object.keys(input).some(key => !allowed.includes(key)) ||
      !FISCAL_LEGAL_SOURCE_TYPES.includes(input.sourceType) ||
      !text(input.reference, 3, 160) || !text(input.title, 3, 240) ||
      typeof input.contentSha256 !== 'string' || !SHA256.test(input.contentSha256)) fail();

  const sourceUrl = input.sourceUrl ?? null;
  if (sourceUrl !== null) {
    if (!text(sourceUrl, 12, 2048)) fail();
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.hash ||
          parsed.origin === 'null') fail();
    } catch { fail(); }
  }
  const publishedAt = input.publishedAt ?? null;
  if (publishedAt !== null && (!utcInstant(publishedAt) || Date.parse(publishedAt) > clock.getTime())) fail();
  const metadata = input.snapshotMetadata ?? { captureMethod: 'manual' };
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      Object.keys(metadata).some(key => !['captureMethod', 'contentBytes'].includes(key)) ||
      !['manual', 'archive'].includes(metadata.captureMethod) ||
      (metadata.contentBytes !== undefined &&
        (!Number.isSafeInteger(metadata.contentBytes) || metadata.contentBytes < 0 || metadata.contentBytes > 50_000_000))) fail();

  return Object.freeze({
    tenantId: actor.tenantId,
    createdBy: actor.userId,
    sourceType: input.sourceType,
    reference: input.reference,
    title: input.title,
    sourceUrl,
    publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
    contentSha256: input.contentSha256.toLowerCase(),
    snapshotMetadata: Object.freeze({ ...metadata }),
    capturedAt: clock.toISOString(),
    status: 'DRAFT' as const,
  });
}

export function prepareFiscalLegalSourceReview(
  input: Readonly<{ approved: boolean; reason: string }>,
  actor: FiscalLegalSourceActor,
  source: Readonly<{ id: string; tenantId: string; createdBy: string; status: string }>,
  clock: Date = new Date(),
) {
  const reject = (): never => { throw new Error('FISCAL_LEGAL_SOURCE_REVIEW_INVALID'); };
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['approved', 'reason'].includes(key)) ||
      typeof input.approved !== 'boolean' || !text(input.reason, 15, 500) ||
      !actor || !text(actor.tenantId, 1, 128) || !text(actor.userId, 1, 128) ||
      !source || !text(source.id, 1, 128) || !text(source.tenantId, 1, 128) ||
      !text(source.createdBy, 1, 128) || source.status !== 'DRAFT' ||
      source.tenantId !== actor.tenantId || source.createdBy === actor.userId ||
      !(clock instanceof Date) || !Number.isFinite(clock.getTime())) reject();
  return Object.freeze({
    id: source.id,
    tenantId: source.tenantId,
    status: input.approved ? 'REVIEWED' as const : 'REJECTED' as const,
    reviewedBy: actor.userId,
    reviewedAt: clock.toISOString(),
    reviewReason: input.reason,
  });
}
