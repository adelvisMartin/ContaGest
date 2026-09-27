# ContaGest Agent Context Plane v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Agent Context Plane v2 so a fresh agent can continue ContaGest with minimal context, deterministic routing, persistent role contracts, SHA-aware Graphify use, and duplicate-work protection.

**Architecture:** Keep live work state in Git/GitHub, stable navigation/context in `.agents/context`, methods in skills, responsibilities in `.agents/agents`, and Graphify as local repository intelligence only. Add deterministic Node tooling and contract tests so context, routing, Skill Contract v2, bootstrap, Graphify freshness, and duplicate issue claims are machine-verifiable.

**Tech Stack:** Node.js 22 ESM, existing `node:test`, repository scripts, GitHub Actions, JSON/Markdown contracts, existing Graphify adapter.

**Spec:** `docs/superpowers/specs/2026-09-27-agent-context-plane-v2-design.md`

## Global Constraints

- No production Graphify dependency.
- No product, financial, tenant, clinical, runtime or deployment behavior changes in Phase A.
- Git/GitHub live state outranks mutable Markdown for current SHA/issues/PRs/checks.
- `graphify-out/` remains ignored/generated.
- Graphify `CURRENT` requires an exact source-SHA match to current HEAD.
- Project-owned skills end v2-compliant; vendored/external skills are not rewritten as project-owned.
- Exact evidence vocabulary remains `PASS | FAIL | BLOCKED | NOT_EXECUTED`.
- Bootstrap and validators are read-only by default and do not create/merge/close/deploy.

## Review Focus

- Offline/no-GitHub state must degrade to explicit blocked live-state fields, never stale truth.
- Duplicate-claim detection must distinguish exclusive closing claims from diagnostics and explicitly approved stacks.
- A stale Graphify graph must never be reported CURRENT because file mtimes look recent.
- Router v2 must resolve every emitted stable agent ID to an actual profile.
- Skill validator must avoid rewriting or falsely failing pinned external skills.

---

### Task 1: Context-plane contracts and cold-start files

**Files:**
- Create: `.agents/context/BOOTSTRAP.md`
- Create: `.agents/context/CONTEXT_CONTRACT.md`
- Create: `.agents/context/WORK_QUEUE.json`
- Create: `.agents/context/PROJECT_MAP.json`
- Create: `tests/agent_context_plane_v2_contract.test.mjs`

**Interfaces:**
- Produces stable context files consumed by the bootstrap command and agent-system validator.
- `WORK_QUEUE.json` exposes `schemaVersion`, `source`, `metaIssue`, and `queue`.

- [ ] **Step 1:** Add tests asserting required context files, schemas, no hardcoded runtime current-SHA authority, and bootstrap sequence markers.
- [ ] **Step 2:** Run `node --test tests/agent_context_plane_v2_contract.test.mjs`; expected FAIL because context files do not yet exist.
- [ ] **Step 3:** Add the four context artifacts with progressive-disclosure and live-state-authority rules from the spec.
- [ ] **Step 4:** Re-run the test; expected PASS.
- [ ] **Step 5:** Commit `feat(agents): add deterministic cold-start context plane`.

### Task 2: Persistent agent profiles and Skill Contract v2

**Files:**
- Create: `.agents/agents/orchestrator.md`
- Create: `.agents/agents/accounting.md`
- Create: `.agents/agents/backend-api.md`
- Create: `.agents/agents/dbre.md`
- Create: `.agents/agents/appsec-iam.md`
- Create: `.agents/agents/frontend-pwa-ux.md`
- Create: `.agents/agents/hipico-reliability.md`
- Create: `.agents/agents/qa-release.md`
- Create: `scripts/verify-agent-system-v2.mjs`
- Create: `tests/agent_system_v2_contract.test.mjs`
- Modify: project-owned `.agents/skills/*/SKILL.md` files

**Interfaces:**
- Produces stable agent IDs identical to filenames without `.md`.
- Produces validator command `node scripts/verify-agent-system-v2.mjs`.
- Project-owned skills require YAML `name`, `description`, `contractVersion: 2` plus the fourteen contract sections from the spec.

- [ ] **Step 1:** Add tests that require the eight profiles, unique agent IDs, profile schema, and v2 compliance for project-owned skills while exempting pinned external adapters.
- [ ] **Step 2:** Run `node --test tests/agent_system_v2_contract.test.mjs`; expected FAIL on missing profiles/validator/v2 metadata.
- [ ] **Step 3:** Add compact role profiles that reference skills rather than copy them.
- [ ] **Step 4:** Implement `verify-agent-system-v2.mjs` and normalize every project-owned skill to Contract v2 without changing domain semantics.
- [ ] **Step 5:** Run `node --test tests/agent_system_v2_contract.test.mjs` and `node scripts/verify-agent-system-v2.mjs`; expected PASS.
- [ ] **Step 6:** Commit `feat(agents): enforce skill contract v2 and persistent roles`.

