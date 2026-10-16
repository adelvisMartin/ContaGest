/**
 * #852: a deterministic, non-persisting entitlement-ledger authority boundary.
 * Consumers MUST resolve tenant, payer, beneficiary and entitlement from the
 * server; this pure reducer never authorizes a provider, checkout or booking.
 */
export type EntitlementSnapshot = Readonly<{
  tenantId: string; entitlementId: string; payerId: string;
  beneficiaryId: string; targetId: string;
  validFrom: string; validUntil: string | null;
}>;
export type EntitlementLedgerEvent = Readonly<{
  tenantId: string; entitlementId: string;
  effectKey: string; sourceId: string;
  kind: 'GRANT' | 'CONSUME' | 'RELEASE' | 'REVOKE';
  units: number; occurredAt: string;
  releaseOfEffectKey?: string;
}>;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const fail = (): never => { throw new Error('ENTITLEMENT_LEDGER_EVENT_INVALID'); };
function id(s: unknown): s is string {
  return typeof s === 'string' && s.trim() === s && s.length > 0 && s.length <= 160;
}
function utc(s: unknown): s is string {
  return typeof s === 'string' && UTC.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 19) === s.slice(0, 19);
}
function units(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
/** The supplied order is the immutable ledger order, never a client-sortable view. */
export function deriveEntitlementBalance(
  entitlement: EntitlementSnapshot,
  events: readonly EntitlementLedgerEvent[],
) {
  if (!entitlement || !id(entitlement.tenantId) || !id(entitlement.entitlementId) ||
      !id(entitlement.payerId) || !id(entitlement.beneficiaryId) || !id(entitlement.targetId) ||
      !utc(entitlement.validFrom) ||
      (entitlement.validUntil !== null &&
       (!utc(entitlement.validUntil) || Date.parse(entitlement.validUntil) <= Date.parse(entitlement.validFrom))) ||
      !Array.isArray(events) || events.length > 10000) fail();
  const accepted = new Map<string, string>();
  const consumed = new Map<string, { units: bigint; released: bigint }>();
  let available = 0n, granted = 0n, spent = 0n, revoked = 0n;
  let lastMs = Number.NEGATIVE_INFINITY;
  const startMs = Date.parse(entitlement.validFrom);
  const endMs = entitlement.validUntil === null ? null : Date.parse(entitlement.validUntil);
  let uniqueEvents = 0;
  for (const event of events) {
    if (!event || event.tenantId !== entitlement.tenantId ||
        event.entitlementId !== entitlement.entitlementId ||
        !id(event.effectKey) || !id(event.sourceId) || !utc(event.occurredAt) ||
        !units(event.units) || !['GRANT', 'CONSUME', 'RELEASE', 'REVOKE'].includes(event.kind) ||
        (event.releaseOfEffectKey !== undefined && !id(event.releaseOfEffectKey)) ||
        ((event.kind === 'RELEASE') !== (event.releaseOfEffectKey !== undefined))) fail();
    const digest = JSON.stringify(event);
    const previous = accepted.get(event.effectKey);
    if (previous !== undefined) {
      if (previous !== digest) fail(); // effect identity reused with changed payload
      continue; // same event replay has no second financial effect
    }
    const occurredMs = Date.parse(event.occurredAt);
    if (occurredMs < lastMs) fail();
    lastMs = occurredMs;
    const amount = BigInt(event.units);
    if (event.kind === 'GRANT') {
      granted += amount; available += amount;
    } else if (event.kind === 'CONSUME') {
      if (occurredMs < startMs ||
          (endMs !== null && occurredMs >= endMs) ||
          amount > available) fail();
      available -= amount; spent += amount;
      consumed.set(event.effectKey, { units: amount, released: 0n });
    } else if (event.kind === 'RELEASE') {
      const original = consumed.get(event.releaseOfEffectKey!);
      if (!original) throw new Error('ENTITLEMENT_LEDGER_EVENT_INVALID');
      if (original.released + amount > original.units) fail();
      original.released += amount;
      available += amount;
      spent -= amount;
    } else {
      if (amount > available) fail();
      revoked += amount; available -= amount;
    }
    accepted.set(event.effectKey, digest);
    uniqueEvents++;
  }
  if (available > BigInt(Number.MAX_SAFE_INTEGER) ||
      granted > BigInt(Number.MAX_SAFE_INTEGER) ||
      spent > BigInt(Number.MAX_SAFE_INTEGER) ||
      revoked > BigInt(Number.MAX_SAFE_INTEGER)) fail();
  return Object.freeze({
    tenantId: entitlement.tenantId, entitlementId: entitlement.entitlementId,
    payerId: entitlement.payerId, beneficiaryId: entitlement.beneficiaryId,
    targetId: entitlement.targetId,
    grantedUnits: Number(granted), netConsumedUnits: Number(spent),
    revokedUnits: Number(revoked), availableUnits: Number(available),
    uniqueEvents, mode: 'NON_PERSISTING_LEDGER_PROJECTION' as const,
  });
}
