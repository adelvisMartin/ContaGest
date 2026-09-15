# Control Hípico Behavior-Preserving Refactor Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the complete Control Hípico subsystem in reviewable waves while preserving every supported public behavior, contract, security boundary and persistence semantic.

**Architecture:** The campaign proceeds from behavior characterization to progressively deeper internal decomposition. Public modules remain compatibility facades where needed, the canonical backend remains the only business-logic authority, serverless/WhatsApp/PWA layers remain adapters, and each wave starts from the then-current `main` after the previous wave is merged or explicitly abandoned.

**Tech Stack:** Node.js 22.x, TypeScript 5.9, Express 5, Prisma 6/PostgreSQL, Supabase SQL, vanilla ESM/Vite PWA, Playwright 1.63, Node test runner/tsx, Android wrapper parity tooling.

**Spec:** `docs/superpowers/specs/2026-09-15-control-hipico-behavior-preserving-refactor-design.md`

## Global Constraints

- No public function rename.
- No essential public input/output rename.
- Preserve exact route paths, HTTP methods, public status codes, cache headers, authentication expectations and response shapes.
- Preserve automation/outbox/race/document/provider/SOURCE/LAB state-machine semantics.
- No persistence drift: existing tables, columns, constraints, idempotency semantics, ownership scopes and RLS assumptions remain unchanged during ordinary refactor work.
- Historical Supabase SQL and already-created Prisma migrations are immutable.
- No security relaxation, SOURCE write expansion, LAB/SOURCE mixing, secret exposure or financial-authority expansion.
- No React/MUI/framework rewrite.
- No hidden removal of compatibility adapters.
- No test weakening or workflow weakening to obtain green status.
- GitHub `steps=[]`/`runner_id=0`, Vercel rate-limit or equivalent platform non-execution is `BLOCKED_INFRASTRUCTURE`, never PASS.
- Each wave must tie verification evidence to its exact final SHA.

---

## Campaign decomposition

This master plan intentionally delegates implementation detail to one plan per wave. Do not execute multiple waves in one PR unless the repository owner explicitly approves a smaller/larger boundary after seeing the diff.

### Task 0: Wave 0 — Behavior Freeze

**Plan:** `docs/superpowers/plans/2026-09-15-control-hipico-wave0-behavior-freeze.md`

**Produces:**
- checked-in inventory of public Hípico contracts;
- characterization tests for uncovered behavior;
- migration immutability baseline;
- exact commands for later wave equivalence checks;
- no production/runtime code changes.

- [ ] Execute the Wave 0 plan completely.
- [ ] Review exact-SHA evidence and merge only if its gates are verified or the owner explicitly overrides a documented infrastructure blocker.

### Task 1: Wave 1 — Internal primitives and duplication removal

**Plan to create after Wave 0 merge:** `docs/superpowers/plans/2026-09-15-control-hipico-wave1-internal-primitives.md`

**Target files:** repeated validation/security/normalization helpers inside `backend/src/modules/hipico/` and `backend/src/modules/hipico-bot/`.

**Produces:** narrowly named internal helpers for repeated UUID/group/idempotency/no-store/safe-JSON/timestamp behavior while preserving all public facades.

- [ ] Re-read the Wave 0 behavior manifest and choose only duplicated implementations whose current semantics are proven identical.
- [ ] Write focused characterization tests for each helper candidate before extraction.
- [ ] Extract one concept at a time; preserve public imports/exports and error codes.
- [ ] Run the Wave 0 contract suite plus Hípico backend tests after each extraction group.
- [ ] Commit in small reviewable units and open a separate Wave 1 PR.

### Task 2: Wave 2 — Canonical backend decomposition

**Plan to create after Wave 1 merge:** `docs/superpowers/plans/2026-09-15-control-hipico-wave2-canonical-backend.md`

**Primary files:**
- `backend/src/modules/hipico/automation.store.ts`
- `backend/src/modules/hipico/agent-policy.ts`
- `backend/src/modules/hipico/agent-engine.ts`
- `backend/src/modules/hipico/agent.routes.ts`
- `backend/src/modules/hipico/command-center.service.ts`
- `backend/src/modules/hipico/command-center.routes.ts`
- provider/document/race lifecycle modules touched by characterization evidence.

**Produces:** focused domain/application/store/router modules behind unchanged public facades.

- [ ] Characterize public methods and transaction/idempotency behavior before each split.
- [ ] Extract domain policy without importing Express/provider HTTP infrastructure inward.
- [ ] Extract persistence/read-model operations while preserving query ordering and transaction boundaries.
- [ ] Keep `AutomationStore`, Agent public exports and Command Center externally observable codes compatible.
- [ ] Run PostgreSQL integration tests for every touched transactional path.

