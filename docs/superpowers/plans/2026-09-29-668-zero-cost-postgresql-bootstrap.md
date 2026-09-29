# #668 Zero-Cost PostgreSQL 17 Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-neutral USD 0 bootstrap that provisions or reuses PostgreSQL 17 locally and delegates verification to existing #630/#632 authorities.

**Architecture:** A portable Node.js entrypoint owns prerequisite detection, safe runtime selection, ephemeral `postgres:17` lifecycle and exact-SHA delegation. The existing local verification runner remains the DB/profile authority. A thin PowerShell wrapper gives Windows/VS Code a first-class entrypoint without duplicating policy.

**Tech Stack:** Node.js 22 ESM, node:test, Git, PostgreSQL 17, Docker/Podman CLI, PowerShell.

**Spec:** `docs/superpowers/specs/2026-09-29-668-zero-cost-postgresql-bootstrap-design.md`

## Global Constraints

- Mandatory infrastructure cost: USD 0.
- PostgreSQL major version for canonical DB verification: 17.
- Destructive DB lifecycle: loopback only.
- Supabase/Vercel/GitHub Actions: optional provider evidence, never local prerequisites.
- Windows + PowerShell + VS Code: first-class; no WSL requirement.
- No production PII/credentials/dumps.
- No silent system installs.
- Existing #630/#632 semantics stay authoritative.
- Exact candidate SHA must be passed through to material verification.
- Teardown must run after success/failure and best-effort on interruption.

## Review Focus

1. A remote-looking `LOCAL_VERIFY_DATABASE_ADMIN_URL` must hard-fail before any runtime command is started.
2. PostgreSQL 16 or 18 must never be accepted as canonical native runtime for this gate.
3. Docker/Podman dynamic port parsing must reject non-loopback bindings.
4. A delegated verification failure must still remove an owned container.
5. User-visible output/evidence must never include generated database passwords.

---

### Task 1: Runtime detection and safety contract

**Files:**
- Create: `scripts/zero-cost-bootstrap-v668.mjs`
- Create: `tests/zero_cost_bootstrap_v668.test.mjs`

**Interfaces:**
- Produces: `parsePostgresMajor(text)`, `assertLoopbackPostgresUrl(raw)`, `parsePublishedPostgresPort(text)`, `selectPostgresRuntime({ env, probe })`.

- [ ] **Step 1: Write failing tests** for PG17 parsing, PG16/18 rejection, remote URL rejection, native selection, Docker fallback, Podman fallback and blocked state.
- [ ] **Step 2: Run** `node --test tests/zero_cost_bootstrap_v668.test.mjs` and confirm RED because the module/functions do not exist.
- [ ] **Step 3: Implement minimal pure helpers/runtime selection** with injected probes and no side effects at import time.
- [ ] **Step 4: Re-run focused test** and require PASS.
- [ ] **Step 5: Commit** `feat(#668): add zero-cost PG17 runtime detection`.

### Task 2: Owned container lifecycle and cleanup

**Files:**
- Modify: `scripts/zero-cost-bootstrap-v668.mjs`
- Modify: `tests/zero_cost_bootstrap_v668.test.mjs`

**Interfaces:**
- Consumes: Task 1 runtime selection/safety helpers.
- Produces: `buildContainerRunArgs(config)`, `waitForContainerPostgres(adapter, config)`, `withOwnedPostgresContainer(options, fn)`.

- [ ] **Step 1: Write failing tests** proving loopback-only publish args, dynamic port validation, bounded readiness attempts and cleanup after callback failure.
- [ ] **Step 2: Run focused test** and confirm expected RED.
- [ ] **Step 3: Implement lifecycle** using `postgres:17`, synthetic credentials, `docker|podman run`, `port`, `exec pg_isready`, and unconditional `rm -f` in `finally`.
- [ ] **Step 4: Re-run focused test** and require PASS.
- [ ] **Step 5: Commit** `feat(#668): manage ephemeral postgres17 containers safely`.

### Task 3: Canonical delegation, package entrypoint and Windows wrapper

**Files:**
- Modify: `scripts/zero-cost-bootstrap-v668.mjs`
- Modify: `tests/zero_cost_bootstrap_v668.test.mjs`
- Modify: `package.json`
- Create: `scripts/zero-cost-bootstrap-v668.ps1`

**Interfaces:**
- Produces CLI `npm run bootstrap:zero-cost -- [--financial] [--smoke] [--expected-sha <sha>]`.
- Delegates database authority to `npm run verify:local -- --profile database --expected-sha <sha>` and optional financial profile.

- [ ] **Step 1: Write failing tests** for exact-SHA command construction, native/container env injection, sanitized summary and non-zero propagation.
- [ ] **Step 2: Run focused test** and confirm RED.
- [ ] **Step 3: Implement CLI orchestration** and best-effort signal cleanup without changing #630/#632 logic.
- [ ] **Step 4: Add package scripts**: `bootstrap:zero-cost`, `test:bootstrap:zero-cost`; include new contract in `test:verify:local`.
- [ ] **Step 5: Add thin PowerShell wrapper** that invokes Node and forwards arguments; no policy duplication/WSL dependency.
- [ ] **Step 6: Re-run focused tests** and require PASS.
- [ ] **Step 7: Commit** `feat(#668): wire canonical zero-cost bootstrap`.

### Task 4: Documentation, smoke contract and exact-SHA evidence

**Files:**
- Create: `docs/qa/ZERO_COST_BOOTSTRAP_V668.md`
- Modify: `tests/zero_cost_bootstrap_v668.test.mjs`
- Modify: `scripts/zero-cost-bootstrap-v668.mjs`

**Interfaces:**
- `--smoke` runs only existing local build/health commands that can execute without providers; unavailable provider-only checks remain separate statuses.

- [ ] **Step 1: Write failing/static contract tests** for documented native/container/PowerShell paths, no paid-provider requirement, troubleshooting and secret-safe evidence.
- [ ] **Step 2: Implement documentation and smoke command plan**; no arbitrary sleeps.
- [ ] **Step 3: Run** `node --test tests/zero_cost_bootstrap_v668.test.mjs` and `npm run test:verify:local` when repository runtime is available.
- [ ] **Step 4: Run real PG17 path when available**: `npm run bootstrap:zero-cost -- --expected-sha <candidate>` and classify missing Docker/Podman/PG17 as `BLOCKED`, never PASS.
- [ ] **Step 5: Diff review** for secrets, duplicated authority, remote destructive paths and unrelated changes.
- [ ] **Step 6: Commit** `docs(#668): document zero-cost local verification flow`.
