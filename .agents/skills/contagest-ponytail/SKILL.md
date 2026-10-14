---
name: contagest-ponytail
description: Minimal complete implementation, not minimal verification; pinned Ponytail guidance subordinate to ContaGest.
contractVersion: 2
---

# ContaGest / Ponytail

## Trigger
Non-trivial ticket diffs, unnecessary abstractions/dependencies, and scope-creep reviews. Advisory, not a replacement for 2–4 routed project skills.

## Non-trigger
Do not invoke for unrelated work or as permission to relax tests, security, financial invariants or required functionality.

## Authority
Explicit owner request and `AGENTS.md` > project-owned domain/security/release specialists > pinned external guidance.

## Source of truth
Current ticket and acceptance criteria; exact GitHub HEAD, code, contracts and executed tests.

## Graphify probes
Navigation only; verify callers and edges in current source, never from a stale graph alone.

## Inputs
Current issue, baseline SHA, affected callers, fixtures, persistence, security boundaries and tests.

## Invariants
- Minimal means smallest **complete** vertical solution; preserve validations, tenant guards, Decimal, audit, error states and accessibility.
- No new dependency or wrapper when a canonical project primitive already solves the problem.
- No Ponytail installer, hooks, permissions changes, automatic session mode or production shortcuts.

## Workflow
1. Characterize existing behavior and list affected callers, contracts, tests and fixtures.
2. Reject unnecessary adjacent refactors and speculative features.
3. Implement the least complex complete change through actual owning layers.
4. Run relevant regression tests and review the diff bound to exact SHA.
5. Explain what was omitted and remaining risk without calling missing checks PASS.

## Negative tests
Search for broken callers, altered error handling, cross-tenant access, lost financial precision, untested branches and skipped accessibility.

## Stop conditions
Unreviewed external behavior, credential access, missing mandatory gates, destructive unknown side effects or incorrect shortcuts.

## Verification
Source/diff review plus appropriate actual local unit, integration, Postgres, build, browser and remote CI evidence; report NOT_EXECUTED accurately.

## Output schema
Issue/SHA; scope; minimality decision; preserved invariants; actual checks and results; risks; merge verdict.

## References
`AGENTS.md`, `.agents/TICKET_EXECUTION_POLICY.md`, project specialists, `agent-skills.lock.json` source `ponytail`, approved vendor Markdown only.
