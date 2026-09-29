# #623 Agent System v3 — Implementation Plan

**Baseline:** `main@a750c53a8bb750403467e075db00d193a1f7ee5c`

**Goal:** evolve the existing Context Plane v2 without a rewrite: deterministic minimal routing, machine-readable Skill Contract v3, exact-SHA local-first evidence, verification planning, claim reconciliation and Graphify freshness semantics.

## Architecture

Keep `AGENTS.md` as permanent project authority. Add a pure v3 policy/core module consumed by existing CLI entrypoints so current commands remain compatible:

- `config/agent-system-v3.json` — statuses, evidence dimensions, error codes, routing limits, provider policy.
- `config/agent-skill-contracts-v3.json` — project-owned skill registry with status/provenance/inputs/evidence/validation/escalation.
- `scripts/agent-system-v3-lib.mjs` — pure router/planner/evidence/claim/Graphify helpers.
- existing `agent:gates` and `agent:bootstrap` become schema v3 consumers; v2 compatibility helpers remain where useful.
- `scripts/verify-agent-system-v3.mjs` audits contracts, project skill coverage and policy integrity.
- `tests/agent_system_v3_issue_623.test.mjs` characterizes routing, evidence, claims, Graphify and external-skill authority.

## TDD batches

1. **Contract RED:** tests require v3 policy/skill registry/core library and fail while absent.
2. **Router GREEN:** select 2–4 minimal skills for DB P0, UI, finance, refactor and Hípico fixtures; ACTIVE-only.
3. **Evidence GREEN:** validate exact-SHA ledger entries and provider-blocked states without converting them to PASS.
4. **Planner GREEN:** derive only material local/provider evidence dimensions from touched boundaries/task type.
5. **Claims/Graphify GREEN:** advisory vs exclusive claims, single supersession authority, stale claim metadata, CURRENT/STALE/UNAVAILABLE graph state.
6. **CLI integration:** update `agent:gates`, `agent:bootstrap`, package scripts and docs while preserving command names.
7. **Skill quality audit:** require every `contagest-*` project skill to have a v3 registry contract or explicit DEPRECATED/SUPERSEDED status.
8. **Exact candidate review:** source/diff, focused contracts, system verification, bootstrap/gates smoke when executable, remote provider evidence separated.

## Invariants

- External skills never outrank `AGENTS.md` or project-owned contracts.
- No secret/PII/clinical/productive payload in evidence metadata.
- PASS requires an executed command/evidence on the exact candidate SHA.
- `MERGED != VERIFIED`.
- Graphify is navigation intelligence only and `UNAVAILABLE` does not block simple source-grounded work.
- Router target is 2–4 skills for non-trivial tasks; do not load the catalog by default.
- No production deployment/migration action is introduced by this ticket.
