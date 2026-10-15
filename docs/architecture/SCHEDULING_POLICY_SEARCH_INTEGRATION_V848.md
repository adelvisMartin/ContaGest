# #848 — Policy-aware multi-stage slot search, integrated fix

## What changed

The existing unmounted read model `searchMultiStageSlots` now optionally accepts `bookingPolicy: { tenant, service?, atUtc }`, with effective policy revisions from trusted server-owned tenant/service configuration. It **calls the existing** `resolveBookingPolicy` and `decideBookingWindow` instead of duplicating their calculations. `atUtc` must be a canonical UTC timestamp from the server; never use an arbitrary browser time for booking authority.

- Checks the current tenant/service policy even when candidate availability is empty; malformed, future-effective or contradictory policies fail closed.
- Filters the min/max advance window on **every examined UTC start** *after* resource conflict checks but *before* applying the response limit.
- Enforces that the candidate envelope has before/after buffers at least as large as the server policy values, so callers cannot silently relax safety margins.
- Returns separate `rejectedByPolicy` and `rejectedByResources` counts, plus `policyEvidence` containing tenant revision, optional service revision and evaluation timestamp.
- Preserves existing unconfigured callers: the policy is optional, no policy yields `rejectedByPolicy=0` and `policyEvidence=null`. This is for backwards compatibility only; real booking/read API integrations MUST require policy from tenant-scoped server configuration.
- Preserves `complete=false` whenever the 256-candidate read cap is reached, including if all checked slots were excluded by policy. It never treats zero results in an incomplete scan as proof of no availability.

This is an integration correction of existing #848 components, not a new scheduling authority. No DB, auth, API, migration, UI or production route is changed.

## Verification on exact source

Local Node.js 22.16.0 and global TypeScript compiler, run against byte-identical source files from GitHub with runtime `.js` mirror compilation:

```sh
tsc --noEmit --strict --target es2022 --module nodenext --moduleResolution nodenext --skipLibCheck backend/src/modules/scheduling/*.ts
tsc --target es2022 --module nodenext --moduleResolution nodenext --skipLibCheck backend/src/modules/scheduling/*.ts
node --experimental-strip-types --test tests/scheduling_multi_stage_slots_v848.test.mjs tests/scheduling_policy_search_integration_v848.test.mjs
```

- **28/28 PASS** (15 existing regression tests + 13 new policy integration tests).
- **Strict TypeScript isolated PASS**; `node --check` new test PASS.
- Negative mutation replacing `complete: !base.truncated` with `complete:true` produced **1 expected FAIL**; restoring exact source returned **28/28 PASS**.
- Code Git blob `79d1a59a6303446b6b9e41ac2d12a21fc6d1249c`; test Git blob `125d9c666e14eab45c05e71f9c4462f88e7809cd`; dependency blobs: `slot-candidates.ts b565169220a6c63cc4aff6393114ed7bff8ff8fd`, `resource-segments.ts 7105248ebec222111c014a7182682cfe3f6b271c`, `booking-policy.ts fb480ca3f035d88c29d4581154f93afe6a527dbe`.

Full monorepo install/typecheck/lint/build were NOT_EXECUTED because network checkout/dependencies are unavailable to this sandbox. Real PG17 concurrency, authenticated HTTP tenant isolation, browser and actual booking flow are NOT_APPLICABLE to this unmounted pure helper but mandatory before activating it. Queued GitHub Actions do not count as PASS.

## Safety boundaries / remaining #848

Policy filtering is an **advisory read model**, never authorization to commit a booking. Booking writers must validate resource ownership, tenant+RBAC, location business hours/DST, service policy, entitlement, atomic resource+capacity claims and idempotency inside a real PostgreSQL 17 transaction. This change does not implement cancellation, waitlist promotion, recurrence, capacity-N, payment or DB-exclusion constraints. Keep issue #848 open for those criteria and full QA. Rollback is reverting this source edit plus its new test/document. No workflows or required checks are weakened.
