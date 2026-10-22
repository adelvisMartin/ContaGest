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


## Iteration 2 — source authority, live GL links, compliance transition and payroll net hardening

### Implemented in this exact PR branch

1. **#751 prerequisite + #778/#780/#781:** new `fiscal-rule-authority-policy.ts`. `POST /fiscal/rules` accepts `legalSourceId` instead of caller-provided `source`. Within a transaction `createFiscalRuleVersion` requires a same-tenant `REVIEWED` source, independently reviewed. It embeds legal-source UUID/hash/reference/reviewer/time in the version definition; `resolveFiscalRules` rechecks source membership and rejects unproven historical rule versions on future document issues. No automatic rule seed or rate activated.
2. **#782:** `fiscal-ledger-coverage.ts`, extended `fiscal-book-readiness.ts` and related Prisma read route. Sales/purchases read the **actual existing ledger entries and lines**, with nested fan-out cap, tenant-isolated GL and reversal link verification. Exact VES/USD balances are kept separate with `BigInt`, unposted/imbalanced/reversed/wrong-period/unlinked GL adds blockers and changes evidence SHA. No book is certified without fiscal provenance.
3. **#783:** new `fiscal-compliance-workflow-policy.ts` and `fiscal-compliance-workflow.routes.ts`, mounted before read-only diagnostics to prevent accidental double RBAC. Authenticated `fiscal.close` + `Idempotency-Key` on **POST** `/fiscal/compliance/declarations/:id/transition`; `fiscal.read` on **GET** readiness. States: `draft → reviewed → filed_externally → paid → reconciled`, respectively actions `REVIEW`, `RECORD_EXTERNAL_FILING`, `LINK_BANK_PAYMENT`, `CONFIRM_RECONCILIATION`. Audit and transition in one transaction. Source review, immutable server-derived money, tenant/period locking, receipt reference and bank movement duplication, existing matched VES bank movement linked to posted balanced unreversed GL and tenant-mapped semantic `tax_payable`/`bank` accounts enforced. Each replay retains stored response; no public filing integration exists. Filing is a **user-attested external record**, not SENIAT-verifiable proof. Readiness only projects operator-recorded flags, still `safeToFileOrPay: false`.
4. **#781:** `payroll-receipt-arithmetic.ts` integrated with existing receipt creation, exact-decimal `gross = deductions + net`. Employer contributions do not subtract from worker net. No speculative FAOV/IVSS/INCES rates or double payroll engine.

### Executed local QA (22 October 2026)

Environment: Node **22.16.0**, TypeScript **5.8.3**. **Network isolation:** no clone, workspace install, PostgreSQL binary or running server; never claim monorepo E2E or DB17 pass.

- Verified Git blob **`f334b363`** of `fiscal-rule-authority-policy.ts` before regression, found a REAL `tsc --strict` narrowing error. Fixed and published corrected Git blob **`41fa1f31165d843f1d180f940824066b363d50c2`**, byte-identical to tested sandbox file.
- Verified Git blob **`116330c1f8a395e664c819f0d3dee50d87028ff0`** of `fiscal-compliance-workflow-policy.ts`.
- **7/7 PASS** locally in isolated Node (4 provenance security + 3 manual filing/payment transition tests), after reproducing exact source blobs.
- Verified Git blob **`03c33895d07c7488e2270caee730c0c169427c5a`** of `fiscal-recorded-money.ts` and **`63608235b845446365a7598edae9e49fd3960328`** of `fiscal-ledger-coverage.ts`.
- **7/7 PASS** locally in isolated Node (exact balanced GL, hash independent from line order, cross-tenant, duplicate, wrong period/unposted/reverse, multi-currency and invalid amount).
- **`tsc --noEmit --strict` PASS on four exact new source policy/ledger files**, with small **test-only** declarations of missing `Buffer` and `node:crypto`; this is not workspace typecheck.
- Review uncovered and fixed accidental middleware collision: compliance writes are no longer forced through the read permission and GET never passes through write permission.
- GitHub tests added for source authority, GL book and compliance workflow; their exact repository runner result must be checked per candidate SHA. Committed tests should **not** be reported as passing in full monorepo until executed there.

### Remaining DoD gaps — DO NOT MERGE ON THIS EVIDENCE

- Full repo `npm ci`, typecheck, lint, builds, API integration, PG17 from-zero/upgrade/RLS/tenant A/B, browser coverage: **NOT EXECUTED** in this environment.
- `FiscalLegalSource` still captures operator-supplied **hash/metadata without verifying original source bytes against signed official document**; independent review does not guarantee legal rate correctness.
- Taxpayer profile #774 still DRAFT; no safe canonical tenant applicability to tax events. **No actual automatic IGTF or municipal assessment/retention/payment accounting**; #778/#780 previews remain non-posting and cannot yet satisfy DoD.
- Parafiscal FAOV/IVSS/INCES employer+worker posting/accrual, contribution caps, actual payroll derived rule snapshots and bank settlements missing; arithmetic guard alone is not #781 completion.
- Fiscal books lack verified commercial-to-FiscalDocumentRuleSnapshot FK and legally classified multi-aliquot lines/notes/corrections, frozen certified close/export and tax-subledger reconciliation; #782 remains BLOCKED despite actual GL evidence.
- Compliance remains partially integrated: manual receipt hash is not a stored verified document, external authority filing status is unverified; no comprehensive calendar/due date/outbox, no continuous read-time revalidation of bank/GL after reversal. #783 remains PARTIAL.
- Upstream #751/#774/#785 and reconciliation #643 need end-to-end acceptance. No changes to workflow gates, no forced merge, no ticket closed.

