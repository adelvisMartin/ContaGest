# QA exact-blob focal · ERP #743 #744 #753 #754 #755 #756 #757 · 2026-10-22

**PR:** #1283 · branch `fix/erp-seven-tickets-input-integrity-20261022`; baseline original `main@0b9a78a15e1eb8d9afeeee2f39d86b87a6ab0ca1`. This report certifies **only** local isolated source/test coverage at the blob SHAs below. It does NOT certify the PR's production readiness.

## Executed (VERIFIED)

Runtime: `node v22.16.0`, native `--experimental-strip-types`; `tsc` installed locally. An isolated mirror of eight canonical pure module files and eight canonical test files was reconstructed and **all 16 file contents compared using `git hash-object` to the exact GitHub blob SHA**.

```sh
node --experimental-strip-types --test \
  tests/bank_reconciliation_exceptions_v743.test.mjs \
  tests/bank_statement_line_identity_v743.test.mjs \
  tests/ar_ap_open_item_coverage_v744.test.mjs \
  tests/sales_quote_order_snapshot_intent_v753.test.mjs \
  tests/delivery_lifecycle_intent_v754.test.mjs \
  tests/inventory_lot_fefo_preflight_v755.test.mjs \
  tests/reorder_query_property_integrity_v756.test.mjs \
  tests/purchase_receipt_preflight_v757.test.mjs
# 64 tests; 64 pass; 0 fail; exit code 0.

tsc --noEmit --strict --target es2022 --module nodenext --moduleResolution nodenext --skipLibCheck \
  node-crypto-shim.d.ts \
  backend/src/modules/bank-reconciliation/bank-exception-window.ts \
  backend/src/modules/bank-reconciliation/statement-line-identity.ts \
  backend/src/modules/accounting/open-item-coverage.ts \
  backend/src/modules/sales/quote-order-snapshot-intent.ts \
  backend/src/modules/fulfillment/delivery-lifecycle-intent.ts \
  backend/src/modules/inventory/lot-fefo-preflight.ts \
  backend/src/modules/reports/reorder-scan-page.ts \
  backend/src/modules/purchases/purchase-receipt-preflight.ts
# exit code 0. The local shim provides only node:crypto's createHash ambient type;
# it is not committed and is not evidence of the full backend TypeScript build.
```

### Exact blob provenance

| Ticket | Source blob SHA | Test blob SHA |
| --- | --- | --- |
| #743 | `33b566757592b4f8adc4cde85f6de6859e215d6b` | `465bebf4c15e274fa13ac7897e044abddf3252b6` |
| #743 import identity | `d60ed233f26919ca13c1a6916c19f5cb42b7be3a` | `ddc4aff2f04578878e8b3acd5e264cc4629cf3f3` |
| #744 | `499b7dde082f9798dc39bab4c5293b5213a806f0` | `f915f26f05ab6bb433baac7c19f0e3a9d3fc527d` |
| #753 | `11b3a770e9b0fd006883ed0846ddbdbbfa4cd063` | `98a20160d5e15e6269f03bf05c6d5ab1565adeea` |
| #754 | `0a5badd9bd8be8b3186a7114620f518980700072` | `5995350e522510d4e135f7f99a18b417a8c965ef` |
| #755 | `9eb72e71480289228ec01745c2f307a527cd2f03` | `e9edc13938688862966ab8e2c6d3b7460e589d7e` |
| #756 | `fc2edc224908edbb06af72f189910186d3b5b38e` | `9a0d504fbf26cd6c272debcf7b5b776f79c3635a` |
| #757 | `9a399551a50d4b14cca75c4bd49388b74bbeef7f` | `2963794fa3f0de244f4517f7b0a3794dbfba6307` |

## What the 64 tests do / do not cover

- **Covered locally:** duplicate/cross-tenant *policy input* rejection, malformed money and `Decimal(18,2)` bounds, prototype action injection, quote snapshot immutability, FEFO date boundary/precision, reorder pagination/governing scope, purchase receipt quantity preflight and no implicit stock/ledger write.
- **NOT VERIFIED:** PostgreSQL17 database implementation of the seven tickets, persisted payment/reversal/credits, concurrent allocations/receipts, matching against bank statements and financial GL, SQL constraints/upgrade chain and RLS, tenant A/B HTTP RBAC, cross-browser workflow, notifications outbox retries, UI accessibility, concurrent reservation consume, full backend build/lint/test and root CI.
- **NOT IMPLEMENTED:** durable `PaymentAllocation`, `SalesOrder`, `Delivery`, `InventoryLocation`, `GoodsReceipt` authorities required by issue acceptance; the PR only hardens helpers/read-models and documents gaps. Tests cannot validate nonexistent persistence.
- **Provider:** absence of associated GitHub Actions execution or queued/skipped check is not PASS. Verify workflows and exact final PR HEAD separately.

## Security/readiness decision

`PARTIAL / NOT_RELEASE_READY`. No secrets, DDL, delete/overwrite, posting or automatic purchase in this increment. The PR can be reviewed as bounded security hardening but must remain **DRAFT** if represented as the full seven-ticket deliverable. Keep issues open and backlog active until material scopes and integration gates pass. Preserve fail-closed behavior and independent accounting/stock authorities; do not disable CI.

Latest two regression cases additionally deny coercible currency/amount objects and Symbol evidence in #744, and coerced quote/line currency in #753. Both were executed in the same **64/64 PASS** Node22 invocation; focal strict tsc exit 0. The SHA table above reflects this final set of sources/tests.

## Integrated bank import source (#743)

- `bank-reconciliation.service.ts` source blob `6523670b7da8ce045d88859cc2510d757d5dc598`: invokes `statementImportLineHash` in the real transactional import path, and invokes `assertBankLineReplayIdentity` on uniqueness collisions. The latter fails HTTP409 and rolls back changed-identity import instead of counting it as an unchanged duplicate.
- **NOT VERIFIED:** `bank-reconciliation.service.ts` whole-file strict build (external Prisma/runtime dependencies absent), HTTP/PG17 transaction behavior, bank statement SQL unique index enforcement and import concurrency. Its integration is source-reviewed, not fully executed.
- Source-vetted `statement-line-identity.ts` and focal regression suite were run locally at the exact GitHub blob hashes above. **64/64 unit tests PASS**; strict focal TS exit 0.
