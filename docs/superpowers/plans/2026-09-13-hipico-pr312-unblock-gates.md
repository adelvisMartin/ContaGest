# Control Hípico PR #312 Gate Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every technically executable PR #312 gate from BLOCKED/NOT_EXECUTED into real exact-SHA evidence without weakening fail-closed security, tenant isolation, financial invariants, or release policy.

**Architecture:** Keep GitHub Actions as the canonical CI definition, but use the already-connected Vercel preview build as an independent executable fallback while GitHub-hosted jobs fail before checkout. Browser QA stays real Chromium/Playwright; source/typecheck/backend/build remain in the canonical frontend build chain. External/legal/physical requirements remain explicit external gates rather than being fabricated as software PASS.

**Tech Stack:** Node.js 22, npm workspaces, TypeScript, Node test runner, Playwright Chromium, @sparticuz/chromium, Vite, PostgreSQL integration scripts, Android wrapper/Gradle, GitHub Actions, Vercel preview builds.

**Spec:** `AGENTS.md`, issue #305, PR #312.

## Global Constraints

- Work only on `fix/hipico-305-preqa-release-regression`; never merge or deploy production without same-turn owner authorization.
- A PASS requires execution on the exact candidate SHA.
- Preserve SOURCE read-only, explicit race date/track/number identity, operator-token authority, monetary fail-closed behavior, outbox idempotency/reconciliation, RLS/tenant isolation and release exact-SHA binding.
- Do not bypass, skip, `continue-on-error`, `fixme`, `only`, arbitrary sleep, or downgrade any required gate.
- Node runtime remains the repository-declared `22.x` unless the repository contract changes deliberately.

---

### Task 1: Reproduce and stabilize Chromium PR QA

**Files:**
- Modify: `tests/hipico_vercel_browser_gate_305.test.mjs`
- Modify: `qa/mobile-navigation-v163.spec.mjs`
- Modify: `scripts/vercel-browser-preqa-v16.mjs`

**Interfaces:**
- Consumes: `MODULE_VISUAL_CATALOG`, Playwright Chromium project, Vercel PR environment.
- Produces: bounded sidebar route batches that still cover every discovered/declared sidebar route and fail if any route is missing or broken.

- [ ] Add a source contract that fails while mobile sidebar navigation is one monolithic 58-route browser test and requires deterministic route batching.
- [ ] Execute the source contract in Vercel and capture the expected RED failure on its exact SHA.
- [ ] Refactor the Playwright spec to expose deterministic sidebar route batches and one test per batch while retaining per-route URL/rendered-route/drawer assertions.
- [ ] Update the Vercel browser runner to invoke all batches independently so a Chromium process is recycled between bounded groups.
- [ ] Re-run source + Chromium gates and require every batch PASS on the exact SHA.

### Task 2: Revalidate source, TypeScript, backend and 2000-case invariants

**Files:**
- No production changes unless an executed failure identifies a root cause.

**Interfaces:**
- Consumes: `frontend/package.json` canonical build chain.
- Produces: exact-SHA logs for dependency install, source contracts, backend `tsc --noEmit`, `test:hipico`, deterministic 2000-case property/concurrency checks, static visual/function/control gates and Vite build.

- [ ] Confirm Vercel installs dependencies without lifecycle bypasses that weaken required tests.
- [ ] Run `npm run build` through the Vercel preview on the exact candidate.
- [ ] Record exact counts and failures; for any failure, return to systematic debugging Phase 1 before editing.
- [ ] Do not advance until source/typecheck/backend/static/build are green on the same SHA.

### Task 3: PostgreSQL real integration fallback

**Files:**
- Inspect/modify only if evidence requires: root `package.json`, PostgreSQL test scripts, `.github/workflows/*hipico*`, `scripts/vercel-browser-preqa-v16.mjs`.

**Interfaces:**
- Consumes: repository PostgreSQL real-test command and a non-production disposable database URL.
- Produces: real DB schema/bootstrap + integration result bound to candidate SHA.

- [ ] Inspect the canonical PostgreSQL test command and its required environment/secrets.
- [ ] If a disposable DB credential is already available to the preview environment, run the existing real integration command unchanged and record evidence.
- [ ] If no disposable DB exists, keep this gate BLOCKED_EXTERNAL_INFRA rather than substituting SQLite/PGlite/mocks.
- [ ] Never point tests at production or create destructive migrations without owner authorization.

### Task 4: Android wrapper and parity

**Files:**
- Inspect: `android/hipico-control-v1130/**`, Android CI workflow, parity scripts.
- Modify only when an executed contract fails.

**Interfaces:**
- Consumes: canonical PWA assets/version `1.13.0-rc3` and Android sync/parity scripts.
- Produces: source parity evidence; APK build evidence only if an Android-capable runner actually executes it.

- [ ] Run source-level Android parity contracts in the exact-SHA build chain.
- [ ] Attempt the canonical Android build only on an environment with Java/Android SDK.
- [ ] Do not call Android PASS from source parity alone; if runner infrastructure remains unavailable, report APK as BLOCKED_EXTERNAL_RUNNER.

### Task 5: Accessibility/security/runtime regression passes

**Files:**
- Existing QA/source/browser/security files only as failures identify owners.

**Interfaces:**
- Consumes: Chromium gate, source contracts, Vercel headers/runtime output.
- Produces: real responsive/interaction/security evidence for the candidate.

- [ ] Execute mobile 360/390/430, route navigation, control click-smoke and accessibility-sensitive browser groups.
- [ ] Verify Hípico CSP/no-referrer/Permissions-Policy/CORP and runtime metadata headers on the deployed preview.
- [ ] Review runtime/serverless logs for high/critical errors caused by the candidate.
- [ ] Fix only reproducible defects with test-first changes.

### Task 6: Evidence, PR update and residual external gates

**Files:**
- Modify: PR #312 body/comment only after exact-SHA execution completes.

**Interfaces:**
- Consumes: final candidate SHA, Vercel deployment ID/logs, GitHub workflow job evidence.
- Produces: auditable closure matrix with PASS/FAIL/BLOCKED/NOT_EXECUTED only.

- [ ] Re-fetch PR HEAD and ensure evidence SHA equals current HEAD.
- [ ] Re-fetch GitHub workflow jobs; distinguish runner-precheckout failures from code failures.
- [ ] Update PR evidence with exact commands/counts/deployment IDs and no stale SHA claims.
- [ ] Keep #119 physical QA, #120 >=24h soak, #97 branch protection and #29 legal review open until their required real-world evidence exists.
- [ ] Do not merge the PR.
