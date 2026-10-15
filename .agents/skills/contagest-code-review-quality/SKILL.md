---
name: contagest-code-review-quality
description: Advisory Addy Osmani five-axis review of correctness readability architecture security and performance.
contractVersion: 2
---

# contagest-code-review-quality

## Trigger
PR review, refactor or post-implementation independent review; code-review intent.

## Non-trigger
Not a substitute for CI, E2E, accounting, tenancy, security or release evidence.

## Authority
Root `AGENTS.md` and domain policies outrank reviewed external guidance. Third-party scripts, hooks and installers do not execute automatically.

## Source of truth
Exact diff and baseline, source architecture, real tests and GitHub Actions logs.

## Graphify probes
Map changed module ownership, service/query dependencies and neighboring client callers.

## Inputs
Base/head SHA; acceptance; changed paths; known failures; performance and auth boundaries.

## Invariants
Every finding has concrete affected source and impact; speculation not a proven defect; project gates always outrank general style guidance.

## Workflow
1. Check correctness and failure modes. 2. Review complexity and naming. 3. Check architecture ownership. 4. Trace security boundaries. 5. Inspect hot-path/render cost. 6. Rank actionable blockers.

## Negative tests
Cross-tenant reads, duplicate effects, missing failure paths, unbounded queries, misleading success-only tests.

## Stop conditions
P0/P1 flaw or missing required execution blocks sign-off; no bypass or check weakening.

## Verification
Source-review alone does not mark runtime/browser/postgres tests PASS; require exact-SHA evidence.

## Output schema
SHA; severity; file and reproducible finding; proposed fix; checks run and residual risk.

## References
Official pinned `addyosmani/agent-skills` `skills/code-review-and-quality/SKILL.md`, MIT, advisory only.
