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

## 2026-10-15 · Historical taxpayer identity and preflight response hardening

The canonical Client preflight remains **read-only and non-authorizing**. It now
enumerates the exact legacy RIF spelling `J-12.345.678-9` in addition to
`J123456789`, `J-123456789` and `J-12345678-9` (and corresponding prefixes).
The match is still strict and bounded, not an unrestricted substring search.
Other irregular legacy spellings may exist and still need data cleanup or a
transactional canonical-RIF index before reliable no-match conclusions.

When a valid lead RIF shares an email with an active same-tenant Client whose
historical RIF cannot be parsed, the verdict becomes `BLOCKED` with reason
`UNVERIFIABLE_CLIENT_RIF`, revealing only opaque IDs. An unknown fiscal identity
must never be treated as proof that the lead belongs to the same taxpayer.
Multiple candidates retain the preexisting `AMBIGUOUS_CLIENT_MATCH` contract.
Inactive and foreign-tenant records remain excluded from decisions.

The endpoint now sets `Cache-Control: private, no-store` before parsing the body,
to discourage browser/proxy caching of sensitive lookup verdicts. These rules
do not create, merge, or update a Client and do not replace tenant-bound
Prisma/PG constraints, RBAC or a real end-to-end session/HTTP/DB test.

Rollback is a source-only revert of the helper, domain verdict, route header,
and regression updates. Ticket #760 stays open until transactional CRM and UI.

## 2026-10-15 · Canonical Client preflight query budget (increment #760)

The sensitive `POST /api/v1/clients/preflight` now reuses the **existing**
`expensiveOperationRateLimit` from the core security middleware, in addition
to the application's global and mutation limits. The shared operation gate
currently enforces 12 requests/min in production and 60/min in non-production
per middleware key (IP by default); this is a local process/window throttle,
**not** a distributed tenant quota, durable anti-abuse ledger, or user permission.
The existing `requireTenant` and `clients.manage` license/RBAC gate executes
first, so unauthorized requests never reach the preflight-specific budget.
Only the `/preflight` POST subroute consumes this additional tier: ordinary
`Client` CRUD remains on the existing canonical limits. `Cache-Control:
private, no-store` and `reviewOnly:true` / `conversionAuthorized:false` are
unchanged. This addition performs no new Client writes or queries.

Regression: `node --test tests/crm_client_preflight_v760.test.mjs` covers the
exact middleware import, routing order, one preflight mount, no accidental
router-wide limiter, and continued `no-store`. Source contract coverage
is not a real HTTP burst test: full app + security/session + PostgreSQL 17
+ distributed rate-limit behavior need integration acceptance before a
production-complete CRM verdict. No new packages, workflows or env secrets.

## 2026-10-15 · Clientes UX connection to canonical preflight

The existing `clientes` page now calls `BackendApi.post('/clients/preflight',
{rif,email})` **before** `SupabaseSyncService.createClient` can be invoked.
`BackendApi` remains the single session/cookie/CSRF and API-base authority.
The page shows a live `role=status`/`aria-live=polite` review message; decision
copy uses fixed local reason-code mapping and never renders candidate Client
IDs, RIFs, emails or backend exception internals.

Only the exact `REVIEW_NEW/NO_EXISTING_CLIENT_MATCH` advisory verdict with
`reviewOnly:true`, `conversionAuthorized:false` and an empty candidates
array allows a subsequent **independent** canonical Client create API call.
`REVIEW_EXISTING`, fiscal-conflict, candidate overflow, unknown response,
network/auth/429/503 and server errors block the create attempt. The
existing local-only offline Client fallback was removed specifically from
the Clients form, because creating an unsynchronized customer record after
a failed canonical server write can produce duplicate identities on retry.
The UI is not a replacement for server transaction uniqueness or RBAC.

Acceptance command from repo root:
`node --test tests/client_preflight_ui_v760.test.mjs`.
This is a source contract and isolated verdict-policy suite, not browser
E2E or live PostgreSQL. Before certifying production CRM, test signed
cookies/CSRF, permissions and cross-tenant responses in a real HTTP stack
with an isolated DB and verify race/duplicate behavior under concurrent
creates. No DB migrations, new UI route, secondary customer master,
local data sync or automatic quote generation were introduced.
