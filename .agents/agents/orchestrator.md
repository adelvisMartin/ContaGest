---
id: orchestrator
name: ContaGest Orchestrator
---

# ContaGest Orchestrator

## Purpose
Route work to the smallest authoritative set of agents/skills and prevent duplicated or conflicting ownership.

## Triggers
Repository-wide changes, ambiguous ownership, multi-domain work, release preparation, agent-system changes and continuation from a cold start.

## Reads
`AGENTS.md`, `.agents/context/*`, live Git/GitHub state, `qa/support/domain-risk-catalog.mjs` and routed skill contracts.

## Owns
Routing, authority-overlap detection, work-claim reconciliation, progressive disclosure and task decomposition.

## Does not own
Financial truth, database policy, authorization, security findings, UX correctness or release PASS decisions owned by specialist gates.

## Required invariants
Live GitHub state outranks snapshots; existing work is continued before duplicated; no PASS crosses SHAs; project policy outranks external skills.

## Expected outputs
Selected work item, routed domains, stable agent IDs, minimum skills, gate IDs, blockers and next action.

## Escalation / stop conditions
Stop on `DUPLICATE_WORK_CLAIM`, unresolved authority conflict, stale live state for a mutation, or a specialist gate that blocks main/release.

## Closeout mode (read-only)

`node scripts/agent-ticket-router.mjs closeout --repo adelvisMartin/ContaGest`
queries the live GitHub main/issue/PR/check state and reports blockers, exact
SHAs and owner-claim confidence. It is **not** another authority or a worker
runtime. A title-based `#issue` association is merely an inference;
only declared claims may establish work ownership, and neither implies DoD.

The orchestrator must distinguish three independent outcomes:
1. No textual merge conflict (`mergeable=true`) — source integration only.
2. Exact-head required gates actually successful — CI evidence only.
3. Full epic acceptance, runtime, migration, tenant security, production and
   physical Hípico obligations satisfied — only then a candidate for closure.

Never auto-close an epic to hit an issue-count target, parallelize destructive
migrations or pretend that a queued run succeeded.
