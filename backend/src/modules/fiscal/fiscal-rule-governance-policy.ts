/** #751: a reviewed source and independently reviewed, approved DSL are required. */
export type FiscalRuleState = 'DRAFT' | 'REVIEWED' | 'ACTIVE' | 'SUPERSEDED';
export type FiscalRatioDefinition = Readonly<{
  formula: 'RATIO_MINOR_UNITS';
  numerator: number;
  denominator: number;
  basis: 'taxable_minor' | 'tax_minor' | 'payment_minor';
}>;
export type LegalEvidence = Readonly<{
  id: string; tenantId: string; status: string; reference: string;
  contentSha256: string; reviewedBy: string | null; reviewedAt: Date | null;
}>;
export type VersionEvidence = Readonly<{
  id: string; tenantId: string; ruleKey: string; version: number; status: FiscalRuleState;
  createdBy: string | null; reviewedBy: string | null; activatedBy: string | null;
  legalSourceId: string | null; legalSourceSha256: string | null;
  definition: unknown;
}>;
const SHA = /^[a-f0-9]{64}$/;
const fail = (): never => { throw new Error('FISCAL_RULE_GOVERNANCE_DENIED'); };
const actor = (s: unknown): s is string => typeof s === 'string' && s.trim() === s && s.length > 0 && s.length < 256;

/** Static formula vocabulary; no eval, SQL fragments or dynamic JS from persistence. */
export function assertFiscalRatioDefinition(value: unknown): asserts value is FiscalRatioDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 4 ||
      !['formula', 'numerator', 'denominator', 'basis'].every(k => Object.hasOwn(v, k)) ||
      v.formula !== 'RATIO_MINOR_UNITS' ||
      !['taxable_minor', 'tax_minor', 'payment_minor'].includes(String(v.basis)) ||
      typeof v.basis !== 'string' ||
      typeof v.numerator !== 'number' || !Number.isSafeInteger(v.numerator) || v.numerator < 0 ||
      typeof v.denominator !== 'number' || !Number.isSafeInteger(v.denominator) || v.denominator <= 0 ||
      v.numerator > v.denominator) fail();
}

/** Source review alone does not establish a tax rate; the rule needs independent review. */
export function assertReviewedSource(rule: VersionEvidence, source: LegalEvidence): void {
  if (!rule || !source || source.status !== 'REVIEWED' ||
      rule.tenantId !== source.tenantId || rule.legalSourceId !== source.id ||
      !SHA.test(source.contentSha256) || rule.legalSourceSha256 !== source.contentSha256 ||
      !actor(source.reference) || !actor(source.reviewedBy) ||
      !(source.reviewedAt instanceof Date) || !Number.isFinite(source.reviewedAt.getTime())) fail();
  assertFiscalRatioDefinition(rule.definition);
}
export function assertRuleReview(rule: VersionEvidence, reviewerId: string, source: LegalEvidence): void {
  assertReviewedSource(rule, source);
  if (rule.status !== 'DRAFT' || !actor(reviewerId) || !actor(rule.createdBy) ||
      reviewerId === rule.createdBy || rule.reviewedBy !== null || rule.activatedBy !== null) fail();
}
export function assertRuleActivation(rule: VersionEvidence, activatorId: string, source: LegalEvidence): void {
  assertReviewedSource(rule, source);
  if (rule.status !== 'REVIEWED' || !actor(activatorId) || !actor(rule.createdBy) ||
      !actor(rule.reviewedBy) || rule.reviewedBy === rule.createdBy ||
      activatorId === rule.createdBy || activatorId === rule.reviewedBy ||
      rule.activatedBy !== null) fail();
}
export function assertSupersession(newer: VersionEvidence, predecessor: VersionEvidence): void {
  if (!newer || !predecessor || newer.id === predecessor.id ||
      newer.tenantId !== predecessor.tenantId || newer.ruleKey !== predecessor.ruleKey ||
      !Number.isSafeInteger(newer.version) || !Number.isSafeInteger(predecessor.version) ||
      newer.version <= predecessor.version || predecessor.status !== 'ACTIVE') fail();
}
