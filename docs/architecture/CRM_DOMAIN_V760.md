# #760 CRM — Domain integrity foundation (partial implementation)

**Status:** implementation increment, not a deployed CRM. **SOURCE_REUSE=NONE**. Existing `Client` is the only canonical customer master; the future quote lifecycle belongs to ticket #753 and is not implemented by this increment. No new tables, endpoints, routes, migrations, seed data, fiscal/accounting logic or application UI are introduced here.

## Implemented source contract

- `backend/src/modules/crm/crm-domain.mjs` (pure, side-effect-free): conservative RIF/email normalization, unique and tenant-specific active Client candidate IDs, explicit human/API review classification, legal stage edges, exact-decimal (18,2) money and currency-separated deterministic weighted pipeline summaries.
- `tests/crm_domain_issue_760.test.mjs`: Node 22 regression tests cover cross-tenant inference denial, ambiguous identity, disabled auto conversion, negative and malformed amounts, invalid stages, multi-currency grouping, and precision at 16-digit integer boundaries.

## Trust and authority model

- **No client writes:** finding one match returns `REVIEW_EXISTING`, not a new Client. Multiple matches return `BLOCKED`; no RIF returns `CLIENT_RIF_REQUIRED`. Caller must enforce session, RBAC, server-derived tenant, and atomic uniqueness/reconciliation against the real `Client` table before making any persistent change. Duplicate candidate matching is a **hint**, not an idempotent conversion transaction.
- **No cross-tenant queries:** callers must provide tenant-scoped candidates; detection filters by exact tenant. Forecast rejects all rows with a foreign tenant, rather than silently omitting them.
- **No automated IA score:** the probability must be an explicit integer supplied by approved business rules/user, never LLM output. The currency is not converted or added across FX contexts. Monetary inputs are fixed-point strings; aggregation uses `BigInt` minor units; rounded expected values are analytical only, never an accounting/ledger posting authority.
- **No PII in conversion verdict:** only Client IDs and reason codes, never copied emails/RIF/phone. A future endpoint still requires access logs without sensitive payloads.
- **No queue or task clone:** activity timeline in a later slice must reuse core Tasks/Outbox (#853) instead of creating duplicate worker authority.

## Next required implementation owners

1. **#760**: explicit `Lead`/`Opportunity` persistence with Prisma migration and tenant-first indexes, RBAC, server-side validation and atomic idempotency on conversion to canonical `Client`.
2. **#760 + #753**: only canonical quote authority may materialize opportunity quotes. No independent invoice/billing engine.
3. **#760 + #770**: bounded import/export with ownership and audit. Stage actions and metrics need tenant-sourced SQL, predictable pagination, Cg* UI and responsive browser tests.
4. **QA**: Node syntax/contract tests for this source increment; subsequent PostgreSQL17 isolated migration/integration, concurrency and cross-tenant negatives, browser Playwright, typecheck, lint and accessibility for the actual runtime feature. The user can perform additional manual acceptance at the end; do not substitute it for data-safety verification.

## Usage and rollback

From repo root: `node --check backend/src/modules/crm/crm-domain.mjs` and `node --test tests/crm_domain_issue_760.test.mjs`. No packages required. This helper is **not mounted** and should not be advertised as a finished CRM pipeline. Delete these three new files to roll back; no database or production changes.

## 2026-10-15 · Opportunity stage change / event intent (increment #760)

`planOpportunityStageChange()` is a **pure, non-persisting** contract for an authorized CRM stage change. The API caller must derive `tenantId` and `actorId` from a verified server session; the client must not choose these. It demands an exact optimistic `expectedVersion`, valid UUIDs for opportunity/actor/event, an unambiguous server-generated UTC timestamp, allowed state transitions, and replay rejection (UUID comparison case-insensitive). It emits a frozen next revision plus a compact event receipt with no lead/customer PII.

**Persistence requirements before activation:** introduce a dedicated tenant-scoped `Opportunity` and append-only activity/event table, or another explicitly approved CRM persistence authority. The eventual handler must check `sales.manage` (or approved CRM permission), use a tenant-scoped `UPDATE ... WHERE version = expectedVersion` compare-and-swap, enforce a unique tenant/opportunity/event ID constraint, and write the resulting activity **in the same database transaction**. Unique keys in PostgreSQL, not `seenEventIds` in an API request, are authoritative for replay/idempotency. A version mismatch should return a conflict without side effects; never let browser-provided timestamps or actor IDs become authoritative. Plan-only results are **not** proof of a completed event.

Tests now exercise valid transitions, immutable and privacy-minimal receipts, stale revisions, cross-tenant input, terminal-state rewrites, malformed IDs/timestamps and case-insensitive replay. No persisted activities, quote binding, API writes, row locks or app UI are claimed in this increment. The existing rollback guidance for initial groundwork remains historical; revert the specific stage-planning change to undo this increment.

## 2026-10-15 · Legal-identity mismatch on email matches

Client identity is legally grounded in **tenant + RIF**, not email address. An email
is contact metadata that may be shared by several tax entities. A prospect with
valid RIF `J...` must **not** be reconciled into a Client with a different valid
RIF `V...` merely because the emails match. This applies even if there is only
one same-email candidate and also when another Client has an exact RIF match.

The pure `assessClientConversion()` verdict now returns
`{status:'BLOCKED',reason:'CONFLICTING_RIF_EMAIL',candidates:[opaque IDs]}`
for same-tenant, active cross-RIF email collisions. It avoids leaking email/RIF
values in the verdict. Same-RIF Client records with changed email still return
`REVIEW_EXISTING` for authorized human reconciliation. Inactive or other-tenant
records are never included in a prospect's decision.

**Important:** these are advisory pre-conversion rules. No automatic Client
creation, merged fiscal identity, mutation, import, quote or data migration was
implemented. Final authority remains the canonical `Client` table, server
tenant context, RBAC and database uniqueness/atomic transaction. A later
transactional converter must re-run and enforce this conflict rule against
fresh tenant-scoped data, never trust a stale or client-supplied candidate list.


## 2026-10-15 · Canonical Client matching preflight API (partial CRM #760)

**Live mounted endpoint:** `POST /api/v1/clients/preflight` (same existing `/clients` route authority, not a second CRM module). Requires a verified tenant and the existing `clients.manage` permission plus the existing licence guard. Request body is strict JSON with `rif` and/or `email`. Unknown keys and malformed supplied identities are rejected. Tenant/user are taken from the server session, never from body or headers in production.

The handler queries **only the existing Prisma Client model** and is deliberately read-only. Query predicates include tenantId, active clients, exact-case-insensitive normalized RIF variants or email, a bounded 201-row read (200 maximum results), and a minimal field selection. More than 200 matches returns `BLOCKED/CANDIDATE_LIMIT_EXCEEDED` with no candidate IDs. Database errors do not become authorization to convert. The verdict always contains `reviewOnly:true` and `conversionAuthorized:false`; it exposes only opaque Client IDs, no client emails/RIF/contact fields.

This is a **heuristic review aid**, not a comprehensive fiscal uniqueness check: legacy Client RIF punctuation variants beyond the three enumerated spellings may not match. An empty result does **not** prove that no client already exists. The eventual persistent conversion must re-query canonical Client under tenant-scoped locks/unique RIF rules, apply RBAC, and atomically reconcile. Email addresses are not legal taxpayer identities; cross-RIF same-email candidates are blocked.

Regression command (repository root): `node --test tests/crm_client_preflight_v760.test.mjs`; wired into `backend npm test`. The isolated suite uses an injected fake Prisma reader, not a real PostgreSQL instance. Route HTTP / auth / PG17 / E2E tests and full backend typecheck/build remain pending before treating the entire CRM as production-ready; #760 stays OPEN.

No Lead/Opportunity DDL, quote link, conversion mutation, FX/accounting, provider notification, frontend UI or migration is delivered by this slice. Revert the isolated endpoint, runner hook and helper to roll back without data loss.
