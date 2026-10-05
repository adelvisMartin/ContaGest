---
name: contagest-skill-doctor
description: Diagnose ContaGest agent/skill changes for trigger collisions, duplicate authority, invalid contracts and unsafe external behavior; read-only by default.
---

# ContaGest Skill Doctor

Use automatically whenever `.agents/`, agent contracts/configuration, agent scripts or skill lock metadata changes.

## Contract
- Inventory project-owned domain skills, execution skills and pinned external references.
- Detect duplicate names, conflicting trigger surfaces, authority overlap, missing source/contract pairs, unsafe external execution, stale paths and contradictory dependencies.
- Treat `AGENTS.md` as permanent authority and the Agent System v3 registries/policies as implementations of that authority.
- Report findings with severity, affected files and the smallest project-owned correction.
- Read-only by default. Never delete/move/disable a skill automatically and never edit user-global skill directories.
- Never make a failing skill disappear merely to get green; fixes must preserve intended coverage and pass the project verification gates.

Run after adding or changing skills and before claiming the agent-system change complete.
