# #634 Composite Tenant Referential Integrity — Implementation Plan

Baseline: `main@f38287cda3a72d6fe8ad49a3e7c307bd132490fc`
Branch: `feat/634-composite-tenant-integrity`

## Goal

Prevent cross-tenant references in critical tenant-scoped relations at the strongest correct boundary without inventing tenant semantics for global/platform references or rewriting historical data.

## Scope

1. Inventory every physical FK where both child and parent expose `tenantId`/`tenant_id`, and classify it as:
   - `DB_ENFORCEABLE`
   - `SERVICE_ENFORCED`
   - `GLOBAL_REFERENCE`
   - `PLATFORM_REFERENCE`
2. Harden critical core + clinical relations that are structurally DB-enforceable.
3. Preserve existing delete/update semantics, including nullable references.
4. Refuse ambiguous/cross-tenant existing rows; never auto-reparent or backfill them.
5. Add deterministic catalog checks and two-tenant negative tests.
6. Keep #683 missing local FKs, #684 FK index gaps, and #685 historical cascade policy out of this ticket.

## Files expected

- `config/composite-tenant-integrity-v634.json` — explicit relation/classification policy.
- `scripts/composite-tenant-integrity-v634.mjs` — policy validation, catalog verification, and PG smoke runner.
- `tests/composite_tenant_integrity_v634.test.mjs` — unit/contracts and migration safety regressions.
- `backend/prisma/migrations/<timestamp>_composite_tenant_referential_integrity/migration.sql` — forward-only constraints/indexes.
- `docs/composite-tenant-integrity-v634.md` — operator/architecture documentation.
- `scripts/run-authoritative-contracts.mjs` — register permanent regression.
- Prisma schema only if needed to keep ORM schema and physical constraints semantically aligned; raw SQL constraints remain sidecar DB-authority only when Prisma cannot express the required FK action safely.

## Design

### DB-enforceable pattern

For child `C(tenantId, parentId)` referencing tenant-scoped parent `P(tenantId, id)`:

1. ensure a parent unique key/index on `(tenantId, id)`;
2. ensure a child supporting index on `(tenantId, parentId)`;
3. add a composite FK `(tenantId, parentId) -> P(tenantId, id)`;
4. preserve current delete/update behavior;
5. for nullable references using `SET NULL`, use PostgreSQL 17 column-list semantics so only `parentId` is nulled and `tenantId` remains owned by the child;
6. migration must fail on existing cross-tenant rows rather than mutate them.

### Service-enforced pattern

When the child does not persist tenant ownership (for example line-item rows that derive tenant through their parent document), do not add redundant tenant columns merely to satisfy a formal pattern. The relation is classified `SERVICE_ENFORCED`; tenant ownership must be validated through the aggregate/service boundary and covered by integration tests.

## Priority relations

First hardening slice:

- `BankMovement.accountId -> BankAccount.id`
- `InventoryMovement.productId -> Product.id`
- `SalesInvoice.clientId -> Client.id`
- `PurchaseInvoice.supplierId -> Supplier.id`
- `LedgerEntry.salesInvoiceId -> SalesInvoice.id`
- `LedgerEntry.purchaseInvoiceId -> PurchaseInvoice.id`
- `TenantMembership.userProfileId -> UserProfile.id`
- clinical `Care*` parent/child relations where both sides persist `tenantId`.

Other relations are classified in the manifest and only changed when the same invariants and lifecycle semantics are proven.

## TDD / verification sequence

1. RED: regression requires the new policy/module and expected critical classifications.
2. GREEN: implement pure policy/catalog logic.
3. Add migration contract tests: forward-only, no data rewrite, required composite parent keys, child indexes, composite FK, and safe nullable action semantics.
4. Execute on isolated PostgreSQL 17 through the canonical #630/#632 path:
   - from-zero migration chain;
   - A→A and B→B positives;
   - A→B and B→A rejects;
   - cross-tenant reparent/update rejects;
   - delete/cascade/set-null semantics stay tenant-safe;
   - valid upgrade fixture passes;
   - ambiguous/cross-tenant fixture fails without mutation.
5. Run relevant backend/service integration tests for service-enforced relations.
6. Run authoritative contract suite for the changed test registry.
7. Review exact diff and secrets/data exposure.
8. Open PR, inspect exact-SHA provider status, merge only if material local DB gates passed; provider-only blocks remain separate.

## Current environmental risk

The current chat/container has no local `psql`, PostgreSQL server, Docker, or Podman. Production Supabase is PostgreSQL 15 and must remain read-only. A paid Supabase development branch must not be created without explicit cost confirmation. Therefore the implementation may reach a complete candidate but cannot be declared `DONE` or merged until a real isolated PostgreSQL 17 execution path is available (local, exact-SHA CI runner, or explicitly authorized isolated provider environment).
