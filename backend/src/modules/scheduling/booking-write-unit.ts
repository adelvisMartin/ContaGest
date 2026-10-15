/**
 * #848: transaction-scoped booking writer orchestration (unmounted / not an adapter).
 * A real PostgreSQL adapter MUST implement one atomic transaction and rely on
 * GiST resource exclusion; this module neither locks nor books by itself.
 */
import { resolveBookingPolicy, decideBookingWindow, type VersionedPolicy } from './booking-policy.js';
import { planExclusiveSegments, type ResourceStep } from './resource-segments.js';

export type BookingWriteCode =
  | 'SCHEDULING_WRITE_INPUT_INVALID'
  | 'SCHEDULING_BOOKING_WINDOW_CONFLICT'
  | 'SCHEDULING_INTERNAL_RESOURCE_CONFLICT'
  | 'SCHEDULING_RESOURCE_CONFLICT'
  | 'SCHEDULING_UNIQUE_CONFLICT'
  | 'SCHEDULING_REFERENCE_CONFLICT'
  | 'SCHEDULING_CONSTRAINT_CONFLICT'
  | 'SCHEDULING_RETRYABLE_CONFLICT';
export class BookingWriteError extends Error {
  readonly httpStatus = 409;
  readonly retryable: boolean;
  constructor(readonly code: BookingWriteCode, retryable = false) {
    super(code); // No identifiers, tenant data, SQL or user-provided error messages.
    this.name = 'BookingWriteError';
    this.retryable = retryable;
  }
}
export type TrustedBookingWrite = Readonly<{
  tenantId: string;
  locationId: string;
  bookingId: string;
  idempotencyKey: string;
  sourceType: string;
  sourceId: string;
  actorId: string;
  startsAtUtc: string;
  bookingPolicy: Readonly<{ tenant: VersionedPolicy; service?: VersionedPolicy; atUtc: string }>;
  steps: readonly ResourceStep[];
}>;
export type BookingRecord = Readonly<{
  id: string; tenantId: string; locationId: string; sourceType: string;
  sourceId: string; idempotencyKey: string; createdBy: string;
  status: 'confirmed'; startsAtUtc: string; endsAtUtc: string;
}>;
export type BookingAllocationRecord = Readonly<{
  id: string; tenantId: string; locationId: string; bookingId: string;
  resourceId: string; stepId: string; status: 'active';
  occupiedStartAt: string; occupiedEndAt: string;
}>;
export type BookingWriteResult = Readonly<{
  bookingId: string;
  allocationCount: number;
  startsAtUtc: string;
  endsAtUtc: string;
  tenantPolicyRevision: string;
  servicePolicyRevision: string | null;
}>;
export type BookingWriteTransaction = Readonly<{
  insertBooking: (data: BookingRecord) => Promise<unknown>;
  insertAllocation: (data: BookingAllocationRecord) => Promise<unknown>;
}>;
export type BookingWriteUnitOfWork = Readonly<{
  runInTransaction: <T>(operation: (tx: BookingWriteTransaction) => Promise<T>) => Promise<T>;
  generateAllocationId: () => string; // Trusted server-generated, unique UUIDv4.
}>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const KIND = /^[a-z][a-z0-9_-]{0,63}$/;
const MINUTE = 60_000;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function invalid(): never { throw new BookingWriteError('SCHEDULING_WRITE_INPUT_INVALID'); }
function id(value: unknown, pattern: RegExp = IDENTIFIER): string {
  if (typeof value !== 'string' || !pattern.test(value)) invalid();
  return value;
}
function knownKeys(data: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(data).some(k => !allowed.includes(k))) invalid();
}
function pgCode(value: unknown): unknown {
  if (!object(value)) return null;
  // Never trust the SQL message, detail, constraint, table name or tenant IDs.
  return value.code;
}
/** Classify only known PostgreSQL SQLSTATEs. Everything else propagates unchanged. */
export function classifyBookingDatabaseError(error: unknown): BookingWriteError | null {
  switch (pgCode(error)) {
    case '23P01': return new BookingWriteError('SCHEDULING_RESOURCE_CONFLICT');
    case '23505': return new BookingWriteError('SCHEDULING_UNIQUE_CONFLICT');
    case '23503': return new BookingWriteError('SCHEDULING_REFERENCE_CONFLICT');
    case '23514': return new BookingWriteError('SCHEDULING_CONSTRAINT_CONFLICT');
    case '40001': case '40P01': return new BookingWriteError('SCHEDULING_RETRYABLE_CONFLICT', true);
    default: return null;
  }
}

/**
 * Requires trusted identifiers/policy/clock from the authenticated server.
 * No external occupancy snapshot is accepted: the authoritative GiST constraint
 * must reject races, including cross-vertical double-booking.
 * 
 * All writes occur inside runInTransaction; if it is not a real ACID PostgreSQL
 * transaction, this function provides NO booking/rollback guarantee.
 */
