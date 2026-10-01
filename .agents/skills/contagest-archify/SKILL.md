---
name: contagest-archify
description: Project-owned wrapper for pinned Archify source-grounded architecture visualization and repository maps.
contractVersion: 3
---

# ContaGest Archify

## Trigger
Use when a repository-grounded architecture, dependency, data-flow, module or boundary diagram would materially improve implementation, audit or handoff work in ContaGest or Control Hipico.

## Authority
Explicit owner instruction + `AGENTS.md`; source/tests/contracts and live repository state; project architecture/domain authorities; then the pinned Archify reference. A generated diagram is navigation/documentation evidence, never architecture authority.

## Inputs
Exact candidate SHA, requested diagram scope, relevant source paths/contracts and the distinction between facts verified from source and any remaining inference.

## Invariants
- Do not invent components, services, tables, dependencies, trust boundaries or runtime flows.
- Label or omit anything not supportable from current source/evidence; inference must never be presented as verified architecture.
- Tenant, RBAC, accounting, security, persistence and Control Hipico SOURCE/LAB boundaries remain governed by their project authorities.
- A diagram cannot authorize a refactor, migration, production mutation or release claim.
- Graphify/Archify/navigation output may help locate code but does not replace source review or tests.

## External reference policy
Use only the source pinned as `archify` in `agent-skills.lock.json`. Do not implicitly execute upstream scripts, binaries, installers or remote instructions.

## Workflow
1. Bind the diagram to an exact SHA and scope.
2. Read the authoritative project files/contracts for that scope.
3. Build only nodes/edges supported by those sources.
4. Separate VERIFIED facts from INFERRED hypotheses; remove unsupported decoration.
5. Cross-check the result against project boundaries before using it in a plan or handoff.

## Stop conditions
Stop if the requested view requires guessing hidden runtime topology, production data, secrets or provider-only state, or if an external recommendation conflicts with `AGENTS.md`.

## Output
A source-grounded architecture artifact or textual graph with provenance, exact SHA, verified paths, explicit inference and known gaps.

## References
`AGENTS.md`, `contagest-erp-orchestrator`, project source/tests, pinned source `archify` in `agent-skills.lock.json`.
