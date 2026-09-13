# Hípico #305 Exact Reverification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Every PASS claim must be bound to the exact candidate SHA.

**Goal:** Convert the current PR #312 candidate from historical/inspection evidence into fresh executable evidence, fix only reproduced regressions, and leave all externally blocked release prerequisites explicitly blocked rather than simulated.

**Architecture:** Keep `fix/hipico-305-preqa-release-regression` as the isolated delivery branch. Use Vercel Git preview as the executable Linux checkout while GitHub-hosted runners remain unavailable; Vercel’s frontend build already runs install, `preqa:source`, backend Hípico typecheck/tests, browser pre-QA, backend staging and Vite build. Any reproduced code defect follows RED → GREEN → regression verification before the next gate. GitHub Actions, Android, physical QA, soak, governance and legal evidence remain separate gates and are never inferred from a Vercel build.

**Tech Stack:** Node.js 22.x, npm workspaces, TypeScript 5.9, Node test runner/tsx, Prisma 6, Vite 8, Playwright 1.62, Vercel Preview, GitHub Actions, Android wrapper.

**Spec:** GitHub issue #305 and repository `AGENTS.md` at the candidate SHA.

## Global Constraints

- Work only on `fix/hipico-305-preqa-release-regression`; never modify `main` directly.
- Preserve SOURCE as `READ_ONLY`; LAB remains the only writable QA destination.
- Do not weaken gates with skip/only/fixme/force/`continue-on-error`/`|| true` or arbitrary waits.
- Do not merge, production-deploy, migrate or sign artifacts without explicit owner authorization in the same turn.
- A gate is PASS only when its command actually executes successfully on the exact candidate SHA.
- `#119` physical QA, `#120` soak >=24h, `#97` governance and `#29` legal review cannot be synthesized from source tests.
- For Hípico outbound automation, ambiguous delivery remains fail-closed/reconciliation-required and monetary effects remain approval-gated.

---

### Task 1: Establish executable candidate and dependency-install evidence

**Files:**
- Create: `docs/superpowers/plans/2026-09-13-hipico-305-exact-reverification.md`
- Inspect: `package.json`
- Inspect: `frontend/package.json`
- Inspect: `backend/package.json`

**Interfaces:**
- Consumes: PR #312 head SHA and Vercel Git integration.
- Produces: a new candidate SHA whose preview logs prove checkout/install/build execution.

- [ ] **Step 1:** Push this plan commit to `fix/hipico-305-preqa-release-regression`; this intentionally triggers Git preview without changing runtime behavior.
- [ ] **Step 2:** Locate the Vercel deployment whose `githubCommitSha` exactly equals the new PR head SHA.
- [ ] **Step 3:** Read the deployment log from the beginning and confirm dependency installation executed. Record install command/result and Node/npm versions when emitted.
- [ ] **Step 4:** If install fails, classify the exact package/postinstall/root cause before any source change. If install passes, continue to Task 2.

### Task 2: Reproduce `preqa:source` and classify every failure

**Files:**
- Inspect: `frontend/package.json`
- Inspect: `scripts/hipico-root-contracts.mjs`
- Inspect only the exact source/test files named by failing TAP output.

**Interfaces:**
- Consumes: exact preview from Task 1.
- Produces: zero or more findings, each tagged `STALE_CONTRACT`, `CODE_REGRESSION`, `ENVIRONMENT`, or `EXTERNAL_PROVIDER` with expected/actual/root cause.

- [ ] **Step 1:** Capture complete `preqa:source` TAP summary and every failing test name/stack/file/line.
- [ ] **Step 2:** For each failure, compare ticket contract → executed source → current config/docs → test assertion, in that order.
- [ ] **Step 3:** Do not edit production code until a failing deterministic regression test exists or the failing gate itself is the characterization test.
- [ ] **Step 4:** For a stale test contract, change only the assertion/fixture required by the demonstrated current invariant. For a code regression, implement the smallest source fix that restores the invariant.
- [ ] **Step 5:** Each source change gets a focused commit and triggers a fresh exact-SHA preview. Repeat until `preqa:source` exits 0.

### Task 3: Verify backend Hípico typecheck and tests

