# Composite Tenant Referential Integrity — #634

## Purpose

#634 hardens relations where a globally valid referenced ID must still belong to the authenticated tenant. Application filtering is retained as defense in depth, but critical tenant-owned relations become physically impossible to cross in PostgreSQL whenever both child and parent persist tenant ownership.

Implementation baseline: `main@f38287cda3a72d6fe8ad49a3e7c307bd132490fc`.

## Classification authority

`config/composite-tenant-integrity-v634.json` is the reviewable authority for this slice.

The baseline contains:

- **72 `DB_ENFORCEABLE` relations** where child and parent already persist `tenantId` and already have a physical single-column FK;
- **3 `SERVICE_ENFORCED` relations** where the child derives tenant ownership through its aggregate and adding a redundant `tenantId` would create another authority;
- exact ordered relation-set MD5 `54bfdcbf73818d4892484bafc0f25e2c`.

The migration verifies both the candidate count and exact relation-set digest before its first DDL statement. A different schema with the same number of relations therefore fails closed.

## DB enforcement

For each `DB_ENFORCEABLE` relation, the forward-only migration creates:

1. a parent unique supporting index on `(tenantId, id)`;
2. a child supporting index on `(tenantId, referenceId)`;
3. a second composite FK `(tenantId, referenceId) -> Parent(tenantId, id)`;
4. the guard initially as `NOT VALID`, then `VALIDATE CONSTRAINT`.

The new FK is an **integrity guard only** and uses `NO ACTION` for delete/update. Existing single-column FKs remain the lifecycle owners for `CASCADE`, `SET NULL`, or other established behavior. This avoids duplicating lifecycle rules while still preventing cross-tenant inserts and reparenting.

`VALIDATE CONSTRAINT` is deliberate: if historical data is ambiguous or cross-tenant, migration stops instead of rewriting or reparenting data.

No `UPDATE`, `DELETE`, business-row `INSERT`, `TRUNCATE`, `DROP TABLE`, or `DROP COLUMN` is part of this migration.

## Service enforcement

Some references do not store tenant ownership on the child row. They remain service-enforced instead of receiving redundant tenant columns:

- `SalesInvoiceLine.productId -> Product.id`;
- `PurchaseInvoiceLine.productId -> Product.id`;
- `TaxDeclaration.taxPeriodId -> TaxPeriod.id`.

`backend/src/shared/middleware/tenant-reference-guard.ts` validates these references against the authenticated/request-context tenant before mutation. It also performs defense-in-depth checks for sales clients and purchase suppliers.

The guard:

- obtains tenant identity from server request context, never from the request payload;
- accepts same-tenant references;
- rejects unavailable/cross-tenant references with `409` and stable code `CROSS_TENANT_REFERENCE`;
- deliberately does not reveal whether a foreign ID exists in another tenant;
- covers POST/PUT/PATCH only.

## Production observations — read-only

On 2026-09-29 the production catalog inspection found 72 physical id-only FK candidates where both sides persist tenant ownership. Read-only aggregate checks on the seven primary core relations showed **zero cross-tenant rows**:

- `BankMovement.accountId -> BankAccount.id`;
- `InventoryMovement.productId -> Product.id`;
- `SalesInvoice.clientId -> Client.id`;
- `PurchaseInvoice.supplierId -> Supplier.id`;
- `LedgerEntry.salesInvoiceId -> SalesInvoice.id`;
- `LedgerEntry.purchaseInvoiceId -> PurchaseInvoice.id`;
- `TenantMembership.userProfileId -> UserProfile.id`.

This is not a claim that every one of the 72 relations has zero mismatches; only the seven listed checks produced explicit aggregate results in this implementation session. Production was never mutated.

## PostgreSQL 17 verification contract

`scripts/composite-tenant-integrity-v634.mjs --verify-database` requires an isolated URL accepted by the #632 destructive-database safety contract and rejects PostgreSQL <17.

After the canonical migration chain has been applied, it verifies:

- exact 72-relation catalog count and digest;
- all 72 composite guard FKs exist and are validated;
- an isolated two-tenant fixture on `SalesInvoice -> Client`:
  - A -> A accepted;
  - A -> B insert rejected;
  - A -> B reparent/update rejected;
  - deleting the same-tenant client preserves the existing `SET NULL` lifecycle and leaves invoice `tenantId` intact;
- fixture cleanup is guaranteed by transaction rollback.

Recommended sequence from a clean isolated PostgreSQL 17 environment:

```powershell
node scripts/canonical-database-gate-v632.mjs --expected-sha <candidate-sha>
node scripts/composite-tenant-integrity-v634.mjs --verify-database
```

The #632 gate remains responsible for canonical from-zero/upgrade execution. #634 adds the tenant-integrity assertions after that canonical preparation.

## Regression tests

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

The repository contract is also registered in `scripts/run-authoritative-contracts.mjs`.

## Boundaries / follow-ups

This ticket intentionally does not absorb unrelated relational debt:

- #683 owns missing implicit local FKs such as relations not already represented physically;
- #684 owns standalone FK supporting-index gaps discovered by #633;
- #685 owns historical audit/ledger/fiscal/legal cascade policy;
- #635 owns RLS/grants/`SECURITY DEFINER` hardening.

## Evidence status at implementation time

- source/catalog analysis: executed;
- production inspection: read-only only;
- TDD RED for the repository contract: executed;
- PostgreSQL 17 from-zero/upgrade + two-tenant DB smoke: required before merge and must not be reported PASS until actually executed;
- remote Actions/Vercel: provider status is reported separately from code correctness.
