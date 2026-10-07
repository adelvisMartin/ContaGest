---
name: contagest-fewer-permission-prompts
description: Reduce repeated low-risk permission prompts during ContaGest ticket work by producing project-scoped recommendations first; never silently broaden permissions.
---

# ContaGest Fewer Permission Prompts

Use automatically after the active ticket/session observes at least the policy threshold of repeated permission prompts for materially equivalent low-risk actions.

## Contract
1. Analyze only command/tool metadata needed to identify repeated patterns; do not copy conversation contents, credentials or sensitive payloads into reports.
2. Prefer read-only diagnostics and narrowly scoped project commands.
3. Produce recommendations before any settings change. `autoApply=false` is mandatory.
4. Never recommend blanket shells, destructive filesystem/database commands, pushes/merges/deploys, secret access, production mutation or global bypass modes.
5. Keep recommendations project-scoped and reversible. User/global permission settings are outside automatic mutation scope.
6. If the harness has a native permission-rule validator, validate proposed patterns before presenting them.

This skill reduces friction; it never weakens ContaGest security or owner authorization rules.
