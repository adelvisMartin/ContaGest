# Control Hípico Core Refactor v8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Hípico control-plane code from implementations 1–7 into focused modules while preserving public APIs, route contracts, state transitions, safety gates, persistence semantics and error codes.

**Architecture:** Keep existing public files as facades/entry points and move internal responsibilities into smaller modules. Preserve transaction boundaries and database SQL semantics. Add characterization plus structural tests before extraction, then move code mechanically behind unchanged exports.

**Tech Stack:** Node.js 22, TypeScript 5.9, Express 5, Zod, Prisma raw SQL/PostgreSQL 16, Node test runner via `tsx --test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-hipico-core-refactor-v8-design.md`

## Global Constraints

- Do not remove any existing functionality.
- Do not rename existing public functions/classes/constants.
- Do not change essential public input/output fields.
- Do not change route paths, HTTP status mapping or error codes.
- Do not change automation thresholds, SOURCE SHADOW-only behavior, financial authority, outbox authority, idempotency, lease or reconciliation semantics.
- Do not rewrite v22/v23/v24 migrations.
- No new runtime dependency.
- Refactor only the designated Hípico control-plane files and related tests/workflow.
- Exact-SHA CI failure with no executed steps remains `BLOCKED_INFRASTRUCTURE`.

---

### Task 1: Characterize public surfaces and define structural seams

**Files:**
- Create: `backend/src/modules/hipico/core-refactor-compat.test.ts`
- Create: `backend/src/modules/hipico-bot/hipico-outbox-refactor-compat.test.ts`

**Interfaces:**
- Imports all existing public names from their current modules.
- Requires new internal files to exist so the structural half is RED before extraction.

- [ ] Write tests asserting the current public exports are callable/importable and representative outputs/error codes remain exact.
- [ ] Add structural assertions for `agent-contracts.ts`, `agent-tools.ts`, `promotion-policy.ts`, `agent-evaluator.ts`, `automation-scope.ts`, `automation-evidence.ts`, `automation-metrics.store.ts`, `agent-http.ts`, `hipico-outbox-input.ts`, `hipico-outbox-receipt-input.ts`.
- [ ] Attempt focused test run and record RED or infrastructure limitation.
- [ ] Commit tests only.

### Task 2: Split agent policy behind a compatibility facade

**Files:**
- Create: `backend/src/modules/hipico/agent-contracts.ts`
- Create: `backend/src/modules/hipico/agent-tools.ts`
- Create: `backend/src/modules/hipico/promotion-policy.ts`
- Create: `backend/src/modules/hipico/agent-evaluator.ts`
- Modify: `backend/src/modules/hipico/agent-policy.ts`

**Interfaces:**
- `agent-policy.ts` keeps exporting every current public symbol and type.
- `canPromoteAutomation(current,target,metrics,ownerApproved)` remains unchanged.
- `HipicoAgentEngine.evaluate(text,mode,riskContext)` remains unchanged.

- [ ] Move constants/types only to `agent-contracts.ts`.
- [ ] Move candidate/tool validation and auto-action predicate to `agent-tools.ts`.
- [ ] Move promotion thresholds/rates/gate implementation to `promotion-policy.ts`.
- [ ] Move `HipicoAgentEngine` orchestration to `agent-evaluator.ts`.
- [ ] Convert `agent-policy.ts` into explicit re-exports with no behavioral logic.
- [ ] Re-run agent policy/risk/promotion/golden suites and compatibility tests.
- [ ] Commit.

### Task 3: Split AutomationStore internals without changing transaction behavior

**Files:**
- Create: `backend/src/modules/hipico/automation-scope.ts`
- Create: `backend/src/modules/hipico/automation-evidence.ts`
- Create: `backend/src/modules/hipico/automation-metrics.store.ts`
- Modify: `backend/src/modules/hipico/automation.store.ts`

**Interfaces:**
- `AutomationStore` public class/method names remain unchanged.
- `sanitizeAgentEvidence` remains importable from `automation.store.ts`.

