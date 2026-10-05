# Agent Ticket Automation Skills Design

## Goal
Integrate project-owned equivalents of Claude Code's batch, loop, run-skill-generator, fewer-permission-prompts and skill-doctor capabilities into ContaGest Agent System v3 so they are selected automatically from observable ticket-development signals without becoming a second project authority.

## Authority and boundaries
- `AGENTS.md` remains permanent authority.
- Existing domain routing remains limited to 2–4 ACTIVE project skills.
- The five new items are execution capabilities, separate from domain skill slots.
- No external prompt or upstream script executes implicitly.
- No capability may merge, deploy, migrate production, weaken verification, invent PASS evidence or bypass owner/security policy.

## Execution capability model
A project-owned automation planner consumes ticket/task metadata plus observable execution signals and emits a deterministic capability plan.

Signals include:
- independent work units discovered during decomposition;
- waiting on external/recurring state;
- build/run recipe-sensitive files changed;
- repeated permission prompts observed by the active agent/session;
- agent/skill surface changed.

### batch
Select when decomposition produces at least 5 independent work units. Hard cap: 30 workers. Parallel work must use isolated worktrees/branches where supported, cannot overlap write ownership, and cannot parallelize ordered/destructive database migration steps. If the harness lacks parallel agents/worktrees, fall back to sequential execution while preserving the plan.

### loop
Select only for a bounded recurring continuation of an already-authorized ticket, such as rechecking CI/provider state or repeating a deterministic verification. It is session/task bounded, must have an explicit stop condition, and cannot create new scope.

### run-skill-generator
Select when package/build/runtime/bootstrap files change or when the recorded run/verify recipe is missing/stale. It records project commands and required non-secret environment names only; it must never persist credential values.

### fewer-permission-prompts
Select after repeated permission prompts are observed. Analyze only low-risk/read-only recurring commands by default and produce recommendations first. Do not silently broaden permissions, add destructive prefixes, or write user-global settings.

### skill-doctor
Select automatically whenever `.agents`, agent routing/configuration, skill contracts or skill lock metadata changes. Diagnose collisions, duplicate triggers, authority conflicts and structurally invalid skills. Read-only by default; fixes are normal reviewed repository edits.

## Integration
- Add a machine-readable execution-capability policy.
- Add a deterministic planner library used by `agent:gates` and `agent:bootstrap`.
- Add five project-owned `SKILL.md` files and corresponding v3 contracts.
- Surface selected execution capabilities separately from `skills` in router/bootstrap JSON and human output.
- Update `AGENTS.md` and Agent System v3 context to require signal reevaluation at ticket checkpoints.
- Add contract tests for selection, safety invariants and the 30-worker cap.

## Verification
Minimum validation for this change:
- RED/GREEN targeted Node contract tests for execution-capability planning.
- `npm run skills:check`.
- `npm run agent:system:verify`.
- `npm run agent:system:test`.
- `npm run agent:gates -- --base main --type feature` on the candidate branch when a full checkout is available.

Any environment/provider limitation is reported as BLOCKED/NOT_EXECUTED, never PASS.