**Files:**
- Inspect/fix only exact files named by `npm --workspace backend run typecheck` or `npm --workspace backend run test:hipico` failures.
- Primary Hípico surface: `backend/src/modules/hipico-bot/`.

**Interfaces:**
- Consumes: candidate with green source contracts.
- Produces: TypeScript and Hípico test evidence from the same SHA.

- [ ] **Step 1:** Confirm Vercel executes `npm --workspace backend run typecheck` and record exit 0/diagnostics.
- [ ] **Step 2:** Confirm Vercel executes `npm --workspace backend run test:hipico` and record test/pass/fail counts.
- [ ] **Step 3:** For each new defect, apply RED → GREEN using the existing nearest `*.test.ts`; never delete or skip a failing security/durability test.
- [ ] **Step 4:** Re-run through a fresh preview after each fix until both commands exit 0 on one candidate SHA.

### Task 4: Verify browser pre-QA and frontend build

**Files:**
- Inspect: `scripts/vercel-browser-preqa-v16.mjs`
- Inspect/fix only exact Hípico frontend/runtime files named by browser/build failures.
- Primary surface: `frontend/public/hipico-control/`, `frontend/api/hipico/`, `frontend/vercel.json`, root `vercel.json`.

**Interfaces:**
- Consumes: same candidate from Task 3.
- Produces: browser-preQA and Vite-build evidence.

- [ ] **Step 1:** Confirm `npm run preqa:browser` executes rather than being skipped by environment policy; record its explicit PASS/BLOCKED result.
- [ ] **Step 2:** Confirm `npm run stage:backend` exits 0.
- [ ] **Step 3:** Confirm `vite build` exits 0 and record build artifact summary/warnings.
- [ ] **Step 4:** If browser pre-QA is intentionally environment-gated on Vercel, keep full Chromium functional/58-route gates as NOT_EXECUTED rather than promoting the build to browser PASS.

### Task 5: Re-attempt GitHub Actions and Android gates without weakening workflows

**Files:**
- Inspect only: `.github/workflows/` workflows associated with PR #312.
- Do not modify workflow runner labels unless a repository-supported runner is proven available and the change preserves coverage.

**Interfaces:**
- Consumes: final candidate SHA after Tasks 1–4.
- Produces: real Actions/Android evidence or named infrastructure blocker.

- [ ] **Step 1:** Re-run one failed `ContaGest CI` workflow for the final SHA.
- [ ] **Step 2:** If the job again has `steps=null`/no logs, classify GitHub-hosted runner execution as BLOCKED and do not rewrite workflows merely to hide the platform failure.
- [ ] **Step 3:** If steps execute, let `npm ci`, typecheck/tests/build run and inspect every failure before changing source.
- [ ] **Step 4:** Re-run `Control Hipico Android RC` only if runner execution works; record Gradle/wrapper/APK result and artifact hash if produced.

### Task 6: Security, UX/UI, regression and release evidence pass

**Files:**
- Inspect changed files from PR #312.
- Inspect: `AGENTS.md`
- Inspect: `.agents/skills/contagest-appsec-review/SKILL.md`
- Inspect: `.agents/skills/contagest-secure-verification/SKILL.md`
- Update: PR #312 body with final exact-SHA evidence.

**Interfaces:**
- Consumes: final tested candidate and PR diff.
- Produces: release-evidence matrix and residual-risk record.

- [ ] **Step 1:** Review changed Hípico files for secret exposure, authorization bypass, injection/XSS, unrestricted destinations, missing bounds/timeouts, cross-group/cross-tenant leakage, replay/idempotency regression, and irreversible automation.
- [ ] **Step 2:** Review Hípico UI changes for 44px touch targets where required, accessible names/focus, responsive overflow, light/dark behavior, safe loading/empty/error states and PWA/cache versioning.
- [ ] **Step 3:** Run/inspect all executable gates available on the candidate and use only PASS/FAIL/BLOCKED/NOT_EXECUTED.
- [ ] **Step 4:** Update PR #312 with final head SHA, install evidence, exact test/build results, rollback strategy and named residual external blockers.
- [ ] **Step 5:** Leave PR unmerged unless the owner explicitly authorizes merge after reviewing the evidence.
