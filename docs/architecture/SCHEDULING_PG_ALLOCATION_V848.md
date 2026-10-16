# #848 — PostgreSQL 17 exclusive-resource allocation foundation

**Status: DRAFT / DO NOT APPLY / NOT MERGEABLE UNTIL PG17 VERIFICATION.** This PR prepares the **first database-enforced** scheduling authority for resources with capacity exactly 1. It does not create a booking endpoint, turn on user bookings or imply the issue is complete.

## Scope

- Adds `SchedulingResource`, `SchedulingBooking`, and `SchedulingResourceAllocation` Prisma models and their **new, forward-only** migration `20261015191500_issue_848_exclusive_resource_allocation`. Existing migrations are not rewritten.
- Adds a compound unique key on `BusinessLocation(tenantId,id)` for tenant/location-safe composite foreign keys.
- Every allocation matches its booking **and** resource by tenant/location at SQL level. Booking idempotency is unique by tenant; stage/resource claims cannot be duplicated within a booking.
- **GiST exclusion** on `tenantId, resourceId, tstzrange(occupiedStartAt,occupiedEndAt,'[)')`, restricted to **active** allocations. SQLSTATE `23P01` rejects concurrently overlapping writers across verticals. Half-open adjacency is intentional.
- The `capacity=1` CHECK intentionally blocks capacity-N resources until the separate transactional capacity model and tests are delivered. No claim that this fulfills capacity-N acceptance.
- Force RLS on all three new tables, requiring transaction-scoped `contagest.tenant_id`. If the setting is missing, no rows are readable/writable under `contagest_runtime`. Revoke from `PUBLIC`, `anon`, `authenticated`, and `service_role` when roles exist; grant only necessary DML (no delete) to `contagest_runtime` if provisioned.
- No row backfill, no destructive DDL, no changes to Hípico/BudgetWallet objects or fiscal ledger.

## Required QA before accepting or merging

Only synthetic fixtures and disposable isolated PostgreSQL **17** on the local host. Never run these instructions against Supabase production or any shared project.

1. Obtain a full clone of the exact PR head and install locked dependencies offline or in a permitted environment: `npm ci`, `npm --workspace backend ci`.
2. `npx prisma validate --schema backend/prisma/schema.prisma`, `npm --workspace backend run typecheck` and inspect `prisma migrate diff`. Reconcile *all* schema and migration drift before continuing.
3. Create disposable `contagest_scheduling_e2e` and run the full repo migration chain **from zero**. Provision the dedicated `contagest_runtime` role and runtime RLS context as in the existing database authority. Also test a representative populated upgrade from the previously deployed migration SHA.
4. Supply `SCHEDULING_PG17_E2E_URL` only pointing to `postgresql://...@127.0.0.1/..._e2e` and execute `node qa/scheduling_pg17_allocation_v848.mjs`. It **fails** without a local disposable target; it never uses `DATABASE_URL` silently.
5. Verify schema RLS for `contagest_runtime` and privileged migration actor separately; inspect `pg_constraint`/`pg_policy`, foreign keys and granted privileges.
6. Execute the two-writer race: A inserts a resource claim and holds the transaction; B attempts an overlapping claim for the same tenant/resource; after A commits, B must fail with `23P01` and leave no partial claims. A neighboring half-open interval must succeed.
7. Execute tenant A/B resource spoofing, missing tenant context, mismatched location, idempotency reuse, booking rollback, release/reschedule, shared resource cross-vertical, and resource status transitions. Exercise multi-stage **all-or-nothing** using the actual booking writer (not yet implemented), then retest full from-zero/upgrade chain.
8. Restore disposable fixtures/backups and record exact candidate SHA, PostgreSQL version, redacted execution logs, RLS catalog and rollback plan. Review any known Prisma drift between composite SQL FKs and declared ORM relations.

### Verification matrix in this branch

| Gate | State | Why |
|---|---|---|
| Source/Git diff | REVIEW_REQUIRED | Check all touched files and concurrent owners |
| Migration static contract | Available | `node --test tests/scheduling_pg_migration_contract_v848.test.mjs` |
| Prisma validate / full backend typecheck | NOT_EXECUTED | No checkout with installed Prisma client |
| PG17 from-zero / populated upgrade | NOT_EXECUTED | No local PostgreSQL 17 |
| Two-writer/exclusion/RLS tests | NOT_EXECUTED | Requires disposable PG17 and runtime role |
| API/browser end-to-end | NOT_APPLICABLE to this draft | Booking command / UI not present |
| Remote CI | QUEUED/BLOCKED unless actual steps pass | Quota does not authorize bypass |
| Production migration | NOT_PERMITTED | No PG17 evidence; no approval or maintenance window |

## Atomic writer is the next material change

The future booking handler must authenticate tenant/RBAC and location, resolve the existing policy engine, compute stages from canonical service requirements (#849), revalidate resource state and available windows, insert booking+all allocations+entitlement/outbox effects **inside one PostgreSQL transaction**, and map exclusion `23P01` to safe HTTP 409. Release and reschedule must preserve history and prevent double effects via locked status transitions. An allocation claim alone is not a booking flow and is never enough to close #848.

Capacity-N, waitlist promotions, recurrence, appointment/class materialization and UI continue as explicit child work. Production rollout must be staged with a backup/restore drill, catalog validation and rollback/roll-forward decision. If the migration was applied in any environment, **never edit it in place**; use a follow-up migration. There is no evidence of application or deployment in this PR.

## Rollback while still unmerged

Discard the draft branch; nothing reaches runtime. After any real environment applies the migration, rollback must be an approved forward repair/restore on a disposable-first verified plan, not blind `DROP` of tables containing bookings.

**SOURCE_REUSE=NONE.** Uses the already licensed PostgreSQL GiST/Prisma approach in ContaGest, no copied Hi-Tad source and no provider dependency. Required status checks remain enabled.
