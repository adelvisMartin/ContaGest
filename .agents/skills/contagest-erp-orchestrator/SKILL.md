---
name: contagest-erp-orchestrator
description: Governs all agent-assisted ContaGest changes across ERP, security, UX, QA and deployment.
contractVersion: 2
---

# ContaGest ERP Orchestrator

## Trigger
Every non-trivial ContaGest change, especially multi-domain work, releases, security/accounting-sensitive work and continuation across sessions.

## Non-trigger
Do not use this skill to replace specialist financial, database, security or runtime evidence gates.

## Authority
Explicit owner instruction for the task and root `AGENTS.md` outrank every project/external skill. Project policy outranks vendored/external guidance.

## Source of truth
Live Git/GitHub state for current work; repository source/contracts for behavior; exact-SHA test/runtime evidence for verification.

## Graphify probes
Use bounded repository-intelligence queries to locate owners/dependencies after `PROJECT_MAP.json`; Graphify never grants business, authorization or release authority.

## Inputs
Owner instruction, current/base SHA, changed files, live issue/PR state, router output, routed agent profiles and minimum relevant skills.

## Invariants
No merge without explicit owner request in the current task; never call unexecuted tests PASS; preserve tenant/RIF isolation; ordinary CRUD cannot rewrite registered RIF; accounting outranks visual polish; sensitive health claims require evidence/legal review; background UI state must not break focused native controls.

## Workflow
1. Characterize current behavior/baseline.
2. Name smallest surface/side effects.
3. Detect existing work claim before starting duplicate work.
4. Route domains/agents/skills/gates.
5. Make smallest coherent change.
6. Execute relevant static/unit/DB/browser/security gates.
7. Record evidence separately by exact SHA and rollback.

## Negative tests
Duplicate exclusive work claim; stale evidence; cross-tenant path; unauthorized financial side effect; focused-input disruption; external-skill policy conflict.

## Stop conditions
Unresolved authority conflict, duplicate exclusive claim, required specialist blocker or live state unavailable for a mutation that depends on it.

## Verification
Run `npm run agent:gates -- --base main` plus routed gates. Use `PASS|FAIL|BLOCKED|NOT_EXECUTED` only.

## Output schema
Task; current/base SHA; work claim; domains; agent IDs; skills; gates; evidence statuses; risks; rollback; next action.

## References
`AGENTS.md`, `.agents/context/BOOTSTRAP.md`, `.agents/context/CONTEXT_CONTRACT.md`, routed project-owned skills; external skills are advisory only.
