# Control Hípico Normalization Update 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the missing Agent/Command Center and AnyDoc/Archify deltas onto current `main` without replaying historical drift.

**Architecture:** Build from the exact `main` tree, copy only reviewed delta blobs, and perform semantic merges only on paths changed by both `main` and a feature line. Messaging/#284 is already in `main`; Agent/Command Center comes from `57716ce1...`; AnyDoc/Archify comes only from PR #325's 42-file delta.

**Tech Stack:** Node.js 22, TypeScript, Express, PostgreSQL/Supabase, Playwright Bridge, GitHub Actions, Vercel, Archify, AnyDoc 0.2.4.

**Spec:** `docs/superpowers/specs/2026-09-13-hipico-normalization-update-1-design.md`

## Global Constraints

- SOURCE remains read-only/SHADOW.
- `financialAuthority=false` for agents, providers and documents.
- No historical branch is merged wholesale.
- Current `main` wins for unrelated/newer hardening.
- Hosted OCR remains explicit opt-in and local-first.
- No required gate is bypassed, skipped or converted into fake PASS.

---

### Task 1: Reconcile Agent/Command Center

**Files:** the 33 paths returned by compare `main@dc8b3d86...` → `integration/hipico-platform-2-green@57716ce1...`.

**Interfaces:**
- Consumes: canonical `/api/v1/hipico/*`, operator security and current PWA shell from `main`.
- Produces: Agent/Shadow routes/policy/store, Command Center API/BFF/UI and exact-SHA workflow.

- [ ] Copy paths not modified by `main` since merge base `42d7ed9e...` directly from `57716ce1...`.
- [ ] Merge `android/hipico-control-v1130/scripts/sync-web.mjs`, `backend/package.json`, `frontend/public/hipico-control/STYLE-GUIDE.md`, `frontend/public/hipico-control/index.html`, and `frontend/public/hipico-control/sw.js` so both newer `main` hardening and Agent/Command Center requirements remain.
- [ ] Verify `backend/src/app.ts` mounts Agent and Command Center once and preserves all canonical/compatibility routers.
- [ ] Verify Agent invariants: SOURCE SHADOW, no monetary tools, no SQL/shell/admin, idempotent transition events and prompt/tool injection fail-closed.

### Task 2: Reconcile AnyDoc/Archify

**Files:** exactly the 42 paths in PR #325.

**Interfaces:**
- Consumes: existing `DocumentIngestionService`, Bridge token/group identity and current data-engine workflow.
- Produces: Bridge PDF auto-ingestion, AnyDoc local-first adapter, durable document spool, Archify tooling/diagrams and Hípico risk skill.

- [ ] Copy PR #325 paths that did not receive newer `main` changes.
- [ ] Merge `.github/workflows/hipico-data-engines.yml` preserving the provider/lifecycle changes already in `main` plus AnyDoc install/verification.
- [ ] Merge `backend/src/app.ts` with Task 1 so Agent, Command Center and Bridge document router all coexist exactly once.
- [ ] Verify AnyDoc exact version `0.2.4`, local-first extraction, hosted OCR explicit opt-in and no API key in argv.
- [ ] Verify Bridge PDF bounds: MIME/magic, 10 MiB, bounded spool, SOURCE identity pinning, retry/quarantine and `financialAuthority=false`.

### Task 3: Structural and behavioral verification

**Files:** candidate tree and tests introduced by Tasks 1–2.

**Interfaces:**
- Consumes: final candidate SHA.
- Produces: evidence matrix for merge decision.

- [ ] Compare candidate to frozen baseline and confirm every changed path belongs to Agent/Command Center, AnyDoc/Archify, semantic conflict resolution or these two plan/spec files.
- [ ] Run available source/contracts for Agent/Command Center and AnyDoc/Bridge.
- [ ] Run deterministic `tests/hipico_pdf_automation_2000_property.test.mjs`; require 2000/2000 with replay/isolation invariants.
- [ ] Run backend typecheck/build and Bridge tests when an execution environment is available.
- [ ] Inspect GitHub workflow runs/checks for the exact SHA; classify pre-runner jobs as `BLOCKED_INFRASTRUCTURE`.
- [ ] Inspect Vercel exact-SHA preview/build if produced; never reuse evidence from another SHA.

### Task 4: PR, merge and cleanup

**Files:** GitHub metadata only unless a verification defect requires TDD correction.

**Interfaces:**
- Consumes: exact reviewed candidate SHA and evidence matrix.
- Produces: one mainline PR/merge or an explicit blocker report.

- [ ] Open one PR from `integration/hipico-normalization-update-1` to `main` with baseline, candidate, scope and evidence states.
- [ ] Re-read `main` and PR head immediately before merge; if `main` moved, reconcile and rerun affected gates.
- [ ] Merge with `expected_head_sha` only when no executed required gate is failing and mergeability is clean.
- [ ] Verify the merge commit/tree is on `main` and the promoted files remain present.
- [ ] Close only superseded integration PRs whose work is fully represented by the merged candidate; do not close #119/#120.
- [ ] Leave #284/#288/#289 open unless their acceptance criteria have sufficient post-promotion evidence to justify completion.
