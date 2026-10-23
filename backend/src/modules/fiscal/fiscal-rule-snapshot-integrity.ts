import { createHash, timingSafeEqual } from 'node:crypto';

/** Preserve the original #561 canonicalization for existing stored hashes. */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  return String(value);
}

export function fiscalEvidenceHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

type FiscalRuleEvidence = Readonly<{
  tenantId: string;
  ruleKey: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  source: string;
  documentation: string;
  definition: unknown;
}>;

export type FiscalSnapshotIntegrityInput = FiscalRuleEvidence & Readonly<{
  ruleVersion: number;
  ruleHash: string;
}>;

export type FiscalRuleVersionIntegrityInput = FiscalRuleEvidence & Readonly<{
  version: number;
  hash: string;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const denied = (): never => { throw new Error('FISCAL_RULE_EVIDENCE_INTEGRITY'); };

/** No use of a freshly computed hash as authoritative: it must match the stored hash. */
function assertEvidence(input: FiscalRuleEvidence, version: number, hash: string, tenantId: string): void {
  if (!input || typeof input !== 'object' || typeof tenantId !== 'string' || !tenantId ||
      input.tenantId !== tenantId || typeof input.ruleKey !== 'string' || !input.ruleKey.trim() ||
      !Number.isSafeInteger(version) || version <= 0 ||
      typeof hash !== 'string' || !SHA256.test(hash) ||
      !(input.effectiveFrom instanceof Date) || !Number.isFinite(input.effectiveFrom.getTime()) ||
      (input.effectiveTo !== null && (!(input.effectiveTo instanceof Date) ||
        !Number.isFinite(input.effectiveTo.getTime()) || input.effectiveTo <= input.effectiveFrom)) ||
      typeof input.source !== 'string' || !input.source.trim() ||
      typeof input.documentation !== 'string' || !input.documentation.trim() ||
      input.definition === null || !input.definition || typeof input.definition !== 'object' ||
      Array.isArray(input.definition)) denied();

  const actual = fiscalEvidenceHash({
    tenantId, ruleKey: input.ruleKey, version,
    effectiveFrom: input.effectiveFrom.toISOString(),
    effectiveTo: input.effectiveTo?.toISOString() ?? null,
    source: input.source, documentation: input.documentation, definition: input.definition,
  });
  if (!timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(hash, 'hex'))) denied();
}

/** Validate persisted rule evidence immediately before selecting it for a fiscal document. */
export function assertFiscalRuleVersionIntegrity(
  rule: FiscalRuleVersionIntegrityInput, tenantId: string, effectiveAt: Date,
): void {
  if (!rule || !(effectiveAt instanceof Date) || !Number.isFinite(effectiveAt.getTime())) denied();
  assertEvidence(rule, rule.version, rule.hash, tenantId);
  if (rule.effectiveFrom > effectiveAt || (rule.effectiveTo !== null && effectiveAt >= rule.effectiveTo)) denied();
}

/** Replay the original historical hash; never recalculate from an updated catalog row. */
export function assertFiscalRuleSnapshotIntegrity(snapshot: FiscalSnapshotIntegrityInput, tenantId: string): void {
  if (!snapshot) denied();
  assertEvidence(snapshot, snapshot.ruleVersion, snapshot.ruleHash, tenantId);
}