### Task 3: Router v2 with stable agent IDs

**Files:**
- Modify: `qa/support/domain-risk-catalog.mjs`
- Modify: `scripts/agent-gate-router.mjs`
- Create: `tests/agent_router_v2_contract.test.mjs`

**Interfaces:**
- `gatesForFiles(files)` retains existing behavior and adds the eight new domains.
- Router output adds stable `agentIds` while preserving human-readable `agents`.

- [ ] **Step 1:** Add tests for `agent-system`, `hipico-automation`, `data-lifecycle`, `api-governance`, `observability`, `supply-chain`, `vertical-runtime`, and `privacy-sensitive`, plus agent ID/profile resolution.
- [ ] **Step 2:** Run `node --test tests/agent_router_v2_contract.test.mjs`; expected FAIL because domains/IDs are absent.
- [ ] **Step 3:** Extend the catalog and router minimally while preserving current domains and critical severity semantics.
- [ ] **Step 4:** Re-run the router test and existing agent-gate contract tests if present; expected PASS.
- [ ] **Step 5:** Commit `feat(agents): add deterministic router v2 domains`.

### Task 4: Bootstrap command and Graphify SHA freshness

**Files:**
- Create: `scripts/agent-bootstrap-v2.mjs`
- Create: `scripts/graphify-context-v2.mjs`
- Create: `tests/agent_bootstrap_v2_contract.test.mjs`
- Modify: `package.json`
- Modify: `.agents/skills/graphify/SKILL.md` only if needed to reference the project wrapper contract without making it project-owned v2.

**Interfaces:**
- `npm run agent:bootstrap` invokes `node scripts/agent-bootstrap-v2.mjs`.
- Bootstrap exposes concise JSON/human fields: repo, branch, HEAD, main SHA/drift, work item, work claims, Graphify `CURRENT|STALE|UNAVAILABLE`, domains, agent profile paths, skill paths, gates, next action.
- Graphify helper reads/writes only ignored metadata under `graphify-out/`; exact SHA equality defines CURRENT.

- [ ] **Step 1:** Add tests using isolated temp git fixtures for exact-SHA Graphify freshness, stale binding, unavailable graph, concise bootstrap schema, and no mutation side effects.
- [ ] **Step 2:** Run `node --test tests/agent_bootstrap_v2_contract.test.mjs`; expected FAIL because scripts/package command are absent.
- [ ] **Step 3:** Implement the bootstrap and Graphify context helpers using local git first and explicit blocked live-state when GitHub data is unavailable.
- [ ] **Step 4:** Wire `agent:bootstrap` in `package.json`.
- [ ] **Step 5:** Re-run tests; expected PASS.
- [ ] **Step 6:** Commit `feat(agents): add sha-aware low-token bootstrap`.

### Task 5: Duplicate work claims, CI enforcement, and integration gates

**Files:**
- Create: `scripts/duplicate-work-claims-v2.mjs`
- Create: `tests/duplicate_work_claims_v2.test.mjs`
- Create: `.github/workflows/agent-system-v2.yml`
- Modify: `package.json`
- Modify: `AGENTS.md`

**Interfaces:**
- Detector accepts normalized PR records and returns exclusive issue owners/conflicts.
- Explicit exception metadata is narrow and machine-readable; prose alone cannot bypass a conflict.
- `npm run agent:system:check` runs context/profile/skill/router/bootstrap/duplicate-claim contracts.

- [ ] **Step 1:** Add regression tests where PR #599 and #600 both `Closes #562` and assert `DUPLICATE_WORK_CLAIM`; add passing tests for diagnostic drafts without closure, exactly-one closing owner in a stack, and explicit supersession metadata.
- [ ] **Step 2:** Run `node --test tests/duplicate_work_claims_v2.test.mjs`; expected FAIL because detector is missing.
- [ ] **Step 3:** Implement the detector, package integration command, and fail-closed CI workflow.
- [ ] **Step 4:** Update `AGENTS.md` with a compact cold-start section pointing to `.agents/context/BOOTSTRAP.md` and the no-duplicate-work invariant, without duplicating live state.
- [ ] **Step 5:** Run the focused tests and `npm run agent:system:check`; expected PASS.
- [ ] **Step 6:** Run risk-appropriate repository checks available in the execution environment and record exact SHA/status truthfully.
- [ ] **Step 7:** Commit `feat(agents): enforce context-plane coordination gates`.

## Final branch review

- [ ] Compare the branch against its merge base and verify only agent/tooling/docs/test/workflow surfaces changed.
- [ ] Verify no production dependency was added and `graphify-out/` remains ignored.
- [ ] Verify every emitted router agent ID maps to exactly one profile.
- [ ] Verify all project-owned skills pass Skill Contract v2 and external/pinned adapters remain explicitly external.
- [ ] Verify duplicate-work regression catches the #599/#600 pattern.
- [ ] Verify bootstrap is read-only and no PASS is fabricated when runtime/CI cannot execute.
