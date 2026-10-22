import crypto from 'node:crypto';

/** Canonical hash used by the existing fiscal rule and its immutable document copy. */
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
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

export type FiscalSnapshotIntegrityInput = Readonly<{
  tenantId: string;
  ruleKey: string;
  ruleVersion: number;
  ruleHash: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  source: string;
  documentation: string;
  definition: unknown;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const fail = (): never => { throw new Error('FISCAL_RULE_SNAPSHOT_INTEGRITY'); };

/** Recompute the *original* hash, not a hash of current rule/catalog data. */
export function assertFiscalRuleSnapshotIntegrity(snapshot: FiscalSnapshotIntegrityInput, tenantId: string): void {
  if (!snapshot || typeof snapshot !== 'object' ||
      typeof tenantId !== 'string' || !tenantId || snapshot.tenantId !== tenantId ||
      typeof snapshot.ruleKey !== 'string' || !snapshot.ruleKey.trim() ||
      !Number.isSafeInteger(snapshot.ruleVersion) || snapshot.ruleVersion <= 0 ||
      typeof snapshot.ruleHash !== 'string' || !SHA256.test(snapshot.ruleHash) ||
      !(snapshot.effectiveFrom instanceof Date) || !Number.isFinite(snapshot.effectiveFrom.getTime()) ||
      (snapshot.effectiveTo !== null && (!(snapshot.effectiveTo instanceof Date) ||
        !Number.isFinite(snapshot.effectiveTo.getTime()) || snapshot.effectiveTo <= snapshot.effectiveFrom)) ||
      typeof snapshot.source !== 'string' || !snapshot.source.trim() ||
      typeof snapshot.documentation !== 'string' || !snapshot.documentation.trim() ||
      !snapshot.definition || typeof snapshot.definition !== 'object' || Array.isArray(snapshot.definition)) fail();
  const computed = fiscalEvidenceHash({
    tenantId, ruleKey: snapshot.ruleKey, version: snapshot.ruleVersion,
    effectiveFrom: snapshot.effectiveFrom.toISOString(),
    effectiveTo: snapshot.effectiveTo?.toISOString() || null,
    source: snapshot.source, documentation: snapshot.documentation,
    definition: snapshot.definition,
  });
  if (!crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(snapshot.ruleHash, 'hex'))) fail();
}
