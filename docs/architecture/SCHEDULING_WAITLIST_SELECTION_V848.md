# #848 — Fair waitlist candidate selection (advisory only)

## Scope and trusted inputs

This is an unmounted pure selection function; it neither writes a booking nor offers a seat. The caller must supply a consistent snapshot owned by one tenant, location and session, with server-verified eligibility, capacity, current UTC time and resolved effective booking policy. SOURCE_REUSE=NONE. The module imports only the type of the existing BookingPolicy authority and does not define a competing waitlist policy.

Inputs are bounded at 512 entries. Strict timestamps, stable entry IDs, positive integer versions, known statuses, eligibility and matching tenant/location/session are mandatory. Unknown fields and cross-tenant entries fail closed. No PII or clinical details are returned.

## Fairness and no-double-offer conditions

- FIFO is ordered by canonical joined-at UTC time; equal times use ASCII entry ID tie-break, never array insertion order.
- Disabled policy returns DISABLED; zero available capacity returns NO_CAPACITY; absent waiters return NONE_WAITING.
- Existing offered entry, even if expired in real time, returns RECONCILE_OFFERS. The persisted offer must first be expired/reconciled transactionally.
- The earliest waiting member with unknown or ineligible eligibility returns ELIGIBILITY_REQUIRED; do not silently skip their place.
- An eligible head produces exactly one OFFER advisory intent with entry ID, expected version, UTC expiration, tenant policy revision and optional service revision. Even with several free seats, generate only one proposal and repeat selection after committed capacity changes.

## Required operational integration (NOT IMPLEMENTED)

A real worker MUST lock the session in PostgreSQL 17, verify tenant ownership and RBAC, check eligibility and capacity from trusted DB rows, inspect outstanding offers and compare the waiting record version. Promote using a conditional UPDATE/CAS inside the same transaction as the capacity mutation and durable outbox event. No provider notification before commit and no duplicate delivery across retries. An expired offer cannot be bypassed until the corresponding persisted transition completes. Source PR #1097 for resource allocation remains DRAFT and unmerged; PostgreSQL waitlist tables, worker, real API and UI are not included here. #848 must remain OPEN.

## Executed tests and limits

- Local Node.js 22.16.0: 25/25 focused tests PASS.
- Local TypeScript v5.8.3 strict isolated compilation PASS.
- JavaScript test syntax check PASS.
- Negative mutation disabling the pending-offer guard caused 1 expected FAIL; restoring exact source returned 25/25 PASS.
- The exact tested source and test Git blob hashes are 53fbaf709fab000cd344b5c360338672dcf583d5 and f459f853355e62bd6aa103d1dec77fc6b8ca4e7b, respectively. Existing booking-policy.ts dependency hash fb480ca3f035d88c29d4581154f93afe6a527dbe.
- Full monorepo install/build/lint, real PG17 two-writer, tenant isolation, transactional promotion/rollback/outbox and browser tests are NOT_EXECUTED in this sandbox. GitHub queued checks are not PASS and have not been disabled.

Rollback: revert these three source/test/docs additions. This source-only increment does not alter data, schema, routes, deployment or runtime behavior until an explicitly verified adapter consumes it.
