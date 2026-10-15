# #848 — Multi-stage exclusive-resource conflict preview

**Bounded scope:** pure planExclusiveSegments domain primitive. This is an unmounted, side-effect-free preview, not a reservation writer, ORM model, allocation ledger, resource authorization, capacity-N allocator, waitlist or schedule reader. SOURCE_REUSE=NONE.

## Domain contract

- The booking start and external busy intervals are canonical UTC timestamps including milliseconds, for example 2026-10-15T09:00:00.000Z.
- Each step has a unique ID, nonnegative offset in minutes, strictly positive duration and **1–8 unique exclusive resource IDs**. Optional before/after buffers expand the resource occupancy, not the customer-visible step interval.
- Steps may execute in parallel if they claim **different** resources. Occupancy is half-open [start,end); touching endpoints do not conflict unless a buffer crosses that boundary.
- All steps and external reservations are validated **before** determining feasibility. Overlap returns ok:false, a stable reason code and step ID, with segments:[]; no partial allocation is returned or persisted.
- Strict bounds: 1–16 steps, at most 512 preexisting claims, a seven-day horizon from booking start, duration 1–1440 minutes per step. No unknown input fields or unbounded coercions.
- Results are immutable, ordered like input and deterministic. No tenantId, medical data, payment information or assignment metadata is accepted.

## Verification

Commands from a full Node 22 + TypeScript checkout:

1. node --experimental-strip-types --test tests/scheduling_resource_segments_v848.test.mjs
2. tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck backend/src/modules/scheduling/resource-segments.ts
3. node --check tests/scheduling_resource_segments_v848.test.mjs

The 16 focused cases exercise multi-stage and parallel work, shared resources, half-open boundaries, buffers, external busy ranges, invalid/duplicate steps, oversized input, immutable output and prevention of empty resource claims. A deliberately mutated inclusive overlap operator must fail the relevant boundary tests.

## Security and integration STOP conditions

A list of existing allocations is **not authoritative** unless read from a trusted server tenant/resource scope inside a consistent DB transaction. Returning ok:true **does not prevent races**, acquire locks, prove resource existence or establish location/tenant ownership. Real booking writers must recheck all stages and resources atomically using PostgreSQL 17 exclusion constraints/locks, combining booking, resource claims, session capacity, entitlements and outbox in one commit. Resource capacity >1 requires a separate proven transactional design.

Resource identity, service requirements (#849), tenant/RBAC, stage-order/version, cancellations/reschedules, location IANA wall time (PR #1063) and waitlist remain outside this preview. Real PostgreSQL two-writer/cross-tenant/rollback tests and API/browser QA remain NOT_EXECUTED until this is wired into an actual booking writer.

No CI checks have been modified or skipped. Unavailable GitHub Actions are not PASS. Rollback: revert the three source/test/docs additions without a data migration.
