# VE Tax — Single-PR scoped increment for #778 / #780 / #781 / #782 / #783

This change is a **partial, non-posting fiscal evidence improvement**, not completion of the five tax/accounting tickets. Original main baseline: `d85a9d81d4e01d1f07a71fea34d92f9166ead9d6`.

## Implemented boundaries

- **#778 IGTF** — Unique reviewed, ACTIVE, effective catalog selection by tenant/currency/payment method/operation/taxpayer classification; reject missing, overlapping, draft, expired or cross-tenant rules. Only an exact-minor-unit preview.
- **#780 Municipal** — Bounded (max 500), immutable, deterministic SHA-256 in-memory month evidence of reviewed scoped municipal event previews. Duplicate event IDs, overlapping rule versions, cross-tenant/month and unsafe totals fail closed. It is not a tax return or assessed municipal obligation.
- **#781 Payroll** — Reviewed FAOV/IVSS/INCES read-only previews reject an event date in a different payroll month. Existing payroll persistence and journal remain unchanged.
- **#782 Sales/purchase books** — GET `/fiscal/books/readiness` now hashes source invoice identity, currency, control number, exact Decimal-as-string subtotal/IVA/IGTF/retention/total. No amount is recalculated and no unverified source is certified. Existing status: `BLOCKED_NOT_CERTIFIED`.
- **#783 Compliance** — GET `/fiscal/compliance/readiness` includes persisted TaxPeriod IVA debit/credit and IGTF paid exact-decimal strings in a stable evidence hash. External filing and bank reconciliation remain unverified; status: `BLOCKED_NOT_READY`.

Existing RBAC and server-derived tenant filters in both API routes are preserved. No invented legal rates, deadlines, filing, certificates, GL codes, transactions, migrations or production data mutations. Source changes update evidence hashes instead of reinterpreting prior tax rules.

## Material blockers / follow-up

#751 source-to-ACTIVE legal rule provenance and immutable persisted snapshots; #774 authoritative effective tenant taxpayer profile; #785 semantic account mappings and balanced journal posting. Remaining DoDs require legally verified applicability, real fiscal source-to-invoice relationships, closing/reopening, corrections/reversals, payroll accrual/settlement, banking/GL reconciliation, period locking, outbox/reminders and tenant-safe PostgreSQL 17 E2E.

## Verification scope

- Added `tests/ve_tax_period_scope_778_780_781.test.mjs` and `tests/ve_fiscal_readiness_recorded_evidence_782_783.test.mjs`.
- Existing regression files: `tests/ve_igtf_event_preview_v778.test.mjs`, `tests/ve_municipal_event_preview_v780.test.mjs`, `tests/ve_parafiscal_payroll_preview_v781.test.mjs`, `tests/fiscal_book_readiness_v782.test.mjs` and `tests/fiscal_compliance_readiness_v783.test.mjs`.
- Required full gates: workspace install, typecheck, lint, build, fiscal/accounting characterization, PG17 two-tenant, API/browser, exact-HEAD GitHub Actions, final diff review.
- Existing TypeScript preview tests use `.ts` imports and internal `.js` specifiers; use repository-authorized test runner/module resolution. Never disable CI or turn failed tests into skips.

Keep all five issues OPEN in backlog until each DoD and required checks are actually demonstrated. A partial PR must not use GitHub closing keywords.
