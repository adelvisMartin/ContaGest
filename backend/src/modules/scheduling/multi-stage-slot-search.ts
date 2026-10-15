/**
 * #848: compose canonical UTC candidate generation with exclusive multi-stage previews.
 * Read-model only. No tenant authorization, capacity claim or transaction is performed.
 */
import { calculateSlotCandidates, type SlotCandidateQuery } from './slot-candidates.js';
import { resolveBookingPolicy, decideBookingWindow, type VersionedPolicy } from './booking-policy.js';
import {
  planExclusiveSegments,
  type ExistingAllocation,
  type PlannedSegment,
  type ResourceStep
} from './resource-segments.js';

export class MultiStageSlotSearchError extends Error {
  readonly code = 'SCHEDULING_MULTISTAGE_QUERY_INVALID';
  constructor() {
    super('SCHEDULING_MULTISTAGE_QUERY_INVALID');
    this.name = 'MultiStageSlotSearchError';
  }
}

export type MultiStageSlotQuery = Readonly<{
  candidateQuery: Omit<SlotCandidateQuery, 'limit'>;
  steps: readonly ResourceStep[];
  existing?: readonly ExistingAllocation[];
  /** Trusted tenant/service policy versions, resolved at a server-owned UTC clock. */
  bookingPolicy?: Readonly<{ tenant: VersionedPolicy; service?: VersionedPolicy; atUtc: string }>;
  limit?: number;
}>;

export type MultiStageSuggestion = Readonly<{
  startsAtUtc: string;
  endsAtUtc: string;
  segments: readonly PlannedSegment[];
}>;

export type MultiStageSlotResult = Readonly<{
  suggestions: readonly MultiStageSuggestion[];
  /** True only when ALL candidates in the queried windows were evaluated. */
  complete: boolean;
  truncated: boolean;
  examinedCandidates: number;
  rejectedByResources: number;
  rejectedByPolicy: number;
  /** Revision evidence is returned only when an effective policy was supplied. */
  policyEvidence: Readonly<{ tenantRevision: string; serviceRevision: string | null; evaluatedAtUtc: string }> | null;
  scannedBaseCandidates: number;
  candidateWindowLimit: 256;
}>;

function whole(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new MultiStageSlotSearchError();
  }
  return value;
}

/**
 * Any skipped later candidate is explicitly marked incomplete. Do NOT use empty
 * suggestions with complete=false to claim that a resource has no availability.
 * The final booking writer MUST repeat every check atomically against PG17.
 */
export function searchMultiStageSlots(input: MultiStageSlotQuery): MultiStageSlotResult {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['candidateQuery', 'steps', 'existing', 'bookingPolicy', 'limit'].includes(key)) ||
      !input.candidateQuery || typeof input.candidateQuery !== 'object' ||
      Array.isArray(input.candidateQuery) ||
      Object.keys(input.candidateQuery).some(key => ![
        'available', 'blocked', 'durationMinutes', 'stepMinutes',
        'bufferBeforeMinutes', 'bufferAfterMinutes'
      ].includes(key))) {
    throw new MultiStageSlotSearchError();
  }
  const limit = whole(input.limit ?? 24, 1, 64);
  // Missing policy remains backward compatible; supplied versions fail closed.
  const policy = input.bookingPolicy === undefined ? null : resolveBookingPolicy(input.bookingPolicy);

  // Force canonical validation of ALL steps and pre-existing claims even when
  // the supplied availability windows are empty. The probe is discarded.
  planExclusiveSegments({
    startsAtUtc: '2026-01-01T00:00:00.000Z',
    steps: input.steps,
    existing: input.existing
  });

  // A step and its buffers must fit inside the preview envelope. Without this
  // guard, the underlying candidate generator could propose a start that leaves
  // a later stage outside the available window.
  const duration = whole(input.candidateQuery.durationMinutes, 1, 1440);
  const before = whole(input.candidateQuery.bufferBeforeMinutes ?? 0, 0, 1440);
  const after = whole(input.candidateQuery.bufferAfterMinutes ?? 0, 0, 1440);
  const maximumEnd = Math.max(...input.steps.map(step => step.offsetMinutes + step.durationMinutes));
  const requiredBefore = Math.max(0, ...input.steps.map(step => (step.bufferBeforeMinutes ?? 0) - step.offsetMinutes));
  const requiredAfter = Math.max(0, ...input.steps.map(step =>
    step.offsetMinutes + step.durationMinutes + (step.bufferAfterMinutes ?? 0) - duration));
  // Client-supplied envelope cannot shrink server policy buffers.
  if ((policy && (before < policy.values.bufferBeforeMinutes || after < policy.values.bufferAfterMinutes)) ||
      duration !== maximumEnd || before < requiredBefore || after < requiredAfter) {
    throw new MultiStageSlotSearchError();
  }

  // Check up to the canonical bound: never apply the output limit before the
  // resource conflict check, which could suppress feasible later starts.
  const base = calculateSlotCandidates({ ...input.candidateQuery, limit: 256 });
  const accepted: MultiStageSuggestion[] = [];
  let rejectedByResources = 0;
  let rejectedByPolicy = 0;
  for (const candidate of base.slots) {
    const preview = planExclusiveSegments({
      startsAtUtc: candidate.start,
      steps: input.steps,
      existing: input.existing
    });
    if (!preview.ok) {
      rejectedByResources += 1;
      continue;
    }
    if (policy && !decideBookingWindow(policy, policy.resolvedAtUtc, candidate.start).allowed) {
      rejectedByPolicy += 1;
      continue;
    }
    accepted.push({
      startsAtUtc: candidate.start,
      endsAtUtc: candidate.end,
      segments: preview.segments
    });
  }
  return {
    suggestions: accepted.slice(0, limit),
    complete: !base.truncated,
    truncated: base.truncated || accepted.length > limit,
    examinedCandidates: base.slots.length,
    rejectedByResources,
    rejectedByPolicy,
    policyEvidence: policy ? {
      tenantRevision: policy.tenantRevision,
      serviceRevision: policy.serviceRevision,
      evaluatedAtUtc: policy.resolvedAtUtc
    } : null,
    scannedBaseCandidates: base.scanned,
    candidateWindowLimit: 256
  };
}
