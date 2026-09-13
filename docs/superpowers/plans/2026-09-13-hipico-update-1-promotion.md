# Control Hípico Update 1 Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote missing Agent/Shadow, Command Center and AnyDoc/Archify capabilities onto the current `main` without reintroducing historical drift.

**Architecture:** `main` is authoritative. Missing modules are copied from their reviewed recovery branches; existing shared files are merged semantically. The result is delivered as one isolated PR with exact-SHA verification and fail-closed release classification.

**Tech Stack:** Node 22, TypeScript, Express 5, PostgreSQL/Supabase, vanilla PWA JavaScript, Playwright/Bridge, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-13-hipico-update-1-promotion-design.md`

## Global Constraints
- SOURCE remains read-only/shadow.
- No LLM direct DB writes, raw SQL/shell/admin tools or automatic monetary authority.
- `financialAuthority=false` for documents/providers/agents.
- AnyDoc hosted OCR is explicit opt-in only; local extraction is attempted first.
- Existing `main` files are authoritative unless a narrow integration edit is required.
- #119 physical QA and #120 soak cannot be closed by simulated evidence.
- Never classify pre-runner GitHub Actions failures as code PASS/FAIL.

---

### Task 1: Freeze baseline and inventory missing capabilities
**Files:** no product files.

- [ ] Confirm current `main` SHA and create isolated promotion branch.
- [ ] Confirm MessagingChannel/Windows CLI are already present in `main` and exclude #284 re-import from this update.
- [ ] Inventory Agent/Command Center/AnyDoc/Archify source files and shared integration points.

### Task 2: Promote Agent/Shadow
**Files:** `backend/src/modules/hipico/agent*.ts`, `automation.store.ts`, `supabase/sql/hipico_v16_agent_shadow.sql`, golden corpus/ADR/tests, `backend/src/app.ts`, system status files.

- [ ] Copy missing agent modules from the current recovery branch.
- [ ] Merge `app.ts` so agent routes stay inside the canonical `/api/v1/hipico` limiter chain.
- [ ] Preserve deterministic-first, adjacent promotion gates, audit/idempotency and no-act monetary/review invariants.
- [ ] Run/source-review agent tests and contracts available in the environment.

### Task 3: Promote Command Center
**Files:** canonical backend read model/routes, `frontend/api/hipico/command-center.js`, PWA Command Center/theme assets, contracts and parity integration files.

- [ ] Copy missing read-model and browser modules.
- [ ] Merge frontend shell/index/SW/package/Android parity narrowly against current `main`.
- [ ] Verify internal operator tokens/JIDs are not exposed and API/runtime metadata remain no-store.

### Task 4: Promote AnyDoc/Archify/PDF automation
**Files:** AnyDoc extractor/tests, Bridge PDF route/tests, Bridge document spool/hook/media/config/health, Archify scripts/sources/workflow, orchestration skill/risk gates, env examples, package scripts/docs.

- [ ] Copy missing modules from `fix/hipico-285-287-recovery` / PR #325 final tree.
- [ ] Merge document route and `app.ts` without replacing newer provider/race code.
- [ ] Merge package/workflow/env/tooling narrowly.
- [ ] Verify local-first OCR, bounded spool, SOURCE baseline protection, owner server-side and `financialAuthority=false`.

### Task 5: Verify candidate and promote
**Files:** no additional feature scope unless a failing test demonstrates a defect.

- [ ] Compare promotion branch against final `main`; inspect all changed paths.
- [ ] Run available exact-SHA GitHub/Vercel checks and focal executable tests.
- [ ] Fix demonstrated defects with TDD; do not patch by hypothesis.
- [ ] Open PR to `main` with evidence table and blockers.
- [ ] Merge automatically with `expected_head_sha` only if applicable code gates are green or the only remaining blockers are explicitly external gates accepted by the owner for this integration step.
- [ ] Verify post-merge `main` ancestry/tree and do not close #119/#120.
