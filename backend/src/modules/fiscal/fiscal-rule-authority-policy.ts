/** #751/#778/#780/#781: fail-closed authority for fiscal rule versions.
 * Rates and definitions remain data, never executable code. This policy does
 * not certify legal applicability: only a verified reviewed source can issue. */
export type ReviewedFiscalLegalSource = Readonly<{
  id: string;
  tenantId: string;
  reference: string;
  contentSha256: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | string | null;
  createdBy: string;
}>;

export type FiscalRuleAuthority = Readonly<{
  legalSourceId: string;
  legalSourceHash: string;
  legalSourceReference: string;
  legalSourceReviewedBy: string;
  legalSourceReviewedAt: string;
}>;

const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reject = (): never => { throw new Error('FISCAL_RULE_SOURCE_NOT_AUTHORIZED'); };

function authorizedSource(source: ReviewedFiscalLegalSource, tenantId: string): FiscalRuleAuthority {
  if (!source || source.tenantId !== tenantId || source.status !== 'REVIEWED' ||
      typeof source.id !== 'string' || !UUID.test(source.id) ||
      !source.reference?.trim() || !SHA.test(source.contentSha256) ||
      !source.reviewedBy?.trim() || source.reviewedBy === source.createdBy ||
      !source.reviewedAt) reject();
  const reviewed = new Date(source.reviewedAt);
  if (!Number.isFinite(reviewed.getTime()) || reviewed.getTime() > Date.now() + 60_000) reject();
  return Object.freeze({
    legalSourceId: source.id,
    legalSourceHash: source.contentSha256,
    legalSourceReference: source.reference,
    legalSourceReviewedBy: source.reviewedBy,
    legalSourceReviewedAt: reviewed.toISOString(),
  });
}

/** Only a server-owned, tenant-filtered REVIEWED source may issue this snapshot. */
export function createFiscalRuleAuthority(source: ReviewedFiscalLegalSource, tenantId: string) {
  return authorizedSource(source, tenantId);
}

/** Historical rules without the immutable proof are not effective for NEW issues. */
export function assertFiscalRuleAuthority(
  embedded: unknown, source: ReviewedFiscalLegalSource, tenantId: string,
): FiscalRuleAuthority {
  const authority = authorizedSource(source, tenantId);
  if (!embedded || typeof embedded !== 'object' || Array.isArray(embedded)) reject();
  const actual = embedded as Record<string, unknown>;
  if (Object.keys(actual).sort().join('|') !== Object.keys(authority).sort().join('|')) reject();
  for (const [key, value] of Object.entries(authority)) if (actual[key] !== value) reject();
  return authority;
}

export function addRuleAuthority(
  definition: Readonly<Record<string, unknown>>, authority: FiscalRuleAuthority,
) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition) ||
      Object.hasOwn(definition, '_legalSource') ||
      Object.keys(definition).some(key => key === '__proto__' || key === 'constructor' || key === 'prototype')) reject();
  const normalized = { ...definition, _legalSource: authority };
  const json = JSON.stringify(normalized);
  if (!json || Buffer.byteLength(json, 'utf8') > 32_768) reject();
  return Object.freeze(normalized);
}
