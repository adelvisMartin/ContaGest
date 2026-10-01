---
name: contagest-archify
description: Project-owned wrapper for pinned Archify source-grounded architecture visualization and repository maps.
contractVersion: 2
---

# ContaGest Archify

## Trigger
Repository-grounded architecture, dependency, data-flow, module or boundary diagrams that materially improve implementation, audit or handoff work in ContaGest or Control Hipico.

## Non-trigger
Do not use when a simple source lookup suffices, when hidden runtime topology would have to be guessed, or as authority for refactor/migration/release decisions.

## Authority
Explicit owner instruction + `AGENTS.md`; source/tests/contracts and live repository state; project architecture/domain authorities; then the pinned Archify reference. Generated diagrams are navigation/documentation evidence only.

## Source of truth
Exact candidate SHA plus authoritative project source, tests, contracts and safely obtained runtime/config evidence when relevant.

## Graphify probes
Graphify/Archify may locate neighboring modules and candidate edges. Every material node/edge must be confirmed from current source before it is presented as verified architecture.

## Inputs
Exact candidate SHA, requested diagram scope, relevant source paths/contracts and the distinction between verified facts and inference.

## Invariants
- Never invent components, services, tables, dependencies, trust boundaries or runtime flows.
- Inference is labeled or omitted; it never becomes verified architecture.
- Tenant, RBAC, accounting, security, persistence and Control Hipico SOURCE/LAB boundaries remain governed by project authorities.
- A diagram cannot authorize refactor, migration, production mutation or release claims.
- Upstream scripts/binaries/installers are not implicitly executable.

## Workflow
1. Bind scope to an exact SHA.
2. Read authoritative project files/contracts.
3. Build only source-supported nodes/edges.
4. Separate VERIFIED facts from INFERRED hypotheses.
5. Cross-check project boundaries before using the diagram in planning/handoff.

## Negative tests
Challenge each important node/edge against source, reject stale Graphify data, verify tenant/security/domain boundaries are not collapsed and ensure unknown provider/runtime topology is not drawn as fact.

## Stop conditions
Stop when the view requires guessing hidden topology, production data/secrets, stale navigation intelligence, unsafe upstream execution or conflicts with higher project authority.

## Verification
Source provenance and exact SHA are mandatory. Generated diagram syntax/rendering may pass independently, but does not prove runtime behavior, architecture correctness outside reviewed scope or release readiness.

## Output schema
Report scope, candidate SHA, verified nodes/edges with source provenance, explicit inferences/gaps, rejected unsupported relationships and verification status.

## References
`AGENTS.md`, `contagest-erp-orchestrator`, project source/tests/contracts, pinned `archify` source in `agent-skills.lock.json`.
