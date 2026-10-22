# ERP #756 · Persisted reorder policy and stock review authority

Date: 2026-10-22 · PR #1283 · SOURCE_REUSE=NONE. **Status: IMPLEMENTED IN SOURCE / PG17 INTEGRATION NOT VERIFIED / NOT RELEASE READY.**

## Existing authority and design
- Reuse canonical `Product.stock`, `Product.reserved`, `Product.minStock`, `InventoryMovement`, existing `previewReorderPolicy` exact-BigInt arithmetic; no duplicate inventory totals.
- One optional `InventoryReorderPolicy` row per `(tenantId, productId)`: enabled, reorderPoint/target/safetyStock/orderMultiple Decimal(18,3), leadTimeDays 0..365, revision, audit actor/timestamps. Existing products have **no automatic policy backfill**; old reports are preserved.
- Forward-only migration: PK, composite product-tenant FK (requires existing #634 composite uniqueness), check constraints, RLS `private.current_tenant_id()`, no direct unauthenticated Supabase privileges. PostgreSQL17 migration must pass from-zero, upgrade, RLS and drift gates before merge.
- `PUT /api/v1/reorder-policies/:productId` requires tenant authentication, `inventory.manage`, actor and strict JSON body. `expectedRevision:0` is first create; `>=1` performs atomic CAS update. Stale revision, concurrent create/serialization failure → HTTP 409; body does not accept tenantId, stock or purchase side effects. Serializable transaction verifies tenant-active product and canonical stock, writes policy and `AuditLog` atomically.
- `GET /api/v1/reorder-policies/:productId` requires `reports.view` and returns policy + fresh canonical stock review or null when no policy/disabled. No cache; explicit `manualApprovalRequired` / `autoPurchaseEnabled:false`.
- `GET /api/v1/reports/inventory/reorder` reads active policies in **the same RepeatableRead transaction** as paginated products and optional sales. Returns `planning.persistedPolicyCandidates` with exact recommended quantity and `persistedPolicyExceptions` for inconsistent rows; preserves original `reorderCandidates` based on `Product.minStock` unchanged. Scope `ACTIVE_CATALOG_PAGE_ONLY`; pagination is not stable across HTTP requests.
- `GET /api/v1/reports/inventory/reorder/preview` remains what-if, not a write authority. No automatic PO generation, forecast velocity, lot/location availability nor accounting valuation is claimed.

## PUT request example
```json
{
  "expectedRevision": 0,
  "enabled": true,
  "reorderPointExact": "5.000",
  "targetStockExact": "20.000",
  "safetyStockExact": "2.000",
  "orderMultipleExact": "6.000",
  "leadTimeDays": "7"
}
```
Retrying create with `expectedRevision=0` after success is a conflict, not a duplicate silent write. Client must read the current policy and pass the current `revision` for an explicit edit. Actor must hold appropriate RBAC; no untrusted request may choose another tenant.

## Security & QA
- Local Node22 source/test exact Git blob check: `reorder-policy-preview.ts@762c5c23d4d1ab10bbda2d5113f8e67c93e02cb9`, `reorder-policy-write.ts@483e435b29e8058d07dadd259342c37fa2f1715a`, `reorder_policy_write_v756.test.mjs@72e3b4594dd4a128e35b1a05fdec38e9336711e2`. Compiled isolated TS with strict `tsc` and executed the 9 unit tests against compiled JS: **9/9 PASS**. Existing seven-ticket isolated suites: **64/64 PASS** (not full backend).
- Error/negative checks: invalid quantity/precision/negative/scientific notation, invalid revisions, overridden tenant keys, hidden symbols/getters, safety above point, zero multiple, overflow, no automatic purchase.
- **NOT EXECUTED/VERIFIED:** complete backend build/Prisma generate and migrate chain, PostgreSQL17 tenant A/B/FK/RLS/CAS/concurrency, HTTP API authentication, cross-tenant mutation negatives, browser UI, full inventory ledger reconciliation #738, CI exact HEAD.
- Do not close #756 before adding those gates and remaining acceptance: location-aware #755 planning, ledger-reconciled stock ageing, slow-moving/near-expiry drill-down and outbox notifications.

## Accounting/legal scope
IAS 2 inventory valuation is separate from reorder suggestions and FEFO picking: the IFRS Foundation describes cost/NRV and FIFO/weighted average as valuation rules (https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/). This policy stores **operational quantity thresholds, not accounting cost, write-offs, purchases, tax or official balances**. Código de Comercio art.44 retention obligations apply to financial books/evidence (https://www.wipo.int/wipolex/es/legislation/details/4008). Applicability under VEN-NIF and fiscal taxpayer profile still needs authorized review.

## Rollback
Reverse policy repository/API/manifest/reader integration and migration **only before production use**. After policy rows exist, preserve history and audit; use a reviewed forward migration rather than dropping tables or deleting financial records. No stock, invoices or GL touched by this change.
