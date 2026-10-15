---
name: contagest-simplicity-review
description: Advisory Ponytail-inspired smallest complete change review without third-party hooks.
contractVersion: 2
---

# contagest-simplicity-review

## Trigger
When choosing dependencies, reducing implementation complexity, refactoring or reviewing a patch; explicit simplicity-review intent.

## Non-trigger
Never reduce security, a11y, money correctness or required tests just to shorten the diff.

## Authority
Root `AGENTS.md` and domain policies outrank reviewed external guidance. Third-party scripts, hooks and installers do not execute automatically.

## Source of truth
Current code, adjacent callers, canonical primitives, owner acceptance criteria and executed tests.

## Graphify probes
Look for an existing abstraction and all affected consumers before creating another layer.

## Inputs
Issue/acceptance; exact SHA; existing helpers; callers; negative cases; test/rollback plan.

## Invariants
Reuse canonical owner before standard library before a new dependency. Keep edge cases, tenancy guards, persistence error handling, accessibility and financial checks.

## Workflow
1. Identify required behavior. 2. Trace all consumers. 3. Choose existing project primitive or minimum code. 4. Finish fixtures/callers/error paths. 5. Reject speculative abstractions. 6. Verify with required gates.

## Negative tests
Dead wrapper, dependency for one helper, duplicated state, silent change in money/tenant semantics, removing negative test.

## Stop conditions
Stop if simplification would remove an obligation, schema guard, privacy control or evidenced recovery path.

## Verification
Run risk-routed source, static and material unit/DB/browser gates; short code alone is not evidence.

## Output schema
Reused abstraction; net changed surface; tests; risks; omitted optional features.

## References
Official pinned `DietrichGebert/ponytail` `skills/ponytail/SKILL.md`, MIT, through `agent-skills.lock.json`; hooks prohibited.
