import { createHash } from 'node:crypto';

// Shared pure gate for #751 and the nine P0 Venezuela tax/accounting tickets.
// This is NOT a legal-rate catalog, posting service, migration or DB authority.
export const VE_RULE_FAMILIES = Object.freeze([
  'IVA', 'RET_IVA', 'ISLR', 'IGTF', 'MUNICIPAL', 'FAOV', 'IVSS', 'INCES',
] as const);
export type VeRuleFamily = typeof VE_RULE_FAMILIES[number];

export type VeReviewedRule = Readonly<{
  id: string;
  tenantId: string;
  family: VeRuleFamily;
  selector: string;
  version: number;
  effectiveFrom: string; // UTC calendar date YYYY-MM-DD, start inclusive
  effectiveTo: string | null; // end exclusive, never an implicit local timezone
  status: 'ACTIVE' | 'DRAFT' | 'REVIEWED' | 'SUPERSEDED';
  sourceId: string;
  sourceReference: string;
  sourceContentSha256: string;
  reviewedBy: string;
  reviewedAt: string; // UTC timestamp
  numerator: number; // never a built-in statutory rate
  denominator: number;
}>;

const DATE = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const HASH = /^[a-f0-9]{64}$/i;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;

function rejected(): never { throw new Error('VE_FISCAL_RULE_NOT_AUTHORIZED'); }
function isDate(value: unknown): value is string {
  return typeof value === 'string' && DATE.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function isUtc(value: unknown): value is string {
  return typeof value === 'string' && UTC.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    // Reject invalid calendar dates normalized by Date.parse (Feb 30 etc.).
    new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
}
function stringId(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
}
function int(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function assertReviewedVeRule(value: VeReviewedRule): VeReviewedRule {
  if (!value || typeof value !== 'object' || !stringId(value.id) ||
      !stringId(value.tenantId) || !VE_RULE_FAMILIES.includes(value.family) ||
      !stringId(value.selector) || !int(value.version) || value.version === 0 ||
      !isDate(value.effectiveFrom) ||
      (value.effectiveTo !== null && (!isDate(value.effectiveTo) || value.effectiveTo <= value.effectiveFrom)) ||
      value.status !== 'ACTIVE' || !stringId(value.sourceId) ||
      !stringId(value.sourceReference) || !HASH.test(value.sourceContentSha256) ||
      !stringId(value.reviewedBy) || !isUtc(value.reviewedAt) ||
      Date.parse(value.reviewedAt) > Date.now() + 60_000 ||
      !int(value.numerator) || !int(value.denominator) ||
      value.denominator === 0 || value.numerator > value.denominator) rejected();
  return value;
}

export function resolveReviewedVeRule(
  rules: readonly VeReviewedRule[],
  query: Readonly<{ tenantId: string; family: VeRuleFamily; selector: string; eventDate: string }>,
): VeReviewedRule {
  if (!query || !isDate(query.eventDate) || !stringId(query.tenantId) ||
      !stringId(query.selector) || !VE_RULE_FAMILIES.includes(query.family)) rejected();
  const matching = rules.filter(rule =>
    rule.tenantId === query.tenantId && rule.family === query.family &&
    rule.selector === query.selector && rule.effectiveFrom <= query.eventDate &&
    (rule.effectiveTo === null || query.eventDate < rule.effectiveTo));
  // Missing, conflicting, unreviewed or superseded rules never generate a rate.
  if (matching.length !== 1) rejected();
  return assertReviewedVeRule(matching[0]);
}

export function calculateReviewedVeTaxPreview(
  rule: VeReviewedRule,
  input: Readonly<{ tenantId: string; eventDate: string; baseMinor: number }>,
) {
  assertReviewedVeRule(rule);
  if (!input || input.tenantId !== rule.tenantId || !isDate(input.eventDate) ||
      input.eventDate < rule.effectiveFrom ||
      (rule.effectiveTo !== null && input.eventDate >= rule.effectiveTo) ||
      !int(input.baseMinor)) rejected();
  // Round half up with exact integer arithmetic; do not use binary floating
  // point for money, do not create LedgerEntry or prescribe accounts here.
  const value = BigInt(input.baseMinor) * BigInt(rule.numerator);
  const denominator = BigInt(rule.denominator);
  const result = (value * 2n + denominator) / (2n * denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) rejected();
  const applied = {
    tenantId: rule.tenantId, ruleId: rule.id, family: rule.family,
    selector: rule.selector, version: rule.version, eventDate: input.eventDate,
    sourceId: rule.sourceId, sourceReference: rule.sourceReference,
    sourceContentSha256: rule.sourceContentSha256,
    reviewedBy: rule.reviewedBy, reviewedAt: rule.reviewedAt,
    numerator: rule.numerator, denominator: rule.denominator,
    baseMinor: input.baseMinor, taxMinor: Number(result),
  };
  const snapshotSha256 = createHash('sha256').update(JSON.stringify(applied), 'utf8').digest('hex');
  return Object.freeze({ ...applied, snapshotSha256 });
}

export function assertBalancedVePostingPreview(lines: readonly Readonly<{
  accountRole: string; debitMinor: number; creditMinor: number;
}>[]) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 200) rejected();
  let debit = 0n, credit = 0n;
  for (const line of lines) {
    if (!stringId(line.accountRole) || !int(line.debitMinor) || !int(line.creditMinor) ||
        (line.debitMinor > 0 && line.creditMinor > 0)) rejected();
    debit += BigInt(line.debitMinor);
    credit += BigInt(line.creditMinor);
  }
  if (debit === 0n || debit !== credit || debit > BigInt(Number.MAX_SAFE_INTEGER)) rejected();
  return Object.freeze({ balanced: true, totalMinor: Number(debit) });
}

/**
 * Read-only Venezuela fiscal preview boundary for #775/#776/#778/#780.
 *
 * This method intentionally does not turn a reviewed rule into permission to
 * issue a document, withhold funds, post journal lines or alter a tenant profile.
 * Callers must derive tenant/selector/event date from authenticated server data.
 * Policy activation remains owned by #751/#774 and the canonical fiscal service.
 */
export const VE_EVENT_PREVIEW_FAMILIES = Object.freeze([
  'IVA', 'RET_IVA', 'ISLR', 'IGTF', 'MUNICIPAL',
] as const);
export type VeEventPreviewFamily = typeof VE_EVENT_PREVIEW_FAMILIES[number];

export function previewReviewedVeTaxEvent(
  rules: readonly VeReviewedRule[],
  event: Readonly<{
    tenantId: string;
    family: VeEventPreviewFamily;
    selector: string;
    eventDate: string;
    baseMinor: number;
  }>,
) {
  if (!event || typeof event !== 'object' ||
      !VE_EVENT_PREVIEW_FAMILIES.includes(event.family) ||
      !stringId(event.tenantId) || !stringId(event.selector) ||
      !isDate(event.eventDate) || !int(event.baseMinor)) rejected();

  // Resolution must precede calculation: no family substitution, tenant
  // spoofing, ambiguous effective intervals, unreviewed source or stale rate.
  const rule = resolveReviewedVeRule(rules, {
    tenantId: event.tenantId, family: event.family,
    selector: event.selector, eventDate: event.eventDate,
  });
  const result = calculateReviewedVeTaxPreview(rule, {
    tenantId: event.tenantId, eventDate: event.eventDate, baseMinor: event.baseMinor,
  });
  return Object.freeze({ ...result, previewOnly: true as const });
}
