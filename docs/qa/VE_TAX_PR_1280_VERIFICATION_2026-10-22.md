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

## Iteration 4 — concurrent financial lifecycle hardening

- Fiscal document issue `POST /fiscal/documents/issue` now **requires an ASCII safe Idempotency-Key**. Missing key returns 428; same key/request produces a replay without a second sequence allocation; different payload with same key conflicts by existing idempotency authority.
- Fiscal close `POST /fiscal/close-period` also **requires Idempotency-Key**, and locks the tenant+month+module `ClosingPeriod` database row `FOR UPDATE` before confirming status; two different retry keys cannot each perform a successful close. Close state, evidence SHA and audit row commit atomically (no audit created again during a successful replay).
- Reopen `POST /fiscal/reopen-period` rewritten to use the same period row lock, mandatory idempotency, transaction-scoped status validation and audit; immutable prior close evidence is not erased by reopening.
- `FiscalRuleVersion.hash` is recalculated from the canonical persisted definition/authoritative legal source whenever a new document resolves a rule; altered stored formulas are rejected with `FISCAL_RULE_VERSION_HASH_MISMATCH`.
- Fiscal issue validates date/month in exact UTC through `fiscal-effective-period-policy.ts` before selecting rules.
- Source-contract regressions in `tests/ve_fiscal_period_lifecycle_source_contract_778_782.test.mjs` verify locking, required keys, transaction-scoped audit and authoritative version-hash guard; included in root `npm run test:ve-tax`.

### Operational QA / compatibility notes

- **Behavior changes**: document issue, close and reopen now require explicit `Idempotency-Key`. UI/API callers must generate a distinct stable key for each logical user action, reuse on retry, and send a new one only for a new action. Audit consumers should not count replayed close/reopen as a second transition.
- **Executed independent local tests**: 18/18 PASS on exact-blob pure modules, with five-module strict TypeScript check in scratch sandbox, as described in Iteration 3. Root workspace suite and new source-contract tests not executed locally because GitHub checkout cannot resolve in this execution runtime.
- **Pending PG17**: true parallel close/reopen with *different keys*, same-key races, crash/replay, DB row locks, draft-versus-closed GL writes, API RBAC/CSRF, immutable `FiscalCloseEvidence`, and migration from-zero/upgrade. **Do not assert PASS** until logs on candidate SHA are captured.
- **Current ticket disposition:** #778 / #780 / #781 / #782 / #783: all **PARTIAL or BLOCKED** (see DoD gaps above). `test:ve-tax` success alone would not make any ticket DONE, because no complete tax→ledger→reversal→settlement chain exists and legal authority/profile prerequisites remain incomplete.

## QA supplemental — exact Git source-contract inspection, not DB execution

- Fetched actual HEAD source files from GitHub, blob SHAs:
  - `backend/src/modules/payroll/payroll.routes.ts`: `d0feb1e7d95afe86da3223b362b71073068785cf`.
  - `backend/src/modules/fiscal/fiscal.routes.ts`: `dc3ab05fbf9bcd191dfe9da52d96f1e41377ef5b`.
  - `backend/src/modules/fiscal/fiscal.repository.ts`: `e704dcffdc0f9339ec2e9a3595b79fdb8d99611a`.
- Ran **24/24 source-contract assertions PASS** on those exact Git blob texts using an isolated V8 script, checking transaction boundary, locks, audit inside TX, no out-of-TX receipt writes, JSON cap, mandatory fiscal idempotency, period/source digest checks.
- Verified repository Git tree contains all **10** paths referenced by root `npm run test:ve-tax` script. This checks runner wiring, **not execution of the runner**.
- **No PostgreSQL17 QA, npm workspace `typecheck` / `build` / `test:ve-tax` execution**, and no GitHub Actions pass can be claimed from these checks. Static source checks do not establish transaction behavior or compiler validity.

## Iteration 5 — fiscal period shared transaction lock, documentary provenance and source contract QA

