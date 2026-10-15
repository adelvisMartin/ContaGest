---
name: contagest-addy-engineering
description: Project-owned adoption of Addy Osmani engineering phases for verified ticket-to-PR workflow.
contractVersion: 2
---

# ContaGest / Addy engineering lifecycle

## Trigger
Ticket decomposition, incremental implementation, tests, code review, Git, CI and coordinated concurrent issue delivery.

## Non-trigger
Do not load full vendor catalog on every ticket, replace specialist controls, or silently assign next tickets across windows.

## Authority
`AGENTS.md`, ticket acceptance, project specialist owners and `.agents/TICKET_EXECUTION_POLICY.md` override external phases.

## Source of truth
Live exact-SHA GitHub state, actual application code, contracts, tests and observed provider check outcomes.

## Graphify probes
Use navigation pointers cautiously; verify boundaries and ownership in source before planning changes.

## Inputs
Unique issue claim/window ID, baseline SHA, dependencies, affected paths, selected v3 skills and acceptance criteria.

## Invariants
- One exclusive owner/branch/PR per issue and one designated **serial merge coordinator** for `main`.
- Parallel implementation only with isolated branches/worktrees; do not race shared schema, CI, agent config, lockfiles or main writes.
- New SHA invalidates affected prior evidence; failures and quota blockers stay FAIL/BLOCKED.
- Never call a third-party installer/hook or change permissions as a skill side effect.

## Workflow
1. PLAN: follow reviewed Addy planning guidance under the project's existing pinned source, verify issue/claims/dependencies.
2. BUILD: incremental implementation, preserve UI → API → domain → PostgreSQL and errors.
3. VERIFY: reviewed test-driven-development principles, characterization and risk-proportional exact-SHA gates.
4. REVIEW: `code-review-and-quality` for diff, finance, tenant/auth, QA and secrets.
5. SHIP: reviewed Git and CI workflow practices when relevant; commit/push/PR.
6. Coordinator checks current HEAD, serially merges only verified PRs, confirms merge SHA and closes only completed issues.

## Negative tests
Duplicate claims, overlap, stale PR head, failure reclassified as provider issue, unverified Postgres, unwanted API contract change.

## Stop conditions
Unresolved claim, changed SHA without rerun, material failed CI/test, unsafe SQL, credential disclosure or missing project acceptance.

## Verification
Run project-required v3 routing and meaningful unit/integration/DB/browser/security gates; validate PR run IDs reference current SHA.

## Output schema
Window/issue; baseline and candidate SHA; file list; executed test evidence; PR and CI; final merge/issue status and follow-ups.

## References
`AGENTS.md`, `.agents/TICKET_EXECUTION_POLICY.md`, `docs/FOUR_WINDOW_TICKET_PROTOCOL_2026-10-14.md`, `agent-skills.lock.json` source `addy-osmani-engineering`.
