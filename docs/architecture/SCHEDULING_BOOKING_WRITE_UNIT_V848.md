# #848 — Booking write unit-of-work port (unmounted incremental implementation)

This increment connects two already merged scheduling domain authorities into a single **transaction callback protocol**:
- `booking-policy.ts`: tenant/service effective revisions, advance windows and booking-wide buffers;
- `resource-segments.ts`: multi-stage exclusive capacity-1 resource claims and internal conflict checks.

`booking-write-unit.ts` does **not** create Prisma clients, routes, DB tables, authentication or a booking API. It is intentionally **not mounted in production**. #1097 prepares the database schema and GiST exclusion constraints in a separate **unmerged DRAFT PR**; no actual adapter can yet be marked ready.

## Trusted command boundary

The server must derive `tenantId`, `locationId`, `actorId`, `sourceType/sourceId`, resource requirements, effective booking policy and trusted UTC clock from its authenticated tenant/resource/service authorities, never from arbitrary browser claims. `bookingId`, `idempotencyKey` and allocation IDs are server-generated UUIDv4. Unknown top-level command fields fail closed. Application-level validation is not RLS or row ownership proof.

The coordinator validates policy, advance window and exclusive intra-booking collisions **before calling the transaction port**. It preserves stage-specific preparation/cleanup buffers. Tenant/service policy buffers apply at the **earliest and latest global booking boundaries**, rather than applying to every adjacent stage and accidentally rejecting a valid sequential appointment. The generated claims include occupied UTC interval, tenant/location and resource/stage/booking IDs; claims are sorted by resource/start/stage to reduce transaction lock-order contention.

`BookingWriteUnitOfWork.runInTransaction(callback)` is a mandatory *adapter contract*. It MUST start one real ACID PostgreSQL transaction with trusted runtime tenant binding (e.g., existing `runWithRuntimeTenant` mechanism and DB session context), insert the booking and all resource allocation records, and commit only if all inserts/constraint checks pass. No external provider, message send, entitlement write or side effect may occur outside that transaction while pretending to be atomic.

**Database authority:** exclusion `23P01` on active overlapping resource ranges across modalities must be enforced by real PostgreSQL 17, not by this pure helper. Catches and safely classifies `23P01`, `23505`, `23503`, `23514`, `40001`, `40P01`. Codes/message contain no SQL, user data, locations or resource identities; unexpected errors propagate to existing central sanitized error handling rather than being misclassified. Uniqueness conflict is **not** assumed to represent an already-successful idempotent booking.

## Local evidence

Node 22.16.0 from byte-identical source and compiled TS `.js` imports:

```sh
tsc -p tsconfig.json # isolated tsconfig with strict, noEmit; not monorepo
tsc --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --outDir backend/src/modules/scheduling backend/src/modules/scheduling/{booking-write-unit,booking-policy,resource-segments,slot-candidates}.ts
node --test tests/scheduling_booking_write_unit_v848.test.mjs
node --check tests/scheduling_booking_write_unit_v848.test.mjs
```

**24/24 PASS** on isolated Node tests including fake transaction staging+rollback, strict inputs, policy bounds, overlapping or adjacent multi-stage resource claims, conflict classifications, exact lock ordering, immutable result and 4xx privacy mapping. Negative mutation changing SQLSTATE `23P01` to `23P02` produced **2 expected FAIL**; restoring tested source gave **24/24 PASS**.

Remote exact Git blob hashes:
- `booking-write-unit.ts`: `619a530433dfe24201948b6f64b88efbb2b14c47`
- `scheduling_booking_write_unit_v848.test.mjs`: `fbb2243d5eb3263d3cd85134f832250ba127925e`
- dependencies: `booking-policy.ts` `fb480ca3f035d88c29d4581154f93afe6a527dbe`, `resource-segments.ts` `7105248ebec222111c014a7182682cfe3f6b271c`, `slot-candidates.ts` `b565169220a6c63cc4aff6393114ed7bff8ff8fd`.

## Verification limitations and stop conditions

| Check | State |
|---|---|
| Local focused domain/port tests | PASS 24/24 |
| Isolated strict TypeScript | PASS |
| Deliberate negative mutation | FAIL as expected, then clean PASS |
| Full workspace npm ci/lint/typecheck/build | NOT_EXECUTED (no full checkout/dependencies) |
| PostgreSQL 17 two-writer, RLS A/B, transaction rollback | NOT_EXECUTED / material blocker |
| Authenticated booking API, browser and UI | NOT_IMPLEMENTED |
| GitHub Actions exact candidate | QUEUED/BLOCKED unless actual steps run |

No new DB schema, API or UI is shipped here. A fake transaction demonstrates callback ordering and expected rollback behavior, **not real ACID**. The future adapter must prove PG17 from-zero and populated upgrade of #1097, concurrency 23P01, cross-tenant negative cases, booking/allocations/entitlement/outbox transaction semantics, reschedule/cancellation and idempotency. Do not consider this a working booking endpoint or close #848. Do not disable required GitHub checks to label provider-blocked tests as PASS. Rollback is a straightforward revert of these three unmounted source/test/docs files.