### Task 3: Wave 3 — WhatsApp/Bridge adapter decomposition

**Plan to create after Wave 2 merge:** `docs/superpowers/plans/2026-09-15-control-hipico-wave3-whatsapp-bridge.md`

**Primary files:**
- `backend/src/modules/hipico-bot/hipico-bot.service.ts`
- `backend/src/modules/hipico-bot/hipico-bridge.routes.ts`
- webhook/operator/outbox/receipt/document bridge modules.

**Produces:** parser/orchestrator/store/security/transport units with existing public route and function contracts preserved.

- [ ] Freeze `classify`, `processIncoming`, `sendCloudText`, webhook replay, Bridge identity/security and outbox error behavior.
- [ ] Extract pure parsing/policy helpers first.
- [ ] Extract transport/persistence orchestration second without changing side-effect order.
- [ ] Keep webhook signature verification, replay/idempotency, lease ownership and `reconciliation_required` semantics identical.
- [ ] Verify provider calls and duplicate handling with deterministic fixtures and PostgreSQL tests.

### Task 4: Wave 4 — Serverless adapter simplification

**Plan to create after Wave 3 merge:** `docs/superpowers/plans/2026-09-15-control-hipico-wave4-serverless-adapters.md`

**Primary files:**
- `frontend/api/hipico/_shared.js`
- `frontend/api/hipico/group-bridge-ingest.js`
- `frontend/api/hipico/whatsapp-send.js`
- `frontend/api/hipico/whatsapp-webhook.js`
- `frontend/api/hipico/canonical-backend.js`
- `frontend/api/hipico/command-center.js`
- `frontend/api/hipico/status.js`

**Produces:** thinner adapters delegating to canonical backend/shared adapter helpers without browser secret leakage or endpoint drift.

- [ ] Freeze every Vercel endpoint method/status/body/error/fallback contract.
- [ ] Consolidate only duplicated adapter mechanics; do not move domain policy into serverless.
- [ ] Preserve exact timeout and fallback behavior where observable.
- [ ] Run source contracts and Vercel-compatible tests against exact final SHA.

### Task 5: Wave 5 — PWA, Command Center and Android parity

**Plan to create after Wave 4 merge:** `docs/superpowers/plans/2026-09-15-control-hipico-wave5-pwa-command-center.md`

**Primary files:** `frontend/public/hipico-control/`, Hípico browser QA, service worker and Android sync/parity tooling.

**Produces:** focused view/state helpers with unchanged visual, accessibility, offline/stale and Android-visible behavior.

- [ ] Characterize all explicit Command Center states and responsive sizes before edits.
- [ ] Refactor rendering/state helpers behind the same DOM/ARIA and user-visible state contracts.
- [ ] Preserve no-store live API behavior and service-worker exclusions.
- [ ] Preserve 44px critical targets, keyboard/focus/reduced-motion and natural vertical scroll behavior.
- [ ] Verify Android/PWA file/hash/protocol parity.

### Task 6: Wave 6 — Test/fixture/tooling consolidation

**Plan to create after Wave 5 merge:** `docs/superpowers/plans/2026-09-15-control-hipico-wave6-test-tooling.md`

**Produces:** reusable fixture/build/test helpers while preserving or strengthening all assertions and golden corpus reproducibility.

- [ ] Inventory duplicated setup/fixture code by test family.
- [ ] Characterize helper semantics with tests before replacing copies.
- [ ] Consolidate PostgreSQL, Playwright, security and exact-SHA helpers one family at a time.
- [ ] Compare test discovery/count and assertion intent before/after helper migration.

### Task 7: Wave 7 — Final cross-boundary cleanup

**Plan to create after Wave 6 merge:** `docs/superpowers/plans/2026-09-15-control-hipico-wave7-final-cleanup.md`

**Produces:** final architecture cleanup, documentation alignment and removal only of internal compatibility shims proven unused.

- [ ] Use repository search and runtime contract evidence to prove each internal shim is unused before removal.
- [ ] Keep all supported public exports/routes/adapters.
- [ ] Update Hípico architecture docs to match final module boundaries.
- [ ] Run the complete Hípico release/evidence matrix on one exact candidate SHA.
- [ ] Produce a final before/after report covering behavior equivalence, file responsibilities, test evidence and any intentionally retained legacy adapters.

## Campaign completion criteria

The campaign is complete only when all seven implementation waves are merged or explicitly abandoned with rationale, every surviving public contract from Wave 0 still passes, no historical migration changed, no unsupported authority was introduced, and the final exact-SHA Hípico release evidence is classified without fabricated green status.
