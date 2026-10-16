/** #848: unmounted booking cancellation orchestration; no DB client or provider call. */
import { resolveBookingPolicy, decideCancellationWindow, type VersionedPolicy } from './booking-policy.js';

export type CancellationCommand = Readonly<{
  tenantId: string;
  locationId: string;
  bookingId: string;
  actorId: string;
  expectedUpdatedAtUtc: string;
  nowUtc: string;
  bookingPolicy: Readonly<{ tenant: VersionedPolicy; service?: VersionedPolicy; atUtc: string }>;
}>;
export type LockedBooking = Readonly<{
  id: string;
  tenantId: string;
  locationId: string;
  status: 'confirmed' | 'cancelled';
  startsAtUtc: string;
  updatedAtUtc: string;
  activeAllocationCount: number;
}>;
export type CancellationResult = Readonly<{
  bookingId: string;
  releasedAllocations: number;
  tenantPolicyRevision: string;
  servicePolicyRevision: string | null;
}>;
export type CancellationTransaction = Readonly<{
  lockBooking: (key: Readonly<{ tenantId: string; locationId: string; bookingId: string }>) => Promise<LockedBooking | null>;
  cancelIfCurrent: (key: Readonly<{ tenantId: string; locationId: string; bookingId: string; expectedUpdatedAtUtc: string; actorId: string; nowUtc: string }>) => Promise<number>;
  releaseActiveAllocations: (key: Readonly<{ tenantId: string; locationId: string; bookingId: string }>) => Promise<number>;
  recordAudit: (entry: Readonly<{ tenantId: string; locationId: string; bookingId: string; actorId: string; action: 'scheduling.booking.cancelled' }>) => Promise<void>;
}>;
export type CancellationUnitOfWork = Readonly<{
  runInTransaction: <T>(operation: (tx: CancellationTransaction) => Promise<T>) => Promise<T>;
}>;
export type CancellationCode = 'SCHEDULING_CANCEL_INVALID' | 'SCHEDULING_CANCEL_NOT_FOUND' |
  'SCHEDULING_CANCEL_STALE' | 'SCHEDULING_ALREADY_CANCELLED' |
  'SCHEDULING_CANCEL_POLICY_DENIED' | 'SCHEDULING_CANCEL_RELEASE_MISMATCH';
export class BookingCancellationError extends Error {
  readonly status: 400 | 404 | 409;
  readonly code: CancellationCode;
  constructor(code: CancellationCode) {
    super(code);
    this.code = code;
    this.name = 'BookingCancellationError';
    this.status = code === 'SCHEDULING_CANCEL_INVALID' ? 400 : code === 'SCHEDULING_CANCEL_NOT_FOUND' ? 404 : 409;
  }
}
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(): never { throw new BookingCancellationError('SCHEDULING_CANCEL_INVALID'); }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function instant(value: unknown): number {
  if (typeof value !== 'string' || !UTC.test(value)) invalid();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) invalid();
  return time;
}
function identity(value: unknown, pattern: RegExp = ID): string {
  if (typeof value !== 'string' || !pattern.test(value)) invalid();
  return value;
}
function boundedCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 128) invalid();
  return value;
}
/**
 * Caller derives tenant, location, actor, clock and effective policy from trusted
 * server state. Adapter MUST use one real PostgreSQL ACID transaction with a
 * row-level lock, tenant-bound predicates, CAS, and rollback on every rejection.
 * The return value is not evidence of real DB atomicity until adapter integration.
 */
export async function cancelBookingUnit(command: CancellationCommand, unit: CancellationUnitOfWork): Promise<CancellationResult> {
  if (!record(command) || !record(unit) || typeof unit.runInTransaction !== 'function' ||
      Object.keys(command).some(key => !['tenantId','locationId','bookingId','actorId','expectedUpdatedAtUtc','nowUtc','bookingPolicy'].includes(key))) invalid();
  const tenantId = identity(command.tenantId);
  const locationId = identity(command.locationId);
  const bookingId = identity(command.bookingId, UUID_V4);
  const actorId = identity(command.actorId);
  instant(command.nowUtc);
  instant(command.expectedUpdatedAtUtc);
  if (!record(command.bookingPolicy) || command.bookingPolicy.atUtc !== command.nowUtc) invalid();
  const policy = resolveBookingPolicy(command.bookingPolicy);
  const key = Object.freeze({ tenantId, locationId, bookingId });
  return unit.runInTransaction(async tx => {
    if (!record(tx) || typeof tx.lockBooking !== 'function' || typeof tx.cancelIfCurrent !== 'function' ||
        typeof tx.releaseActiveAllocations !== 'function' || typeof tx.recordAudit !== 'function') invalid();
    const row = await tx.lockBooking(key);
    if (row === null) throw new BookingCancellationError('SCHEDULING_CANCEL_NOT_FOUND');
    if (!record(row) || row.id !== bookingId || row.tenantId !== tenantId || row.locationId !== locationId ||
        !['confirmed', 'cancelled'].includes(row.status)) invalid();
    instant(row.startsAtUtc);
    instant(row.updatedAtUtc);
    if (row.status === 'cancelled') throw new BookingCancellationError('SCHEDULING_ALREADY_CANCELLED');
    if (row.updatedAtUtc !== command.expectedUpdatedAtUtc) throw new BookingCancellationError('SCHEDULING_CANCEL_STALE');
    const count = boundedCount(row.activeAllocationCount);
    if (!decideCancellationWindow(policy, command.nowUtc, row.startsAtUtc).allowed) {
      throw new BookingCancellationError('SCHEDULING_CANCEL_POLICY_DENIED');
    }
    const updated = await tx.cancelIfCurrent(Object.freeze({ ...key, expectedUpdatedAtUtc: command.expectedUpdatedAtUtc, actorId, nowUtc: command.nowUtc }));
    if (updated !== 1) throw new BookingCancellationError('SCHEDULING_CANCEL_STALE');
    const released = await tx.releaseActiveAllocations(key);
    if (released !== count) throw new BookingCancellationError('SCHEDULING_CANCEL_RELEASE_MISMATCH');
    await tx.recordAudit(Object.freeze({ ...key, actorId, action: 'scheduling.booking.cancelled' as const }));
    return Object.freeze({ bookingId, releasedAllocations: released, tenantPolicyRevision: policy.tenantRevision,
      servicePolicyRevision: policy.serviceRevision });
  });
}