**Code shipped on the same PR branch:**
1. `lockFiscalPeriodMutation` in `fiscal.repository.ts` uses transaction-scoped `pg_advisory_xact_lock(hashtextextended(...))`, partitioned by *tenant and UTC month*; same lock applies to reviewed document issue, manual external capture, close and reopen. It also applies to compliance state transitions before locking declarations. These four document/period workflows therefore cannot pass through a concurrent fiscal close without seeing its state change. It does **not** coordinate unrelated GL/commercial writers that do not take this lock; a full universal close gate is still required.
2. `POST /fiscal/documents/issue` creates immutable rule snapshots and its issuance audit in **the same transaction**, skipping replay audit duplication. Existing `Idempotency-Key` requirement retained.
3. Legacy `POST /fiscal/documents` now records only an **externally/manual unverified** document (status `external_unverified`, `_legalProvenance='UNVERIFIED_EXTERNAL'`). It must never masquerade as internally issued/certified; it requires an idempotency key, tenant-month period lock, closes check and same-transaction actor audit. Unique duplicate conflicts are mapped to HTTP 409. **Compatibility warning:** clients previously treating this route as certified issuance must be migrated to `/documents/issue` and supply verified ruleKeys, valid source reviews and idempotency headers; manual records remain subject to separate legal verification.
4. `buildCloseEvidence` counts `unverifiedFiscalDocuments` in the period, including any `external_unverified` or historical document lacking a related `FiscalDocumentRuleSnapshot`; `assertFiscalClosePreconditions` blocks an authoritative close with any such records. No backfill of historical evidence or false certificates.
5. Source-contract regressions were added to `tests/ve_fiscal_period_lifecycle_source_contract_778_782.test.mjs` covering shared lock, external status, atomic issue audit and fail-closed close.

**Evidence actually executed in this iteration:**
- GitHub direct `fetch_file` on feature branch returned exact blobs: `fiscal.routes.ts` **30ad359c7f23e962b3775f3250d334421e85b88f**, `fiscal.repository.ts` **b0f26f4a0ce02e9c5149f67ee5b8f8cab6e53c8d**, `fiscal-compliance-workflow.routes.ts` **16f9cbb230e6803345570691b305d48da6ff3203**. 11/11 independent JS source-contract assertions **passed** for lock placement, unverified status, external and issued audit atomicity, missing source-snapshot close blocker and compliance lock.
- In previously prepared **isolated local** Node 22.16.0 fixture, executed `node --experimental-strip-types --test tests/ve_fiscal_recorded_money_v782.test.mjs`: **4/4 PASS**. Followed by `tsc --noEmit --strict` over the two focal old money/book sources: **PASS**, using fixture-only `node:crypto` declarations. These tests **do not** run on the newly changed route/repository code.
- Current exact-head GitHub CI status and full `npm run test:ve-tax`, Prisma 6.19.3/PG17, concurrent browser/API evidence: **NOT VERIFIED**. Never represent source-contract inspection as DB or runtime integration testing.

**Legal finding**: Law of Coordination/Harmonization G.O. 6.755/2023 Art. 8 requires an ordinance; Arts. 13–14 require payment in VES and permit only BCV-defined dynamic unit of account; Art. 20 requires broken-out bases/rates/concepts; Art. 31 sets max ordinary 3% with explicitly listed exceptional industries up to 6.5%. These are ceilings, *not default rates*. Gazette facsimile on government domain was visually reviewed on PDF pages 0/2; source/citation in architecture legal report.

**Unresolved release blockers**: #751 legal signed source/activated formula and versioned authoritative taxpayer profile #774; regulated cross-document tax snapshot and all source-to-GL/reversal/payment flows #778/#780/#781; fiscal-books export/tax subledger and immutable close validation #782; expiry/calendar/official filing and bank-live reconciliation #783; isolation DB from-zero/upgrade, transaction-race tests, full build/lint/CI. **PR must remain draft; tickets open.**

