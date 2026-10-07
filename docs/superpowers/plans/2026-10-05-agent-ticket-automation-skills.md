# Agent Ticket Automation Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic project-owned ticket execution capabilities for batch, loop, run-skill-generator, fewer-permission-prompts and skill-doctor without weakening ContaGest Agent System v3.

**Architecture:** Keep domain skill routing unchanged at 2–4 skills. Add a separate execution-capability planner driven by observable ticket signals, expose it through the existing gate/bootstrap outputs, and encode each capability as an ACTIVE project-owned skill contract with strict safety boundaries.

**Tech Stack:** Node.js 22 ESM, JSON contracts, node:test, existing Agent System v3 scripts.

**Spec:** `docs/superpowers/specs/2026-10-05-agent-ticket-automation-skills-design.md`

## Global Constraints
- `AGENTS.md` remains permanent authority.
- Domain routing remains 2–4 ACTIVE project skills.
- `batch` hard cap is 30 isolated workers and requires at least 5 independent work units.
- External/upstream scripts never execute implicitly.
- Permission optimization and skill doctor are read-only/recommendation-first by default.
- PASS requires actually executed exact-candidate evidence; blocked checks remain BLOCKED/NOT_EXECUTED.

## Review Focus
- A ticket reporting 31+ independent units must never produce more than 30 batch workers.
- Ordered/destructive migration work must not be auto-parallelized.
- Permission recommendations must not auto-apply or target destructive/global rules.
- Skill/agent surface changes must automatically select skill-doctor.
- Ordinary small tickets must keep existing 2–4 domain routing and avoid unnecessary execution capabilities.

---

### Task 1: Execution capability planner

**Files:**
- Create: `scripts/agent-ticket-automation-lib.mjs`
- Create: `tests/agent_ticket_automation_skills_v1.test.mjs`
- Create: `config/agent-execution-capabilities-v1.json`

**Interfaces:**
- Produces: `inferTicketAutomationSignals(input)` and `planTicketAutomation(input)`.
- `planTicketAutomation` returns `{ schemaVersion: 1, signals, capabilities }`.

- [ ] Write failing tests for batch threshold/cap, migration safety, loop boundedness, runtime recipe drift, permission advisory behavior, skill-doctor auto-selection and small-ticket no-op behavior.
- [ ] Run the test and verify RED because the planner module does not exist.
- [ ] Implement the minimal planner and policy config.
- [ ] Run the targeted test and verify GREEN.

### Task 2: Project-owned skill contracts

**Files:**
- Create: `.agents/skills/contagest-batch/SKILL.md`
- Create: `.agents/skills/contagest-loop/SKILL.md`
- Create: `.agents/skills/contagest-run-skill-generator/SKILL.md`
- Create: `.agents/skills/contagest-fewer-permission-prompts/SKILL.md`
- Create: `.agents/skills/contagest-skill-doctor/SKILL.md`
- Modify: `config/agent-skill-contracts-v3.json`
- Test: `tests/agent_ticket_automation_skills_v1.test.mjs`

**Interfaces:**
- Produces five ACTIVE project-owned contracts whose IDs match execution-capability planner IDs.

- [ ] Extend the test to require five skill sources/contracts and ensure they remain separate from domain routing slots.
- [ ] Run RED.
- [ ] Add the five skill files and registry entries.
- [ ] Run GREEN.

### Task 3: Router/bootstrap integration

**Files:**
- Modify: `scripts/agent-system-v3-lib.mjs`
- Modify: `scripts/agent-gate-router.mjs`
- Modify: `scripts/agent-bootstrap.mjs`
- Modify: `package.json`
- Test: `tests/agent_ticket_automation_skills_v1.test.mjs`

**Interfaces:**
- Existing `routeTask()` remains backward compatible.
- Gate/bootstrap output adds `executionCapabilities` separately from `skills`.

- [ ] Add failing integration assertions that existing routing remains <=4 domain skills and new capabilities are surfaced separately.
- [ ] Run RED.
- [ ] Wire planner into gate/bootstrap output and add targeted test script.
- [ ] Run GREEN.

### Task 4: Project authority/documentation and verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `.agents/context/AGENT_SYSTEM_V3.md`
- Modify: `scripts/verify-agent-system-v3.mjs` only if needed for the new capability policy.

**Interfaces:**
- Documents automatic checkpoint reevaluation and safe fallbacks across harnesses.

- [ ] Add source-contract assertions for authority/safety text.
- [ ] Run RED.
- [ ] Update project authority/context minimally.
- [ ] Run targeted test GREEN.
- [ ] Run `npm run skills:check`, `npm run agent:system:verify`, `npm run agent:system:test`, and relevant gate command where the full repository checkout is available.
- [ ] Review branch diff for scope, secrets, authority duplication and regression risk.
