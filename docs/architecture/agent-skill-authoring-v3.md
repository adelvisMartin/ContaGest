# Skill Contract v3 authoring guide

Project-owned skills live under `.agents/skills/contagest-*/SKILL.md` and must also have one entry in `config/agent-skill-contracts-v3.json`. `AGENTS.md` always wins if a registry entry, cached context or external reference disagrees.

Every contract must declare `purpose`, `triggers`, `requiredInputs`, `authoritativeSources`, `prohibitedActions`, `expectedEvidence`, `minimumValidation`, `riskEscalation`, `dependencies`, `provenance`, and status `ACTIVE | DEPRECATED | SUPERSEDED`.

## Quality rules

Prefer one owner over two overlapping skills. Do not create a skill for a single file. Avoid circular mandatory dependencies; peer skills may be routed together by v3 instead. Commands cited by a skill must exist in `package.json` or be an explicit platform command. Large reference material belongs in progressive-disclosure references instead of the cold-start skill body.

External sources are advisory. Their immutable pin/license comes from `agent-skills.lock.json`; upstream scripts are inert unless separately reviewed and intentionally adopted into project-owned code.

## Evidence example

```json
{
  "dimension": "LOCAL_UNIT",
  "status": "PASS",
  "sha": "<40-char candidate sha>",
  "command": "node --test tests/example.test.mjs",
  "environment": "Node 22 / local workspace",
  "evidence": "8 tests passed",
  "reasonCode": null
}
```

A provider quota example is `status=BLOCKED`, never PASS, with `reasonCode=REMOTE_CI_BLOCKED_PLAN` or `REMOTE_DEPLOY_BLOCKED_PLAN` and supporting evidence.

## Review checklist

Run `npm run agent:system:verify`, `node scripts/skill-quality-audit-v3.mjs`, the v3 contract tests, then any domain-specific gates required by the changed skill. A skill change that weakens financial, tenant, security, release or UI invariants requires the corresponding domain review; registry metadata cannot authorize that weakening.
