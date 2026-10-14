---
name: contagest-addy-engineering
description: Project-owned adoption of Addy Osmani engineering phases for verified ticket-to-PR workflow.
contractVersion: 3
---

# ContaGest / Addy Osmani engineering lifecycle

## Trigger
Ticket planning, phased implementation, targeted tests, code review, Git/PR coordination or CI feedback diagnosis.

## Read first
`AGENTS.md`, `.agents/TICKET_EXECUTION_POLICY.md`, project agents, exact HEAD and the ticket. Use pinned upstream docs from `.agents/vendor/addy-agent-skills/skills/` selectively; never bulk-load the whole catalog.

## Phases and selective references
- PLAN: `planning-and-task-breakdown` after checking issue dependencies and acceptance.
- BUILD: `incremental-implementation`, preserving frontend → API → service → PostgreSQL behavior.
- VERIFY: `test-driven-development` for new behavior, characterization for existing behavior, risk-sized local gates.
- REVIEW: `code-review-and-quality` including tenant/authz, accounting, PWA, privacy and secrets.
- SHIP: `git-workflow-and-versioning` plus `ci-cd-and-automation` only when relevant.
- Meta skill `using-agent-skills` suggests phases but cannot supersede v3 routing or the project definition of done.

## Four-window invariant
Exactly one exclusive issue owner and branch per window; never pick a shared next issue without a coordinator claim. Parallelize implementation only, serialize merges to `main`. Re-read HEAD and required checks on every attempt; rebase/update PR as needed and rerun invalidated checks. Close an issue only after verified merge and acceptance completion. A GitHub provider quota is BLOCKED, never PASS.

## Stop
Duplicate claims, unverified dependencies, changed SHA after proof, missing P0/P1 gates, unverifiable destructive SQL, unapproved production side effects or credential disclosure.

## Output
Baseline/candidate SHA, issue, branch, changed files, evidence table, reviewers/gates, PR, merge SHA and issue closure/follow-up.

## Authority
Project-owned agent system and policy > pinned Addy workflow. Source: `agent-skills.lock.json` (`addy-agent-skills`).
