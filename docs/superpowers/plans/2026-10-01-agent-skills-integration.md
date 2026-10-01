# Agent Skills Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate UI/UX Pro Max, Impeccable, Archify and Copywriting into ContaGest + Control Hípico Agent System v3 through pinned external sources and project-owned wrappers, while preserving the existing Cloudflare security integration.

**Architecture:** External sources remain pinned/inert in `agent-skills.lock.json`; ACTIVE routing only exposes project-owned `contagest-*` wrappers. Routing gains small explicit intent hints for advisory capabilities and only fills unused skill slots, so security/release/domain skills are never displaced.

**Tech Stack:** Node.js 22 ESM, JSON skill registry/lockfile, Node test runner, GitHub.

**Spec:** `docs/superpowers/specs/2026-10-01-agent-skills-integration-design.md`

## Global Constraints

- `AGENTS.md` remains permanent authority.
- External skills cannot override project policy or execute upstream scripts implicitly.
- Router remains deterministic and capped at 2–4 ACTIVE project skills.
- Existing Cloudflare integration is reused, never duplicated.
- Existing Impeccable source pin is reused.
- Copywriting vendors only `skills/copywriting/SKILL.md` plus license.
- No runtime application, DB schema or production configuration changes.

## Review Focus

- P0/P1 routing must keep mandatory release/security/domain skills even when advisory intents are requested.
- Unknown intent names must fail closed rather than silently route the wrong skill.
- Multiple advisory intents must remain deterministic under the four-skill cap.
- Cloudflare and Impeccable source entries must stay unique.
- Wrapper guidance must remain subordinate to Hípico SOURCE/LAB, UI ownership and regulated-domain semantics.

---

### Task 1: Pin and contract external guidance

**Files:**
- Modify: `agent-skills.lock.json`
- Create: `.agents/skills/contagest-ui-ux-pro-max/SKILL.md`
- Create: `.agents/skills/contagest-impeccable/SKILL.md`
- Create: `.agents/skills/contagest-archify/SKILL.md`
- Create: `.agents/skills/contagest-copywriting/SKILL.md`
- Modify: `config/agent-skill-contracts-v3.json`
- Test: `tests/agent_skill_integrations_v874.test.mjs`

**Interfaces:**
- Consumes: Agent System v3 skill contract schema and lockfile policy.
- Produces: four ACTIVE project-owned wrapper contracts and three new pinned external sources.

- [ ] **Step 1: Write failing contract/lock tests** proving wrapper contracts, unique Cloudflare/Impeccable, exact pins and no external ACTIVE contract.
- [ ] **Step 2: Run focused test and confirm RED** because wrappers/sources do not yet exist.
- [ ] **Step 3: Add minimal pins, wrappers and registry contracts.**
- [ ] **Step 4: Run focused test and confirm GREEN.**

### Task 2: Add intent-aware, risk-first routing

**Files:**
- Modify: `scripts/agent-system-v3-lib.mjs`
- Modify: `scripts/agent-gate-router.mjs`
- Test: `tests/agent_skill_integrations_v874.test.mjs`

**Interfaces:**
- Consumes: ACTIVE wrapper contracts from Task 1.
- Produces: `routeTask({ risk, type, domains, boundaries, intents })` with known intents `ui-polish`, `architecture-diagram`, `copywriting`; UI/UX Pro Max may use a spare slot for material UI work.

- [ ] **Step 1: Add failing routing tests** for UI design, polish, architecture diagrams, copywriting, unknown intent, cap and non-displacement.
- [ ] **Step 2: Run focused test and confirm RED.**
- [ ] **Step 3: Implement intent normalization and spare-slot advisory selection; add `--intent` CLI forwarding.**
- [ ] **Step 4: Run focused test and confirm GREEN.**

### Task 3: Wire documentation and authoritative regression suite

**Files:**
- Modify: `AGENTS.md`
- Modify: `package.json`
- Test: `tests/agent_system_v3_issue_623.test.mjs`
- Test: `tests/agent_skill_integrations_v874.test.mjs`

**Interfaces:**
- Consumes: routing and wrappers from Tasks 1–2.
- Produces: canonical project guidance and inclusion in `npm run agent:system:test`.

- [ ] **Step 1: Add the focused test file to `agent:system:test` and document wrapper precedence.**
- [ ] **Step 2: Run focused tests and Agent System verification commands where executable.**
- [ ] **Step 3: Review final diff for no runtime/DB/provider mutation.**
- [ ] **Step 4: Merge only with real evidence; unavailable provider execution remains `BLOCKED`/`NOT_EXECUTED`, never PASS.**
