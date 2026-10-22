# PR #1280 — Exact evidence and QA register (2026-10-22)

**Tickets** #778, #780, #781, #782, #783. **Current outcome: PARTIAL / NOT RELEASE READY.** No release claim, no completion claim, no production rules activated.

Baseline: `main@d85a9d81d4e01d1f07a71fea34d92f9166ead9d6` at branch creation. Actual PR base and final head must be reread from GitHub before any merge; main may advance.

## Verified (real executions)

- Executed Node.js **v22.16.0** `node --experimental-strip-types --test` in a **temporary isolated copy**, with only a test-local `.js` → `.ts` symlink. No repository runner/CI alteration:
  - `backend/src/modules/fiscal/fiscal-recorded-money.ts` exact content Git blob **03c33895d07c7488e2270caee730c0c169427c5a**.
  - `backend/src/modules/fiscal/fiscal-book-readiness.ts` exact content Git blob **4259f1205a375166b703056df3a91b5af7e2e963**.
  - `tests/ve_fiscal_recorded_money_v782.test.mjs` exact content Git blob **7e8cd052a5fade171093f7e37bb75dd3604cf533**, **4/4 PASS**. Covers exact-minor-unit sum, currency separation, stable digest, legacy missing facts and malformed inputs.
  - An additional focused synthetic QA suite (not committed) on the same two exact Git blobs: **6/6 PASS**, with anti-tenant, duplicate-number, hash stability, cross-currency and invalid value checks.
- TypeScript 5.8.3 `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext` over the **two exact source files**, **PASS** using a **temporary test-only `node:crypto` declaration**, because monorepo `@types/node` was unavailable locally. This is **not** the production workspace typecheck.
- PR code diff inspected via GitHub; the new read-only routes retain `fiscal.read` permission and explicit tenant filtering. No new production percentage, FX rate or writable endpoint.
- Primary decree IGTF 4.972 identified in Gazette 6.821 Ext, Article 1–3; Gazette facsimile cross-reviewed. Legal effective-date/latest-amendment GO remains withheld pending official/source review.

## Not verified / blocking

- Full `npm install` (repository uses npm workspaces), lint, typecheck, both builds; no complete local checkout possible from this sandbox due to GitHub network DNS prohibition. No claim of passing full workspace.
- PostgreSQL 17 isolated from-zero and upgrade, tenant RLS, fiscal RBAC, worker/employer accrual, idempotency/reversal and GL/ledger reconciliation on actual DB: NOT VERIFIED.
- API/Chromium/Firefox/WebKit E2E, responsive/accessibility and production provider: NOT VERIFIED.
- GitHub Actions exact final head: check statuses require query when candidate SHA stops changing. Queued/skipped jobs are not PASS.
- Source eligibility: #751, #774 and #785 remain OPEN, no reviewed tenant-legal source-to-active fiscal rule-to-posting chain. No external filing, payment or municipal ordinance approval.
- A previous source audit identified possible legacy `/fiscal/rules` creation without legal-source review binding, and missing link between commercial invoices and canonical FiscalDocumentRuleSnapshot. These are **release blockers** for activating Venezuelan tax obligations; do not treat pure previews as compliance.

## Risk and acceptance

- The additional `recordedCurrencyTotals` represents recorded **commercial invoice fields**, not tax determination, no FX conversion, and includes all statuses with explicit cancellation blockers. Never use it for payable/filing without official ledger reconciliation.
- No migration or mutable production state touched in this increment. Existing books/compliance endpoints always return `BLOCKED_NOT_CERTIFIED`/`BLOCKED_NOT_READY` respectively.
- Required closure: legally reviewed applicability and rule activation; immutable snapshot persistence; tax/payroll posting balanced Debe/Haber, bank reconciliation, controlled reverse/close/export and material QA for **each** issue. Keep all five OPEN.

## Commands for a full checkout

```sh
npm ci
npm run typecheck
npm run lint
npm run build
node --experimental-strip-types --test tests/ve_fiscal_recorded_money_v782.test.mjs
# Plus repository-authorized runner for all five ticket suites, DB17 and Playwright.
```

No bypasses, `skip`, `only`, forced merges or disabled workflows were introduced.