## Iteration 6 — frontend/backend integrated diagnostics and idempotent client (22 October 2026)

**New functional closure and defects corrected**
- Discovered true **UI/API regression** introduced by mandatory fiscal idempotency: `frontend/src/services/backendApi.js` auto-assigned request keys to accounting/banking but NOT to fiscal close/reopen/document issue/external capture/compliance transitions. Updated financial HTTP policy so these mutations receive a secure generated key that remains stable for the built-in network retry and authentication refresh replay. No disabled CSRF or permissions.
- `frontend/src/services/fiscalService.js` exposes the existing backend legal-source, legal review, fiscal rule, verified issue, books, compliance/readiness, external transition and close-evidence endpoints through the shared authenticated client. Methods are a service API, not proof of full forms or effective tax posting.
- `frontend/src/pages/TaxesPage.jsx` now shows external/manual fiscal records as **EXTERNO · SIN VERIFICAR** with a warning chip, never as automatically approved `issued` documents; success text was corrected.
- Added a **real read-only compliance workspace** keyed by fiscal month; it retrieves tenant-scoped existing TaxDeclaration states and recorded TaxPeriod debit/credit/IGTF balances, displays the declarations, warnings and verifiable current blockers. It explicitly states `NO APTO PARA DECLARAR O PAGAR`, `SIN VERIFICACIÓN OFICIAL`, `NO CERTIFICADA` until legal source/reconciliation is authoritative.
- Tests: `tests/ve_fiscal_frontend_contract_778_782_783.test.mjs` registered under `npm run test:ve-tax`. This is a source regression contract to supplement, not replace, browser + PostgreSQL integration.
- Updated architecture law report from the G.O. 6.755 facsimile, arts. 8/13/14/20/31, distinguishing 3% ordinary maximum and express 6.5% exceptional upper limit: neither is an applicable seeded municipal rate.

**Executed evidence, carefully scoped:**
- Fetched **exact current Git blob** contents of frontend `backendApi.js` (62000648c0c4ecda8a39a7d91b1cc058d4a2a45d), `fiscalService.js` (179551ed0667a916203237c504a38f52414ec5bf), `TaxesPage.jsx` (0db750390928f093344981ffefcdc02aa992e6ec) and fiscal backend route/repository; **15/15 direct cross-file source assertions PASS** for financial key wiring, UI compliance disclosure, manual status, 4 shared period locks, document issue audit, and the unverified close blocker.
- GitHub tree of the then-current candidate `a76efecad801d8b6e55c7d34b61620664676e9d0` lists **all 11** test paths referenced in `npm run test:ve-tax` (11/11 file path availability).
- The earlier **4/4 Node22 money tests** and **strict TypeScript check** on two scratch pure modules passed this turn; tests of newly changed React UI and complete Prisma integration **have not run**. The direct source assertions are static, NOT a successful browser E2E.
- **Limitations:** no available full workspace checkout/npm install, PostgreSQL17 Docker engine/browser provider run. Full `npm run test:ve-tax`, lint, typecheck, front/back build, API contract, RLS and migration upgrade still have no executed green logs on final HEAD.
- Frontend/API breaking contract: `POST /fiscal/documents` now marks **manual** documents `external_unverified` and requires idempotency. Existing consumers must not assume they have legally issued a new fiscal document; use separately reviewed `/fiscal/documents/issue` after legally verified rule/provenance workflow.

**Remaining DoD:** full legal source bytes verification and taxpayer profile state, approved rate and locale applicability, payment-derived IGTF, municipal receipts with ordinance/BCV currency, payroll FAOV/IVSS/INCES posting, certified books with GL and tax-subledger reconciliation, stateful calendar/filing authority and transaction races, browser/PG17. **Keep all #778 #780 #781 #782 #783 OPEN, PR Draft until release gates genuinely pass**.