### Manual workflow contract (requires reviewed tenant source and posted matched VES bank GL)

```text
POST /fiscal/compliance/declarations/:id/transition
Authorization: active tenant/session + fiscal.close
Idempotency-Key: unique ASCII key >=8 characters
Body #1: {"action":"REVIEW","legalSourceId":"<reviewed-source-uuid>","reason":"Reviewed manual declaration against retained legal source"}
Body #2: {"action":"RECORD_EXTERNAL_FILING","authority":"SENIAT","receiptReference":"<actual-external-reference>","receiptSha256":"<64-hex>","filedAt":"2026-10-22T12:00:00.000Z"}
Body #3: {"action":"LINK_BANK_PAYMENT","bankMovementId":"<matched-bank-movement-uuid>"}
Body #4: {"action":"CONFIRM_RECONCILIATION"}
```

Each step is a new idempotent request after the preceding committed state. The source, receipt, GL and bank movement references in this example are **placeholders**, not actual filings or proof that taxes were paid.


## Iteration 3 — real QA and rule/payroll/GL controls (22 October 2026)

**Implementation in this iteration:**
- #782 fixed **GL evidence substitution**: balancing alone did not detect posting to a different account. `fiscal-ledger-coverage.ts` now computes stable `ledgerLinesSha256` from sorted, normalized **account code + currency + debit/credit**; `sourceEvidenceHash` changes if account distribution changes, even when aggregate still balances. A swapped-line order does not change digest. Two regressions added.
- #783 strengthened bank matching: `TaxDeclaration` payment transition obtains DB row-level locks on both existing tenant bank movement and linked ledger entry, then checks live `matched`, VES currency, exact amount, same fiscal period, unreversed status, `exchangeRate=1`, exactly **two** lines (Debit `tax_payable`, Credit `bank`) from tenant-specific semantic account mappings. Balanced but extraneous lines are rejected, and corrected/reversed banking audit links remain blocked. No bank balance or journal is auto-created.
- #781 rewrote canonical receipt create/approve/delete to use `prisma.$transaction` + tenant-owned `PayrollPeriod FOR UPDATE`, with audited mutation and recalc in the **same transaction**. Concurrent duplicate employee receipts are checked *after* lock; mismatched `periodId/period` is rejected; status and deletes lock same period. Removed route request-context and monetary serialization `any`; strict Zod receipt payload and 32KiB details cap.
- Fiscal rule defense: reverify the stored **canonical `FiscalRuleVersion.hash`** on every `resolveFiscalRules` before issuing new documents; changes to the tax formula cannot pass merely because legal-source references match. Fiscal document issuance requires `effectiveAt` UTC calendar month to match `period` exactly (new pure policy).
- Reproducible QA command added to root `package.json`: `npm run test:ve-tax` (nine test files, using installed `tsx` from backend workspace). This runner was **registered but NOT executed** against a full repository checkout in this session; do not conflate it with local isolated runs.
- Legal authority updated with Aug-2026 SENIAT SNAT/2026/00084 repeal and Sept-2026 social contribution secondary analysis. No new percentages/rates inserted.

**Executed local tests (real, narrow):**
- Node.js 22.16.0 `node --experimental-strip-types --test test.mjs ledger-test.mjs period-test.mjs` in a *standalone scratch fixture* containing reviewed source modules: **18/18 PASS**. These include ledger account-substitution and UTC effective-date boundaries.
- Confirmed exact Git blob SHA match `fiscal-ledger-coverage.ts` **`4939bbee3b09c0cff87a0d83f2ccaf90cabe1435`** and `fiscal-effective-period-policy.ts` **`be6b20ec82dc2a9878ee6523b960534e3eeb3b99`** against the local modules; `fiscal-recorded-money.ts` stays at exact blob **`03c33895d07c7488e2270caee730c0c169427c5a`**.
- `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext` on **five pure policy/ledger modules**, using temporary `node:crypto` and `Buffer` declarations because the sandbox lacks the workspace dependencies: **PASS**. **Not equivalent** to the full backend typecheck or build.
- New **source-contract** guard `tests/ve_payroll_atomicity_source_contract_781.test.mjs` not executed in the isolated fixture (it requires the actual source route file); scheduled for the registered repo QA script.
- Local shell cannot resolve github.com; no full Git checkout, npm workspace install, PostgreSQL binary, driver or Chromium available. CI exact final HEAD is a separate evidence gate.

**Required follow-up:** test actual PostgreSQL17 concurrency under two tenants, all workflow transitions with RBAC/revocation, actual double-entry/reversal/linking, 2026 legal rules and employer-worker contributions, distributed close/read race, fiscal-book certified exports and bank ledger reconciliation, full lint/typecheck/build and UI. The PR must stay **DRAFT** and issues **OPEN** until those are met. This is not a production release sign-off.
