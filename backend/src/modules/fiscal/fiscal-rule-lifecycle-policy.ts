/** #751 · Data-only fiscal rule lifecycle. No statutory values or executable DB formulas. */
export type FiscalRuleStatus = 'DRAFT' | 'REVIEWED' | 'ACTIVE' | 'SUPERSEDED';
export type FiscalRuleActor = Readonly<{ tenantId: string; userId: string }>;
export type FiscalRuleState = Readonly<{
  id: string; tenantId: string; ruleKey: string; status: FiscalRuleStatus;
  createdBy: string | null; reviewedBy: string | null;
  legalSourceId: string | null; effectiveFrom: Date; effectiveTo: Date | null;
  supersedesId: string | null;
}>;
export type ReviewedFiscalSource = Readonly<{
  id: string; tenantId: string; createdBy: string;
  reviewedBy: string | null; contentSha256: string;
}>;

const fail = (): never => { throw new Error('FISCAL_RULE_LIFECYCLE_INVALID'); };
const SHA256 = /^[0-9a-f]{64}$/i;
const str = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.trim() === value && value.length <= 200;

/** A whitelisted rational amount, never JS, SQL or a user-supplied expression. */
export function assertApprovedFiscalDefinition(value: unknown): Readonly<{
  formula: 'RATIONAL_RATE'; base: 'TAXABLE_AMOUNT'; numerator: number; denominator: number;
}> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('FISCAL_RULE_DEFINITION_UNSAFE');
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).sort().join(',') !== 'base,denominator,formula,numerator' ||
      obj.formula !== 'RATIONAL_RATE' || obj.base !== 'TAXABLE_AMOUNT' ||
      typeof obj.numerator !== 'number' || !Number.isSafeInteger(obj.numerator) || obj.numerator < 0 ||
      typeof obj.denominator !== 'number' || !Number.isSafeInteger(obj.denominator) ||
      obj.denominator < 1 || obj.denominator > 1_000_000_000 || obj.numerator > obj.denominator) {
    throw new Error('FISCAL_RULE_DEFINITION_UNSAFE');
  }
  return Object.freeze({ formula: 'RATIONAL_RATE', base: 'TAXABLE_AMOUNT', numerator: obj.numerator, denominator: obj.denominator });
}

/** Effective dates are instants with [from,to) semantics and no implicit local zone. */
export function assertFiscalRuleWindow(from: Date, to: Date | null) {
  if (!(from instanceof Date) || !Number.isFinite(from.getTime()) ||
      (to !== null && (!(to instanceof Date) || !Number.isFinite(to.getTime()) || to <= from))) fail();
  return true;
}

export function assertFiscalRuleTransition(
  rule: FiscalRuleState,
  target: Exclude<FiscalRuleStatus, 'DRAFT'>,
  actor: FiscalRuleActor,
  source: ReviewedFiscalSource,
) {
  if (!rule || !actor || !source || !str(actor.tenantId) || !str(actor.userId) ||
      actor.tenantId !== rule.tenantId || source.tenantId !== rule.tenantId ||
      !str(rule.legalSourceId) || rule.legalSourceId !== source.id ||
      !str(source.reviewedBy) || !SHA256.test(source.contentSha256) ||
      !str(rule.createdBy) || !str(rule.ruleKey)) fail();
  assertFiscalRuleWindow(rule.effectiveFrom, rule.effectiveTo);
  if (target === 'REVIEWED') {
    if (rule.status !== 'DRAFT' || actor.userId === rule.createdBy) fail();
  } else if (target === 'ACTIVE') {
    if (rule.status !== 'REVIEWED' || !str(rule.reviewedBy) || actor.userId === rule.reviewedBy) fail();
  } else if (target === 'SUPERSEDED') {
    if (rule.status !== 'ACTIVE') fail();
  } else fail();
  return Object.freeze({ status: target });
}

/** The caller supplies the locked, tenant-scoped current ancestry; missing edges fail closed. */
export function assertNoSupersessionCycle(
  ancestry: readonly Readonly<{ id: string; tenantId: string; ruleKey: string; supersedesId: string | null }>[],
  newId: string, previousId: string | null, tenantId: string, ruleKey: string,
) {
  if (!str(newId) || !str(tenantId) || !str(ruleKey) || ancestry.length > 256) fail();
  const byId = new Map<string, (typeof ancestry)[number]>();
  for (const row of ancestry) {
    if (!str(row.id) || row.tenantId !== tenantId || row.ruleKey !== ruleKey || byId.has(row.id)) fail();
    byId.set(row.id, row);
  }
  const visited = new Set<string>([newId]);
  let cursor = previousId;
  while (cursor !== null) {
    if (visited.has(cursor)) fail();
    visited.add(cursor);
    const node = byId.get(cursor);
    if (!node) fail();
    cursor = node.supersedesId;
  }
  return true;
}
