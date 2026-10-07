---
name: contagest-run-skill-generator
description: Maintain a reproducible project-owned run/verify recipe when ContaGest build, bootstrap or runtime-sensitive files change.
---

# ContaGest Run Skill Generator

Use automatically when the automation planner reports `runtimeRecipeDrift` or when an agent discovers that the current run/verify recipe is missing or wrong.

## Contract
1. Derive commands only from repository source of truth: `package.json`, workspace package files, scripts, checked-in configuration and successful executed commands.
2. Record install/build/start/verify ordering and required **environment variable names**, never credential/token/secret values.
3. Prefer existing canonical scripts over inventing alternative launch paths.
4. Validate the candidate recipe from a clean/isolated environment when available before treating it as current.
5. Do not mutate production/provider configuration, run database resets or embed local absolute paths.
6. A failed command updates the recipe only after root cause is understood; do not encode workarounds that bypass gates.

The recipe supports `/run`/`verify`-style workflows across agent harnesses but remains subordinate to `AGENTS.md` and repository scripts.
