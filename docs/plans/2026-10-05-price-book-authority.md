# #856 Price Book Authority — Implementation Plan

## Goal
Establish one tenant-scoped, auditable price-resolution authority for products/services without absorbing tax, FX, promotions or entitlements. Preserve `SalesInvoiceLine.unitPrice` as the historical commercial snapshot.

## Characterization
- `Product.price` is the current legacy product price and has no currency/effective-date evidence.
- Sales currently accepts caller `unitPrice`, then computes invoice totals before persistence.
- Sales defaults document currency to `VES` and snapshots exchange rate separately; pricing must not reinterpret FX accounting.
- No canonical Quote/Order/POS transaction API exists on this baseline. The resolver must therefore be reusable by those future owners rather than inventing parallel endpoints now.
- `BusinessLocation` from #857 is the location authority and must be referenced tenant-safely.
- Taxes remain owned by the financial/tax authority; pricing returns a commercial base unit amount only.

## Legacy decision
`Product.price` is migrated to a system `LEGACY_PRODUCT` fixed-price book in `VES`, matching the existing Sales default currency. The resolver never reads `Product.price`. Future writes to the legacy column are synchronized into the system book for backward-compatible product clients, so the column is a compatibility command/projection rather than a second resolver authority.

## Implementation steps
1. Add focused domain tests for deterministic precedence, effective boundaries, ambiguity and fixed/FX-derived semantics.
2. Add a pure pricing policy module using exact Decimal helpers.
3. Add PostgreSQL migration for PriceBook, PriceEntry, PriceBookLocation and SalesLinePriceSnapshot, with tenant guards, overlap/conflict protection, immutable used-price evidence and legacy backfill/synchronization.
4. Add repository/resolver service that validates tenant/product/location ownership and resolves exact candidates with source/version evidence.
5. Add protected `/price-books` CRUD/entry/preview API with audit and no destructive rewrite of historical evidence.
6. Add a pre-sales pricing middleware before the existing `/sales` route so product lines are resolved before `calculateInvoiceTotals`; manual non-product lines retain explicit price input. DB trigger defends the persisted unit-price/evidence contract.
7. Add migration/tenant integration probe for from-zero-style authority creation, legacy upgrade/backfill, A/B isolation, location scope and historical snapshot immutability.
8. Run exact-SHA typecheck/build/tests and migration gates available in CI; inspect failures against `main` before classifying them.

## Acceptance mapping
- Legacy `Product.price`: migration + sync trigger + resolver never reads it.
- Deterministic Decimal/effective dates: pure policy + DB constraints + preview resolver.
- Multi-currency: typed `fixed` vs `fx_derived`; FX rate is an explicit external financial-authority input, never looked up or reinterpreted by pricing.
- Shared consumers: reusable resolver contract; current real Sales flow consumes it, future Quote/POS/Service owners use the same module/API rather than parallel fee logic.
- Historical immutability: persisted sales line plus immutable source/version snapshot.
- Tenant/RBAC: protected routes, cross-tenant product/location rejection and DB guards.
