# ContaGest · Authorized Ticket Execution Policy

This file is a project-owned agent execution rule and complements `AGENTS.md` and the active META backlog.

## Persistent owner authorization

When the repository owner explicitly authorizes a batch or ordered sequence of tickets to be implemented **and merged**, that authorization remains valid for every ticket in that declared sequence. Do not ask for merge confirmation again ticket by ticket unless the owner revokes or changes the instruction.

Persistent merge authorization is execution permission only. It never authorizes weakening tests, bypassing required verification, hiding failures, rewriting evidence, skipping required gates, or declaring an unexecuted check as PASS.

## Mandatory ticket loop

For every ticket in the authorized sequence:

```text
read ticket + acceptance criteria + dependencies
→ refresh main and record baseline SHA
→ inspect duplicate claims/branches/PRs and current architecture/contracts/tests
→ characterize current behavior before destructive/refactor changes
→ implement the smallest integrated change
→ run risk-proportional local and exact-SHA verification
→ review final diff, secrets, tenant/security/financial impact and rollback
→ open/update the dedicated PR
→ merge only when the ticket's material gates are satisfied
→ close the completed issue and remove it from the active backlog
→ create/retain explicit follow-up owners for material residual work
→ refresh main/HEAD
→ use that new main SHA as the next ticket baseline
→ continue with the next authorized ticket
```

## Evidence rules

Use only real states:

```text
PASS
FAIL
BLOCKED
NOT_EXECUTED
NOT_APPLICABLE
```

A PASS belongs only to the exact candidate SHA that actually executed the check. Any new commit, branch synchronization, or changed candidate SHA invalidates material evidence affected by that change and requires rerunning the relevant gates.

A `FAIL` attributable to the ticket scope, an unmet acceptance criterion, or a mandatory local gate that is `BLOCKED`/`NOT_EXECUTED` prevents `DONE` and merge until corrected or explicitly classified as a material blocker.

Provider failures that are demonstrably pre-existing or outside the diff may be separated under the repository local-first policy, but they remain FAIL/BLOCKED/NOT_EXECUTED as applicable and are never renamed PASS.

## Backlog removal

Closing/removing a ticket from the active backlog means its own Definition of Done is satisfied. Never discard unresolved P0/P1 work to make the backlog look empty.

If material work remains outside the ticket's ownership, create or retain an explicit follow-up issue with an owner before closing the source ticket. The close comment must distinguish completed scope from residual follow-up.

## Database and production safety

Database tickets follow the stricter repository DB rules: PostgreSQL real isolated/ephemeral for destructive tests, synthetic fixtures, tenant isolation, cleanup, immutable applied migrations, and no production experimentation. Production convergence remains in the ticket that explicitly owns it.

## Merge discipline

Before merge:

- confirm PR head SHA has not moved;
- confirm `main` has not moved since the candidate was validated, or synchronize and rerun affected gates;
- review changed files against ticket scope;
- preserve unrelated work and concurrent ticket gates;
- use expected-head SHA when the merge tool supports it;
- after merge, record the merge SHA and refresh `main` before starting the next ticket.
