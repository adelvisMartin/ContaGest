import { createHash } from 'node:crypto';

// #783 is a read-only characterization helper, NOT a filing or payment authority.
// A server-side caller must obtain every input from tenant-scoped canonical records;
// do not bind this helper to arbitrary client payloads or use it to mutate status.
export const VE_OBLIGATION_MODULES = Object.freeze(['iva', 'islr', 'igtf', 'retiva', 'municipal'] as const);
export type VeObligationModule = typeof VE_OBLIGATION_MODULES[number];
export type VeObligationStage = 'DRAFT' | 'REVIEWED' | 'READY' | 'FILED_EXTERNALLY' | 'PAID' | 'RECONCILED';

type Identity = Readonly<{ tenantId: string; period: string; module: VeObligationModule }>;
type Evidence = Identity & Readonly<{ evidenceHash: string }>;
type Attested = Evidence & Readonly<{ actorId: string; recordedAt: string }>;

export type VeObligationPreflightInput = Identity & Readonly<{
  periodStatus: 'open' | 'closed'; // existing ClosingPeriod; no shadow status storage
  ruleSnapshotHashes: readonly string[]; // existing applied snapshots, not rate definitions
  review: Attested | null;
  closeEvidence: Evidence | null; // authoritative FiscalCloseEvidence
  externalFiling: Attested & Readonly<{ externalReference: string }> | null;
  payment: Evidence & Readonly<{ paymentRecordId: string; status: 'confirmed' }> | null;
  reconciliation: Evidence & Readonly<{ paymentRecordId: string; reconciliationId: string; matched: true }> | null;
}>;

const SHA = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const deny = (): never => { throw new Error('VE_OBLIGATION_EVIDENCE_NOT_AUTHORIZED'); };
const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const validHash = (value: unknown): value is string => typeof value === 'string' && SHA.test(value);
function validTime(value: unknown): value is string {
  return typeof value === 'string' && UTC.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19) &&
    Date.parse(value) <= Date.now() + 60_000;
}
function sameScope(data: unknown, expected: Identity): data is Evidence {
  if (!data || typeof data !== 'object') return false;
  const evidence = data as Partial<Evidence>;
  return evidence.tenantId === expected.tenantId && evidence.period === expected.period &&
    evidence.module === expected.module && validHash(evidence.evidenceHash);
}
function attested(data: unknown, expected: Identity): data is Attested {
  if (!sameScope(data, expected)) return false;
  const evidence = data as Attested;
  return validId(evidence.actorId) && validTime(evidence.recordedAt);
}

/** Determine the highest *evidence-supported* stage; no writes, no legal or financial declarations. */
export function previewVeObligationEvidence(input: VeObligationPreflightInput) {
  if (!input || typeof input !== 'object' || !validId(input.tenantId) ||
      (!PERIOD.test(input.period) || input.period.startsWith('0000')) || !VE_OBLIGATION_MODULES.includes(input.module) ||
      !['open', 'closed'].includes(input.periodStatus) ||
      !Array.isArray(input.ruleSnapshotHashes) || input.ruleSnapshotHashes.length > 64 ||
      input.ruleSnapshotHashes.some(hash => !validHash(hash)) ||
      new Set(input.ruleSnapshotHashes).size !== input.ruleSnapshotHashes.length) deny();

  const scope: Identity = { tenantId: input.tenantId, period: input.period, module: input.module };
  if (input.review !== null && !attested(input.review, scope)) deny();
  if (input.closeEvidence !== null && !sameScope(input.closeEvidence, scope)) deny();
  if (input.externalFiling !== null &&
      (!attested(input.externalFiling, scope) || !validId(input.externalFiling.externalReference))) deny();
  if (input.payment !== null &&
      (!sameScope(input.payment, scope) || !validId(input.payment.paymentRecordId) ||
       input.payment.status !== 'confirmed')) deny();
  if (input.reconciliation !== null &&
      (!sameScope(input.reconciliation, scope) || !validId(input.reconciliation.paymentRecordId) ||
       !validId(input.reconciliation.reconciliationId) ||
       input.reconciliation.matched !== true)) deny();

  // Out-of-order evidence is *not* silently ignored. A closed period cannot
  // become a filing-ready obligation without an actual immutable close hash.
  if (input.periodStatus === 'closed' && input.closeEvidence === null) deny();
  if (input.periodStatus === 'open' && input.closeEvidence !== null) deny();
  if (input.ruleSnapshotHashes.length === 0 &&
      (input.review || input.closeEvidence || input.externalFiling || input.payment || input.reconciliation)) deny();
  if (!input.review && (input.closeEvidence || input.externalFiling || input.payment || input.reconciliation)) deny();
  if (!input.closeEvidence && (input.externalFiling || input.payment || input.reconciliation)) deny();
  if (!input.externalFiling && (input.payment || input.reconciliation)) deny();
  if (!input.payment && input.reconciliation) deny();
  if (input.externalFiling && input.review &&
      Date.parse(input.externalFiling.recordedAt) < Date.parse(input.review.recordedAt)) deny();
  if (input.reconciliation && input.payment?.paymentRecordId !== input.reconciliation.paymentRecordId) deny();

  const stage: VeObligationStage = input.reconciliation ? 'RECONCILED'
    : input.payment ? 'PAID'
    : input.externalFiling ? 'FILED_EXTERNALLY'
    : input.closeEvidence ? 'READY'
    : input.review ? 'REVIEWED' : 'DRAFT';
  // Deterministic canonical identity for a UI preview, never a filing receipt.
  const evidence = {
    ...scope, stage, periodStatus: input.periodStatus,
    ruleSnapshotHashes: [...input.ruleSnapshotHashes].sort(),
    reviewHash: input.review?.evidenceHash ?? null,
    reviewActor: input.review?.actorId ?? null,
    reviewRecordedAt: input.review?.recordedAt ?? null,
    closeHash: input.closeEvidence?.evidenceHash ?? null,
    externalFilingHash: input.externalFiling?.evidenceHash ?? null,
    externalReference: input.externalFiling?.externalReference ?? null,
    externalFilingActor: input.externalFiling?.actorId ?? null,
    externalFilingRecordedAt: input.externalFiling?.recordedAt ?? null,
    paymentHash: input.payment?.evidenceHash ?? null,
    paymentRecordId: input.payment?.paymentRecordId ?? null,
    reconciliationHash: input.reconciliation?.evidenceHash ?? null,
    reconciliationId: input.reconciliation?.reconciliationId ?? null,
    previewOnly: true as const,
  };
  const previewSha256 = createHash('sha256')
    .update('VE_OBLIGATION_PREFLIGHT_V1\n' + JSON.stringify(evidence), 'utf8').digest('hex');
  return Object.freeze({ ...evidence, ruleSnapshotHashes: Object.freeze(evidence.ruleSnapshotHashes), previewSha256 });
}
