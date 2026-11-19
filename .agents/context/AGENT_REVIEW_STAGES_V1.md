# FODA + Auditoría Independiente · review handoffs v1

Authoritative engineering rules remain in `AGENTS.md` and `.agents/TICKET_EXECUTION_POLICY.md`. These two review profiles **do not create autonomous workers**, cannot replace the existing `qa-release` gate and do not consume the 2–4 ACTIVE project skill slots.

## How to select
For a non-trivial ticket, first run:

```bash
node scripts/agent-ticket-router.mjs gates --base main --type feature
node scripts/agent-ticket-router.mjs bootstrap
```

The `gates` response now contains `reviewStages` in addition to the unchanged `agents`, `agentProfiles`, `skills` and evidence gates.

- `foda-senior`: after a first working implementation (or after incident stabilization); recommendations are advisory and cannot approve merge. An audit-only ticket has no implementation FODA phase.
- `auditoria-independiente`: required review handoff before PR finalization and again after material rebases/conflict resolution and before merge. P0/P1 requires an effective separate reviewer; if the environment cannot provide one, record `BLOCKED` for that independence gate instead of claiming independent approval.

Each reviewer must read its profile and the candidate ticket, diff and exact SHA. Send P0/P1 material findings to responsible domain specialists and `qa-release`. The author remediates, reruns affected gates and requests another review. `qa-release` retains final evidence classification. Source review cannot replace local unit, PG, browser, remote CI or physical gates. Never infer that a `reviewStages` entry means the agent executed.

## Regression command

```bash
npm run agent:system:test
```

The focused test is `tests/agent_ticket_review_stages_v1.test.mjs`, imported by the existing v3 test suite so the package script and its lockfile remain unchanged. Always inspect the live router output and required checks for the candidate SHA before merge.
