---
name: contagest-loop
description: Continue an already-authorized ContaGest ticket through a bounded recurring check with an explicit stop condition; never create new scope.
---

# ContaGest Loop

Use automatically only when the current ticket has reached a recurring/waiting phase, continuation is already authorized, and a concrete stop condition exists.

Typical uses: recheck required CI/provider state, retry a deterministic non-destructive verification after an external dependency recovers, or continue an explicitly authorized ticket sequence.

## Contract
- Bind the loop to the current ticket/branch/candidate SHA and stated stop condition.
- Re-evaluate exact SHA before reusing evidence.
- Stop on success, material failure, authorization boundary, destructive/security-sensitive action, or when the ticket leaves its declared scope.
- Do not create features, broaden acceptance criteria, merge, deploy, migrate production or turn BLOCKED into PASS.
- Do not use sleeps/timeouts as a substitute for deterministic tests.
- If the harness has no scheduler/loop primitive, perform bounded sequential rechecks and report that limitation.

`AGENTS.md` and release-evidence policy remain authoritative.
