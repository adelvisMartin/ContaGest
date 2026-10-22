/** Server-side #774 profile selection and independent taxpayer classification review. */
export type ActiveTaxpayerProfile = Readonly<{
  id: string; tenantId: string; rifSnapshot: string; version: number;
  status: 'DRAFT' | 'REVIEWED' | 'ACTIVE'; effectiveFrom: Date; effectiveTo: Date | null;
  sourceReference: string; sourceContentSha256: string;
  createdBy: string; reviewedBy: string | null; activatedBy: string | null;
}>;
const fail = (): never => { throw new Error('TAXPAYER_PROFILE_NOT_AUTHORIZED'); };
const SHA = /^[a-f0-9]{64}$/;
const actor = (value: unknown): value is string => typeof value === 'string' && value.trim() === value && !!value;
export function assertProfileReview(p: ActiveTaxpayerProfile, actorId: string) {
  if (!p || p.status !== 'DRAFT' || !actor(actorId) || !actor(p.createdBy) ||
      actorId === p.createdBy || p.reviewedBy || p.activatedBy) fail();
}
export function assertProfileActivation(p: ActiveTaxpayerProfile, actorId: string) {
  if (!p || p.status !== 'REVIEWED' || !actor(actorId) || !actor(p.createdBy) ||
      !actor(p.reviewedBy) || actorId === p.createdBy ||
      actorId === p.reviewedBy || p.activatedBy) fail();
}
/** Reject ambiguity and partial/missing authority rather than borrowing browser flags. */
export function resolveActiveTaxpayerProfile(
  values: readonly ActiveTaxpayerProfile[],
  context: Readonly<{ tenantId: string; rif: string; at: Date }>,
): ActiveTaxpayerProfile {
  if (!context || !actor(context.tenantId) || !actor(context.rif) ||
      !(context.at instanceof Date) || !Number.isFinite(context.at.getTime()) ||
      !Array.isArray(values)) fail();
  const found = values.filter(p => p.status === 'ACTIVE' &&
    p.tenantId === context.tenantId && p.rifSnapshot === context.rif &&
    p.effectiveFrom instanceof Date && Number.isFinite(p.effectiveFrom.getTime()) &&
    (p.effectiveTo === null || (p.effectiveTo instanceof Date && Number.isFinite(p.effectiveTo.getTime())
      && p.effectiveTo > p.effectiveFrom)) &&
    p.effectiveFrom <= context.at &&
    (p.effectiveTo === null || context.at < p.effectiveTo));
  if (found.length !== 1) fail();
  const p=found[0];
  if (!Number.isSafeInteger(p.version) || p.version <= 0 ||
      !actor(p.createdBy) || !actor(p.reviewedBy) || !actor(p.activatedBy) ||
      new Set([p.createdBy,p.reviewedBy,p.activatedBy]).size !== 3 ||
      !actor(p.sourceReference) || !SHA.test(p.sourceContentSha256)) fail();
  return p;
}
