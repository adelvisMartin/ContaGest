# #848 — Versioned booking policies, isolated scheduling slice

**Authority:** tenant-owned scheduling configuration and optional service-owned override. This is a pure, unmounted domain primitive, NOT a new tenant store, service catalog, booking API, entitlement, price/tax authority, or transaction writer. Existing `slot-candidates.ts` (merged #848 PR #1067) is reused via `slotQueryWithPolicy`; no duplicate slot implementation.

## Explicit configuration contract

A caller with verified tenant/service identity must supply a complete tenant policy with a revision and effective UTC instant. A service policy can override named fields; unprovided fields inherit their tenant value. There are **no hardcoded business defaults**. Unknown keys, invalid numeric ranges, invalid timestamps/revisions, future-effective policies and cross-field contradictions are rejected. These seven fields are explicit:
- `minAdvanceMinutes`: 0..43,200
- `maxAdvanceDays`: 1..365, rolling 24-hour UTC days (not civil location calendar days)
- `cancellationNoticeMinutes`: 0..43,200
- `bufferBeforeMinutes`/`bufferAfterMinutes`: 0..1,440 each
- `waitlistEnabled`: boolean
- `waitlistOfferTtlMinutes`: 1..10,080 if enabled, otherwise exactly 0

Resolution returns a frozen value snapshot, per-field `tenant|service` provenance, both revision identities and the effective evaluation timestamp. Booking eligibility and cancellation notice checks use strictly canonical UTC instants with inclusive configured boundaries and stable reason codes. These are *eligibility suggestions only*: cancellation side effects, no-show, refunds, financial consequences and consumption of entitlements remain owned by their respective bounded contexts. No implicit 120-minute waitlist default is imported from another product.

## Local exact-file verification

```sh
node --experimental-strip-types --test tests/scheduling_booking_policy_v848.test.mjs
tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck backend/src/modules/scheduling/booking-policy.ts
node --check tests/scheduling_booking_policy_v848.test.mjs
```

Native Node 22.16 isolated suite: 14/14 PASS. Strict TypeScript isolated PASS. Negative mutation of the inclusive early-booking boundary caused 1 FAIL in 14; restoring exact file returned 14/14 PASS. Local tested Git blob hashes: `booking-policy.ts` fb480ca3f035d88c29d4581154f93afe6a527dbe; `scheduling_booking_policy_v848.test.mjs` bd06768c90d74aaa7b294667e35bf23510805a0c. Existing `slot-candidates.ts` source matched `b565169220a6c63cc4aff6393114ed7bff8ff8fd`.

## Material work NOT delivered

No new API, persistence, schema, tenant isolation integration, business calendar, actual transactional booking, resource allocation, capacity-N, waitlist state/promotions, payment or UI is implemented here. Application wiring must source tenant/service policy from authenticated, effective-date-versioned authorities and revalidate **in the same PostgreSQL 17 booking transaction**; preview never grants capacity. Real two-tenant, PG17 concurrency, full workspace build/lint/typecheck and browser smoke are required on integration. Full issue #848 remains OPEN. Rollback is a straightforward revert of these three new unmounted files, without DB/data changes.

CI and protected branches have not been weakened; queued/provider-blocked workflows are NOT PASS.
