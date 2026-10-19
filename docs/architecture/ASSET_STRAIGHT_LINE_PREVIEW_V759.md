# #759 · Fixed asset straight-line schedule preview

One deterministic read-only schedule for server-verified tenant assets, monthly straight-line depreciation in integer cents (not JS floating-point); cost – residual reconciles exactly via early-month remainder pennies. Months are UTC calendar periods and snapshots retain currency. Supports only a first-of-month in-service date to avoid inventing legal prorata rules.

**Non-authority:** not an official depreciation expense, posting, tax allowance, custody change, purchase, disposal or fixed-asset registry. The `sourceVerified` flag is a requirement of trusted backend context, never a client permission. Only financial service #637 may validate account/period/rules and post double-entry effects. No side effects, schema, FX conversions or new ledger.

**Acceptance still missing:** tenant-scoped Asset/AssetClass persistence, acquisition/activation, versioned life changes, idempotent period posting, disposal/transfer and reversal with actor/audit, tax treatment, PG17 isolation/API/browser. `SOURCE_REUSE=NONE`.

**Test:** `node --test tests/asset_straight_line_schedule_v759.test.mjs`. Reversion deletes new files; no data to revert.