# Composite Tenant Referential Integrity — #634

## Purpose

#634 prevents a globally valid foreign ID from being associated with a row owned by another tenant. Application filtering remains defense in depth, while relations that persist tenant ownership on both sides gain PostgreSQL composite referential guards.

Implementation started from `main@865fcc88a4d877b68466a64cef1a0a56370fb5fc`, was reconciled after production convergence, and was finally reconciled against the live `main` during the final validation campaign. Evidence is bound to the final candidate SHA and is never reused across earlier baselines.

## Classification authority

`config/composite-tenant-integrity-v634.json` is the reviewable authority for this slice.

At this baseline it classifies:

- **80 `DB_ENFORCEABLE` relations**: child and parent both persist `tenantId` and already have a physical single-column FK.
- **3 `SERVICE_ENFORCED` relations**: child ownership is derived through its aggregate, so adding a redundant tenant column would create a second authority.
- **0 `GLOBAL_REFERENCE`** and **0 `PLATFORM_REFERENCE`** among the scoped physical tenant-owned FK candidates. New exceptions must be explicit rather than inferred.
- exact ordered DB relation-set MD5: `40bcc4ea915585c961a4327c109e4358`.

A read-only inspection of Supabase production on 2026-09-29 independently confirmed 80 candidates, the same digest, `tenantId` on both sides of all 80 relations, and zero nullable tenant columns in that set. Production was not mutated.

A full read-only preflight then checked **all 80 DB-enforceable relations** and found **0 cross-tenant rows in 80/80**. The two aggregate-owned product references (`SalesInvoiceLine.productId` and `PurchaseInvoiceLine.productId`) also reported **0 cross-tenant rows** when ownership was derived through their invoices. `TaxDeclaration` intentionally has no `tenantId`; its tenant ownership is derived from `TaxPeriod`, which is why that relation remains service-enforced rather than gaining redundant child tenant state. Generated physical identifiers were also checked against the live catalog: 0 names exceed PostgreSQL's 63-byte limit and no duplicate guard/index names were found.

## DB enforcement

The forward-only migration `20260929173500_issue_634_composite_tenant_referential_integrity` first recomputes the physical candidate count and relation-set digest from PostgreSQL catalogs and aborts before DDL if they differ. Its migration ID is intentionally ordered after the already-applied `20260929164500_issue_627_production_convergence_hardening` migration so from-zero and upgrade candidates do not observe conflicting chronological authority.

For every `DB_ENFORCEABLE` relation it creates:

1. parent supporting uniqueness on `(tenantId, id)`;
2. child supporting index on `(tenantId, referenceId)`;
3. composite FK `(tenantId, referenceId) -> Parent(tenantId, id)`;
4. `NOT VALID` followed by `VALIDATE CONSTRAINT`.

The composite guard uses `NO ACTION` for delete/update. Existing single-column FKs remain lifecycle owners for `CASCADE`, `SET NULL`, or other established behavior. This separates tenant integrity from lifecycle semantics.

There is no data rewrite/backfill. Existing ambiguous or cross-tenant history makes `VALIDATE CONSTRAINT` fail closed instead of being silently reparented.

## Service enforcement

The scoped relations without child tenant ownership are:

- `SalesInvoiceLine.productId -> Product.id`;
- `PurchaseInvoiceLine.productId -> Product.id`;
- `TaxDeclaration.periodId -> TaxPeriod.id`.

`backend/src/shared/middleware/tenant-reference-guard.ts` validates applicable references against the authenticated/request-context tenant before mutation. It checks invoice-line products through their sales/purchase request aggregates, validates a supplied canonical fiscal `periodId` against `TaxPeriod.tenantId`, and performs defense-in-depth checks for sales clients and purchase suppliers.

The guard obtains tenant identity from server context, never from payload; accepts same-tenant references; rejects unavailable/cross-tenant references with HTTP 409 and stable code `CROSS_TENANT_REFERENCE`; and does not disclose whether a rejected ID exists in another tenant. Its regression fixtures model ownership explicitly, so removing `tenantId` from a database lookup makes the positive tenant-scoped tests fail instead of producing a false green.

## Verification contract

Repository contract:

```powershell
node --test tests/composite_tenant_integrity_v634.test.mjs
```

Backend service guard:

```powershell
cd backend
npm run test:tenant-references
npm run typecheck
npm run build
```

PostgreSQL 17 isolated gate after canonical #632 preparation:

```powershell
node scripts/canonical-database-gate-v632.mjs --expected-sha <candidate-sha>
node scripts/composite-tenant-integrity-v634.mjs --verify-database
```

The existing `migration-chain-v626.yml` workflow reuses its PostgreSQL 17 service for the focused #634 contract, service-reference negatives, from-zero migration chain, A/B database negatives, supported upgrades, Prisma validation/generation, backend typecheck/build and database audits on the exact PR candidate.

The DB verification requires PostgreSQL 17, verifies the exact 80-relation catalog, then checks every composite guard structurally: child/parent table, exact `(tenantId, referenceId) -> (tenantId, id)` columns, validated FK, `NO ACTION` actions, valid parent unique index and child supporting index. It also runs a transactional two-tenant fixture proving A→A/B→B success, A→B and B→A rejection, cross-tenant reparent rejection, preserved lifecycle semantics and cleanup by rollback.

## Safety and boundaries

- No production `db push/reset`.
- No destructive cleanup or automatic repair of ambiguous rows.
- No tenant identity accepted from request payload.
- No changes to RLS/grants (`#635`), implicit missing relations (`#683`), standalone FK index debt (`#684`) or historical cascade policy (`#685`).
- Production catalog reads contain metadata/aggregate evidence only, not business row values or PII.
- Production was used only for read-only catalog/preflight checks; no #634 DDL was executed there during implementation.

## Evidence state

The PostgreSQL 17 destructive/integration gate is mandatory before #634 can be declared DONE. If the exact-SHA PG17 workflow cannot obtain a runner and no isolated local PG17 runtime is available, the ticket remains `BLOCKED`, never PASS. Remote deploy/provider status is tracked separately from code correctness.
