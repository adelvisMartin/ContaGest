# ContaGest Agent System v3

`AGENTS.md` remains the permanent project authority. v3 narrows context and makes routing/evidence machine-readable; it does not create a second business, security, financial or release authority.

## Bootstrap flow

1. Resolve exact local `HEAD` and live GitHub `main`/open PR state.
2. Reconcile duplicate work claims before creating another candidate.
3. Classify touched domains, risk, task type and boundaries.
4. Route only 2–4 ACTIVE project skills needed for the task.
5. Re-evaluate project-owned execution capabilities from observable ticket signals without consuming domain-skill slots.
6. Derive the minimum verification matrix.
7. Bind every evidence entry to the exact candidate SHA.
8. Keep remote provider status separate from local/code correctness.

Canonical domain commands remain:

```bash
npm run agent:bootstrap -- --json
npm run agent:gates -- --base main --type feature
npm run agent:claims -- --repo owner/repo
npm run agent:system:verify
npm run agent:system:test
```

For ticket development, the composition entrypoint is:

```bash
node scripts/agent-ticket-router.mjs gates --base main --type feature
node scripts/agent-ticket-router.mjs bootstrap
```

The ticket router delegates to the canonical v3 gate/bootstrap implementations, then adds `executionCapabilities` from `config/agent-execution-capabilities-v1.json`. Selected capability instructions live under `.agents/execution-skills/<id>/SKILL.md`; they are execution mechanics, not domain/business authorities.

Supported observable execution signals are:

```text
--independent-units <N>
--permission-prompts <N>
--waiting-external --continuation-authorized --stop-condition <condition>
--ordered-mutation
--destructive-mutation
```

Re-evaluate these signals after ticket decomposition and whenever the execution state materially changes. `contagest-batch` is eligible only for at least 5 genuinely independent units and is capped at 30 isolated workers; ordered/destructive persistence work remains sequential. `contagest-loop` requires an already-authorized continuation plus a concrete stop condition. `contagest-run-skill-generator` may record commands and required environment variable names but never secret values. `contagest-fewer-permission-prompts` is recommendation-first and cannot auto-apply broader permissions. `contagest-skill-doctor` is read-only by default.

## Evidence matrix

The only dimensions are:

`SOURCE_REVIEW`, `LOCAL_STATIC`, `LOCAL_UNIT`, `LOCAL_INTEGRATION`, `LOCAL_POSTGRES`, `LOCAL_BUILD`, `LOCAL_BROWSER_E2E`, `REMOTE_CI`, `REMOTE_DEPLOY`, `PHYSICAL_EXTERNAL`.

The only statuses are `PASS`, `FAIL`, `BLOCKED`, `NOT_EXECUTED`, `NOT_APPLICABLE`. PASS requires an exact SHA plus the executed command, environment and concrete evidence. A provider plan/quota problem is `BLOCKED` with `REMOTE_CI_BLOCKED_PLAN` or `REMOTE_DEPLOY_BLOCKED_PLAN`; it never becomes PASS.

`MERGED` is lifecycle state, not verification state.

## Router v3

Inputs are risk (`P0..P3`), task type, domain and touched boundaries. The router favors a small set of project-owned skills. Deprecated/superseded skills are not selectable. P0/P1 work includes release-evidence ownership; bugs/incidents include systematic debugging. Domain skills remain authoritative only inside the boundaries granted by `AGENTS.md`.

Execution capabilities are layered on top of that route. They must never replace, evict or downgrade the 2–4 domain/risk skills chosen by v3.

## Verification planner

- UI/frontend: source/static + component/unit + build + browser.
- backend/API: source/static + unit + integration.
- persistence/tenant: add isolated PostgreSQL.
- financial: add integration/PostgreSQL plus domain-specific accounting gates.
- refactor: characterization/source review before and after.
- provider behavior: add remote evidence only when the property is provider-specific.

The planner is a minimum matrix, not permission to omit a stricter domain invariant.

## Work claims

Claims are `exclusive` or `advisory`. Advisory work cannot own issue closure. At most one active exclusive owner may exist per issue. Multiple exclusive claims are valid only when one directed supersession root reaches every older claim; ambiguous/cyclic ownership is `DUPLICATE_WORK_CLAIM`. Stale metadata is surfaced for reconciliation, never silently treated as authority.

PR metadata may use:

```text
Agent-Claim-Mode: exclusive | advisory
Agent-Claim-Issue: #123
Agent-Claim-Supersedes: #456,#457
```

A normal `Closes #123` remains an exclusive claim for backward compatibility.

## Graphify

Graphify state is only `CURRENT`, `STALE` or `UNAVAILABLE` and is bound to exact HEAD. It is navigation/dependency intelligence, not source/business correctness. `STALE` must not be quoted as current evidence; `UNAVAILABLE` must not block a simple change that can be established from source/tests directly.

## Skill Contract v3

`config/agent-skill-contracts-v3.json` is the machine-readable registry for routed domain/risk skills. Every project-owned `contagest-*` directory under `.agents/skills/` must be `ACTIVE`, `DEPRECATED` or `SUPERSEDED` and declare purpose, triggers, inputs, authorities, prohibited actions, expected evidence, minimum validation, escalation, dependencies and provenance. External adapters remain pinned/inert and subordinate to `AGENTS.md`.

Project-owned execution skills are intentionally separate under `.agents/execution-skills/` and are governed by `config/agent-execution-capabilities-v1.json`; this separation prevents execution mechanics from consuming the v3 2–4 skill budget.

## Security/privacy

Evidence and execution metadata may include issue, branch, SHA, commands, paths, statuses, artifact hashes, work-unit counts and prompt-count telemetry. It must not persist tokens, secrets, permission credentials, PII, clinical content, production payloads or database dumps.