export async function writeBookingUnit(command: TrustedBookingWrite, uow: BookingWriteUnitOfWork): Promise<BookingWriteResult> {
  if (!object(command) || !object(uow) || typeof uow.runInTransaction !== 'function' ||
      typeof uow.generateAllocationId !== 'function') invalid();
  knownKeys(command, [
    'tenantId', 'locationId', 'bookingId', 'idempotencyKey', 'sourceType',
    'sourceId', 'actorId', 'startsAtUtc', 'bookingPolicy', 'steps'
  ]);
  const tenantId = id(command.tenantId), locationId = id(command.locationId);
  const bookingId = id(command.bookingId, UUID_V4);
  const idempotencyKey = id(command.idempotencyKey, UUID_V4);
  const sourceType = id(command.sourceType, KIND);
  const sourceId = id(command.sourceId);
  const actorId = id(command.actorId);
  if (!Array.isArray(command.steps)) invalid();
  const policy = resolveBookingPolicy(command.bookingPolicy);
  const decision = decideBookingWindow(policy, policy.resolvedAtUtc, command.startsAtUtc);
  if (!decision.allowed) throw new BookingWriteError('SCHEDULING_BOOKING_WINDOW_CONFLICT');
  // Booking-wide policy buffers protect the first and last stages of the
  // service. Stage-specific buffers remain independently mandatory; blindly
  // applying global buffers to EVERY stage would incorrectly reject two
  // contiguous stages sharing one resource.
  const finalOffset = Math.max(...command.steps.map(s => s.offsetMinutes + s.durationMinutes));
  const effectiveSteps: ResourceStep[] = command.steps.map(stage => ({
    ...stage,
    bufferBeforeMinutes: Math.max(stage.bufferBeforeMinutes ?? 0,
      stage.offsetMinutes === 0 ? policy.values.bufferBeforeMinutes : 0),
    bufferAfterMinutes: Math.max(stage.bufferAfterMinutes ?? 0,
      stage.offsetMinutes + stage.durationMinutes === finalOffset ? policy.values.bufferAfterMinutes : 0)
  }));
  // This checks only intra-command resources. Existing allocations are NOT
  // trusted from a browser/snapshot; PG17 must arbitrate against live rows.
  const planned = planExclusiveSegments({ startsAtUtc: command.startsAtUtc, steps: effectiveSteps });
  if (!planned.ok) throw new BookingWriteError('SCHEDULING_INTERNAL_RESOURCE_CONFLICT');
  const commandSteps = new Map(effectiveSteps.map(step => [step.stepId, step]));
  const claims: Omit<BookingAllocationRecord, 'id'>[] = [];
  let endsAt = 0;
  for (const segment of planned.segments) {
    const stage = commandSteps.get(segment.stepId);
    if (!stage) invalid();
    const stageStart = Date.parse(segment.startsAtUtc);
    const stageEnd = Date.parse(segment.endsAtUtc);
    endsAt = Math.max(endsAt, stageEnd);
    // Preserve the stricter server policy buffer across every stage; do not
    // silently shrink existing stage-required buffers.
    const occupiedStartAt = new Date(stageStart - (stage.bufferBeforeMinutes ?? 0) * MINUTE).toISOString();
    const occupiedEndAt = new Date(stageEnd + (stage.bufferAfterMinutes ?? 0) * MINUTE).toISOString();
    for (const resourceId of segment.resourceIds) {
      claims.push({ tenantId, locationId, bookingId, resourceId, stepId: segment.stepId,
        status: 'active', occupiedStartAt, occupiedEndAt });
    }
  }
  if (claims.length < 1 || claims.length > 128) invalid();
  // Sort all claims to reduce lock-order deadlocks between parallel bookings.
  claims.sort((a, b) => a.resourceId.localeCompare(b.resourceId) ||
    a.occupiedStartAt.localeCompare(b.occupiedStartAt) || a.stepId.localeCompare(b.stepId));
  const endsAtUtc = new Date(endsAt).toISOString();
  const booking: BookingRecord = Object.freeze({ id: bookingId, tenantId, locationId,
    sourceType, sourceId, idempotencyKey, createdBy: actorId, status: 'confirmed',
    startsAtUtc: command.startsAtUtc, endsAtUtc });
  try {
    return await uow.runInTransaction(async tx => {
      if (!object(tx) || typeof tx.insertBooking !== 'function' ||
          typeof tx.insertAllocation !== 'function') invalid();
      await tx.insertBooking(booking);
      for (const claim of claims) {
        const allocationId = id(uow.generateAllocationId(), UUID_V4);
        await tx.insertAllocation(Object.freeze({ ...claim, id: allocationId }));
      }
      return Object.freeze({ bookingId, allocationCount: claims.length,
        startsAtUtc: command.startsAtUtc, endsAtUtc,
        tenantPolicyRevision: policy.tenantRevision,
        servicePolicyRevision: policy.serviceRevision });
    });
  } catch (error) {
    const mapped = classifyBookingDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
}
