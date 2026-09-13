# Hípico Agent Transition Idempotency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Control Hípico automation-mode transitions satisfy #288 RBAC + audit + idempotency without granting the agent any direct business, SOURCE, or monetary effects.

**Architecture:** Reuse the canonical race-command idempotency pattern at the automation route boundary, then persist each accepted mode transition in an append-only transition ledger keyed by owner/group/idempotency key. Replay of the same request returns the original receipt without rewriting current state; reuse of an idempotency key with different request content fails closed with HTTP 409. The existing operator auth, independent AUTOMATIC owner approval, adjacent promotion metrics and evidence-only execution remain authoritative.

**Tech Stack:** Node.js 22, TypeScript 5.9, Express 5, Zod 4, Prisma raw SQL, PostgreSQL/Supabase SQL, node:test/tsx.

**Spec:** GitHub issue #288 and `docs/hipico/ADR-AGENT-SHADOW-288.md`.

## Global Constraints

- Deterministic parser first; model output is untrusted structured evidence only.
- No agent output may directly mutate canonical business state or settle money.
- `actions: []`, `financialAuthority: false`, `directEffectsApplied: false` remain invariant.
- Promotion is adjacent-only and metric-gated; `AUTOMATIC` additionally requires independent owner approval.
- SOURCE starts in SHADOW and may advance only through the same explicit promotion gates defined by #288; this ticket does not add a direct executor.
- Multi-group scope is `ownerId + groupKey + groupId` everywhere.
- No CI checks may be disabled or converted into artificial PASS states.

---

### Task 1: Route idempotency contract

**Files:**
- Modify: `backend/src/modules/hipico/agent-route-security.test.ts`
- Modify: `backend/src/modules/hipico/agent.routes.ts`

**Interfaces:**
- Consumes: existing operator-token middleware and `modeSchema`.
- Produces: validated `requestId`, effective `idempotencyKey`, and stable 409 mismatch errors passed to `AutomationStore.setMode`.

- [ ] **Step 1: Write the failing route contract** requiring `requestId`, optional body `idempotencyKey`, `idempotency-key` header validation, body/header mismatch rejection, and no client `ownerApproved`.
- [ ] **Step 2: Confirm the current route source does not satisfy those assertions.**
- [ ] **Step 3: Add `keySchema=/^[A-Za-z0-9._:-]{8,120}$/`, extend `modeSchema` with `requestId` and optional `idempotencyKey`, validate the header, reject conflicting body/header keys with `HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH`, and pass the effective key to the store.**
- [ ] **Step 4: Map idempotency mismatch to HTTP 409 and include `requestId`, `idempotencyKey`, and `duplicate` in successful receipts.**
- [ ] **Step 5: Re-run `npm --workspace backend run test:hipico` when an executable runner is available.**

### Task 2: Durable append-only transition ledger

**Files:**
- Create: `supabase/sql/hipico_v21_agent_transition_audit.sql`
- Modify: `backend/src/modules/hipico/automation.store.ts`
- Test: `backend/src/modules/hipico/agent-route-security.test.ts`

**Interfaces:**
- Consumes: `AutomationStore.setMode({ownerId,groupKey,groupId,target,actorRef,ownerApproved,requestId,idempotencyKey})`.
- Produces: transition receipt `{previous,current,decision,metrics,requestId,idempotencyKey,duplicate}`.

- [ ] **Step 1: Extend the source contract to require `hipico_automation_transitions`, a unique scoped idempotency key, replay lookup, and `HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH`.**
- [ ] **Step 2: Add v21 migration creating `public.hipico_automation_transitions` with owner/group FK, request/idempotency keys, previous/target modes, decision reason, metrics JSON snapshot, owner-approved flag, actor ref, timestamp, scoped unique constraint, RLS, and no anon/authenticated mutation grants.**
- [ ] **Step 3: Under the existing advisory transaction lock, read an existing transition for the effective idempotency key before state mutation. Exact replay returns the immutable prior receipt and does no UPDATE. Changed requestId/target/ownerApproved throws `HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH`.**
- [ ] **Step 4: For a new request, recalculate metrics under lock, run `canPromoteAutomation`, avoid UPDATE for same-state requests, insert one immutable transition row, and return `duplicate:false`.**
- [ ] **Step 5: Re-run backend tests and PostgreSQL migration contract when infrastructure can execute.**

### Task 3: PostgreSQL executable contract

**Files:**
- Create: `backend/scripts/hipico-agent-transition-contract.mjs`
- Modify: `.github/workflows/hipico-operations.yml` only if that workflow exists on the stacked base and can consume the v21 migration without duplicating another active migration runner.

**Interfaces:**
- Consumes: `supabase/sql/hipico_v16_agent_shadow.sql` and `supabase/sql/hipico_v21_agent_transition_audit.sql`.
- Produces: exact database evidence that duplicate keys are unique/scoped, rows are append-only audit evidence, and direct anonymous/authenticated mutation remains unavailable.

- [ ] **Step 1: Build an ephemeral-Postgres contract that creates prerequisite agent tables, applies v21 twice for replay safety, and validates table/constraint/index/RLS definitions.**
- [ ] **Step 2: Insert one transition and prove a duplicate scoped key fails with PostgreSQL unique violation while the same key in another group scope is allowed.**
- [ ] **Step 3: Verify v21 reapplication does not rewrite the original transition.**
- [ ] **Step 4: Wire the contract into the existing Hípico DB workflow if compatible; otherwise keep it executable and document the external runner blocker instead of fabricating a pass.**

### Task 4: Documentation and final exact-SHA verification

**Files:**
- Modify: `docs/hipico/ADR-AGENT-SHADOW-288.md`
- Modify: PR #322 description.

**Interfaces:**
- Consumes: completed route/store/SQL behavior.
- Produces: operational documentation matching actual security and idempotency semantics.

- [ ] **Step 1: Document independent `HIPICO_AUTOMATION_OWNER_APPROVAL_TOKEN`, recursive evidence sanitization, executable golden corpus v1.2, per-message operational precedence, and transition idempotency/audit.**
- [ ] **Step 2: Re-fetch PR HEAD and inspect same-SHA GitHub workflow jobs and Vercel deployment.**
- [ ] **Step 3: Only remove draft status after same-SHA typecheck, unit/contracts, PostgreSQL, security, build/runtime and required shadow-E2E evidence are genuinely green. If jobs fail before runner assignment, retain `BLOCKED_INFRASTRUCTURE`.**