- [ ] Extract scope validation/default SOURCE mode/source target guard/advisory lock key.
- [ ] Extract evidence sanitizer and transition signature.
- [ ] Extract historical/recent/by-intent SQL aggregation and row normalization.
- [ ] Keep `setMode` transaction order and SQL mutation semantics unchanged.
- [ ] Keep evaluation/review/evaluations/transitionEvents response shapes unchanged.
- [ ] Run Agent unit + PostgreSQL E2E + compatibility tests.
- [ ] Commit.

### Task 4: Extract HTTP parsing from agent route registration

**Files:**
- Create: `backend/src/modules/hipico/agent-http.ts`
- Modify: `backend/src/modules/hipico/agent.routes.ts`
- Modify/Add tests only as needed for characterization.

**Interfaces:**
- Default router export and all route paths stay unchanged.
- Request bodies remain strict and additive v7 `raceContextError` remains optional/default false.

- [ ] Move Zod schemas, request id, owner/group/groupId/idempotency parsers, actor ref, owner approval config, SOURCE read-only detection, server risk context and status mapping into `agent-http.ts`.
- [ ] Keep middleware and route responses identical.
- [ ] Re-run route/security/contracts tests.
- [ ] Commit.

### Task 5: Refactor canonical outbox input/receipt normalization

**Files:**
- Create: `backend/src/modules/hipico-bot/hipico-outbox-input.ts`
- Create: `backend/src/modules/hipico-bot/hipico-outbox-receipt-input.ts`
- Modify: `backend/src/modules/hipico-bot/hipico-outbox.store.ts`

**Interfaces:**
- Keep every current exported outbox function and `CanonicalOutboundInput` available from `hipico-outbox.store.ts`.
- Keep all existing error codes and SQL state transitions.

- [ ] Extract UUID/E164/provider validation, bounded integer normalization, canonical outbound normalization and intent comparison.
- [ ] Extract provider receipt/reconciliation normalization and safe bounded error fields.
- [ ] Reformat store DB functions into readable multi-line code without changing SQL predicates or transition states.
- [ ] Keep `claimCanonicalOutbound` locking/lease/cooldown/idempotency SQL semantically identical.
- [ ] Keep receipt monotonicity and explicit reconciliation requirements identical.
- [ ] Run outbox unit/PostgreSQL/worker/operator/webhook tests and compatibility tests.
- [ ] Commit.

### Task 6: Cross-module regression and circular-dependency guard

**Files:**
- Create: `backend/src/modules/hipico/core-refactor-architecture.test.ts`

**Interfaces:**
- No circular import from contract modules back into facades.

- [ ] Assert contract modules do not import `agent-policy.ts`.
- [ ] Assert `agent-policy.ts` contains only imports/exports/comments and no duplicated gate/tool implementation.
- [ ] Assert `automation.store.ts` delegates to extracted metric/evidence/scope helpers while retaining class surface.
- [ ] Assert `hipico-outbox.store.ts` delegates normalization while retaining public exports.
- [ ] Run full Hípico suite.
- [ ] Commit.

### Task 7: Exact-SHA verification workflow and PR

**Files:**
- Create: `.github/workflows/hipico-core-refactor-v8.yml`

**Interfaces:**
- Workflow checks exact PR head SHA.

- [ ] Add Node 22 + PostgreSQL 16 workflow with exact-SHA gate, `npm ci`, backend typecheck, `test:hipico`, Agent PostgreSQL E2E, existing outbox PostgreSQL test if script is present, backend build, `git diff --check`, cleanup.
- [ ] Open stacked PR from `refactor/hipico-core-v8` to `feat/hipico-shadow-metrics-v7`.
- [ ] Inspect exact-SHA workflow jobs/logs.
- [ ] If jobs do not execute, record `BLOCKED_INFRASTRUCTURE` and do not claim PASS.
- [ ] Review full diff for accidental public contract changes/secrets/unrelated files.
