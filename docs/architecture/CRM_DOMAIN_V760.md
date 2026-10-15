# #760 CRM — Domain integrity foundation (partial implementation)

**Status:** implementation increment, not a deployed CRM. **SOURCE_REUSE=NONE**. Existing `Client` is the only canonical customer master; `SalesQuote` / #753 remain the sales contract authorities. No new tables, endpoints, routes, migrations, seed data, fiscal/accounting logic or application UI are introduced here.

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
