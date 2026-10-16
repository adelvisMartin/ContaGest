/**
 * #848: deterministic PREVIEW of exclusive resource occupancy for multi-stage bookings.
 * NOT a DB allocation or permission/tenant checker. Booking commits must revalidate
 * overlapping resources atomically against PostgreSQL's canonical authority.
 */
export type ResourceStep = Readonly<{
  stepId: string;
  offsetMinutes: number;
  durationMinutes: number;
  resourceIds: readonly string[];
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
}>;
export type ExistingAllocation = Readonly<{
  resourceId: string;
  startsAtUtc: string;
  endsAtUtc: string;
}>;
export type PlannedSegment = Readonly<{
  stepId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  resourceIds: readonly string[];
}>;
export type SegmentConflict = Readonly<{
  stepId: string;
  reason: 'EXISTING_RESOURCE_CONFLICT' | 'INTRA_BOOKING_RESOURCE_CONFLICT';
}>;
export type SegmentPlan =
  | Readonly<{ ok: true; segments: readonly PlannedSegment[] }>
  | Readonly<{ ok: false; conflict: SegmentConflict; segments: readonly [] }>;
export type SegmentInput = Readonly<{
  startsAtUtc: string;
  steps: readonly ResourceStep[];
  existing?: readonly ExistingAllocation[];
}>;
export class ResourceSegmentError extends Error {
  readonly code: 'SCHEDULING_SEGMENTS_INVALID';
  constructor() {
    super('SCHEDULING_SEGMENTS_INVALID');
    this.name = 'ResourceSegmentError';
    this.code = 'SCHEDULING_SEGMENTS_INVALID';
  }
}

const ONE_MINUTE = 60_000;
const MAX_HORIZON = 7 * 24 * 60;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/;
function invalid(): never { throw new ResourceSegmentError(); }
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactUtc(value: unknown): number {
  if (typeof value !== 'string' || !ISO.test(value)) invalid();
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) invalid();
  return epoch;
}
function exactNumber(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}
function exactId(value: unknown): string {
  if (typeof value !== 'string' || !ID.test(value)) invalid();
  return value;
}
function keys(input: Record<string, unknown>, permitted: readonly string[]) {
  if (Object.keys(input).some(key => !permitted.includes(key))) invalid();
}
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd; // half-open boundaries
}

type Claim = Readonly<{ resourceId: string; occupiedStart: number; occupiedEnd: number }>;

/**
 * Validates all steps/blocks before computing; emits *no* partial plan on conflict.
 * Only capacity=1 exclusive resources are supported. A successful preview does NOT
 * acquire an allocation or prevent another transaction from booking the resource.
 */
export function planExclusiveSegments(input: SegmentInput): SegmentPlan {
  if (!isObject(input)) invalid();
  keys(input, ['startsAtUtc', 'steps', 'existing']);
  const bookingStart = exactUtc(input.startsAtUtc);
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 16 ||
      !Array.isArray(input.existing ?? []) || (input.existing ?? []).length > 512) invalid();
  const seenSteps = new Set<string>();
  const requested = input.steps.map(step => {
    if (!isObject(step)) invalid();
    keys(step, ['stepId', 'offsetMinutes', 'durationMinutes', 'resourceIds', 'bufferBeforeMinutes', 'bufferAfterMinutes']);
    const stepId = exactId(step.stepId);
    if (seenSteps.has(stepId)) invalid();
    seenSteps.add(stepId);
    const offset = exactNumber(step.offsetMinutes, 0, MAX_HORIZON);
    const duration = exactNumber(step.durationMinutes, 1, 1440);
    const before = exactNumber(step.bufferBeforeMinutes ?? 0, 0, 1440);
    const after = exactNumber(step.bufferAfterMinutes ?? 0, 0, 1440);
    if (offset + duration + after > MAX_HORIZON) invalid();
    if (!Array.isArray(step.resourceIds) || step.resourceIds.length < 1 || step.resourceIds.length > 8) invalid();
    const resourceIds = step.resourceIds.map(exactId);
    if (new Set(resourceIds).size !== resourceIds.length) invalid();
    const startsAt = bookingStart + offset * ONE_MINUTE;
    const endsAt = startsAt + duration * ONE_MINUTE;
    return {
      stepId, startsAt, endsAt, resourceIds,
      occupiedStart: startsAt - before * ONE_MINUTE,
      occupiedEnd: endsAt + after * ONE_MINUTE
    };
  });
  const prior: Claim[] = (input.existing ?? []).map(block => {
    if (!isObject(block)) invalid();
    keys(block, ['resourceId', 'startsAtUtc', 'endsAtUtc']);
    const resourceId = exactId(block.resourceId);
    const occupiedStart = exactUtc(block.startsAtUtc);
    const occupiedEnd = exactUtc(block.endsAtUtc);
    if (occupiedEnd <= occupiedStart || occupiedEnd - occupiedStart > MAX_HORIZON * ONE_MINUTE) invalid();
    return { resourceId, occupiedStart, occupiedEnd };
  });
  const staged: Claim[] = [];
  for (const step of requested) {
    for (const resourceId of step.resourceIds) {
      const externalConflict = prior.some(claim => claim.resourceId === resourceId &&
        overlap(step.occupiedStart, step.occupiedEnd, claim.occupiedStart, claim.occupiedEnd));
      if (externalConflict) return Object.freeze({ ok: false, conflict: Object.freeze({
        stepId: step.stepId, reason: 'EXISTING_RESOURCE_CONFLICT' as const
      }), segments: Object.freeze([]) as readonly [] });
      const internalConflict = staged.some(claim => claim.resourceId === resourceId &&
        overlap(step.occupiedStart, step.occupiedEnd, claim.occupiedStart, claim.occupiedEnd));
      if (internalConflict) return Object.freeze({ ok: false, conflict: Object.freeze({
        stepId: step.stepId, reason: 'INTRA_BOOKING_RESOURCE_CONFLICT' as const
      }), segments: Object.freeze([]) as readonly [] });
      staged.push({ resourceId, occupiedStart: step.occupiedStart, occupiedEnd: step.occupiedEnd });
    }
  }
  return Object.freeze({ ok: true, segments: Object.freeze(requested.map(step => Object.freeze({
    stepId: step.stepId, startsAtUtc: new Date(step.startsAt).toISOString(),
    endsAtUtc: new Date(step.endsAt).toISOString(),
    resourceIds: Object.freeze([...step.resourceIds])
  }))) });
}
