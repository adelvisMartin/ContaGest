# #848 — Cancellation and atomic resource-release port

Status: SOURCE-ONLY / UNMOUNTED. This change adds a cancellation domain coordinator; no API or real database adapter is connected. SOURCE_REUSE=NONE.

## Transaction contract

Caller derives tenant, location, booking id, actor, UTC instant and tenant/service policy from authenticated server authorities, not from browser identity claims.

Within one real PostgreSQL transaction, the adapter must:

1. Lock one booking using tenantId + locationId + bookingId, and return only that scope.
2. Validate confirmed state and optimistic expectedUpdatedAtUtc token, never cancelling twice.
3. Apply existing booking-policy cancellationNoticeMinutes and inclusive cutoff.
4. Atomically CAS confirmed -> cancelled with exact affected row count = 1.
5. Release active resource claims of that booking and require exact count equality; mismatch throws to roll back.
6. Persist an audit record in that same transaction; audit failures must roll back all changes.

App writes and external messaging are NOT implemented. Outbox intent, entitlement refunds and domain-specific consequences require the subsequent DB adapter/owner. Never send provider messages inside the transaction.

## Local tests (transparent limitations)

New source Git blob: b5e20f2afc8ba0362199e8506a04366f3a48c471
New test Git blob: 45962648e4d57e8a9af58619aca8961638d85e79
Node.js v22.16: 18/18 PASS using the exact new TypeScript module and a local, API-compatible booking-policy.js test double (not the actual GitHub dependency).
Isolated TypeScript strict: PASS using a matching .d.ts dependency shim (not monorepo typecheck).
Node --check: PASS. Negative mutation bypassing exact release count: 1 expected FAIL; restoring source: 18/18 PASS.

In a full checkout with installed dependencies, execute: npx tsx --test tests/scheduling_booking_cancellation_v848.test.mjs
Also run complete backend typecheck and full application quality gates. Native Node strip-types does NOT resolve .js runtime import specifiers to .ts automatically; the local test double is not shipped.

## Material gates still NOT_EXECUTED

- PostgreSQL17 from-zero and populated upgrade migration (#1097 remains unmerged DRAFT).
- Real row-lock/CAS/release/audit single-transaction cancellation, double cancellation and concurrent book/cancel races.
- Tenant A/B authenticated HTTP, browser and outbox integration.
- Full npm ci/lint/build/typecheck against real repo, and remote provider CI (queued != PASS).

Issue #848 stays OPEN. This increment cannot be described as production cancellation or proof of database atomicity. No workflows, migrations or required checks are altered. Rollback: revert these three new files only.
