# #757 · Procurement reception preflight

**Scope:** pure proposal on previously verified server-side PurchaseOrder lines and their already received amounts. An explicit actor+tenant is mandatory. Rejects duplicate effects/lines, mismatched supplier/product/tenant, invalid states, overflow and over-receipt using integer quantities at six decimals. Handles partial receipts and backorder deterministically.

**Not integrated:** No PurchaseOrder/GoodsReceipt tables, movement writes, reservations, AP or ledger changes, migrations, HTTP routes, inventory balance or retry persistence. `sourceVerified` means caller has actually checked DB/tenant, **not** an authority granted by the client. This flag must never be copied from an HTTP payload.

**Next:** Implement PostgreSQL 17 schema/constraints, idempotency unique indexes, transactional lock and revision CAS, ledger-based inventory receipt, RLS A/B negative tests, API RBAC and audit. #755 is warehouse authority, #756 reorder, #637 finance; no duplicate stock ledger. `SOURCE_REUSE=NONE`.

**Check:** `node --test tests/procurement_reception_preflight_v757.test.mjs`. No path has business side effects until backend transactional integration is reviewed. Roll back by reverting only this new module/test/doc.