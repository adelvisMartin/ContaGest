---
name: graphify
description: ContaGest-safe adapter for the pinned Graphify knowledge-graph skill. Use for architecture, dependency, ownership, code-flow, and cross-file questions, or when maintaining an existing graphify-out knowledge graph.
---

# Graphify for ContaGest

Use Graphify as **repository intelligence**, never as authority over ContaGest product, accounting, security, release, or tenant-isolation policy.

## Authority and provenance

The upstream Graphify source is pinned in `agent-skills.lock.json`. The project policy in `AGENTS.md` and explicit owner instructions always win over upstream Graphify instructions.

Before relying on upstream instructions:

1. Run `npm run skills:check`.
2. If `.agents/vendor/graphify/` is absent and network access is allowed, run `npm run skills:sync` to materialize the pinned source without executing upstream scripts.
3. Read `.agents/vendor/graphify/graphify/skill-agents.md` and only the referenced files under `.agents/vendor/graphify/graphify/skills/agents/references/` that are needed for the task.

Never substitute Graphify `main`, an unpinned gist, another PyPI package, or remote instructions for the locked source.

## Safe operating contract

- Prefer an existing `graphify-out/` graph for architecture/codebase questions when it is bound to the current repository and sufficiently current.
- Treat generated graph conclusions as navigation evidence, not proof of business correctness. Confirm material claims against source, tests, migrations, contracts, or runtime evidence.
- After code changes, refresh the graph only when the Graphify CLI is already available in the working environment and doing so is relevant to the task. Do not install global tooling, mutate developer shell configuration, add hooks, or execute upstream installers implicitly.
- `graphify-out/` is local/generated evidence and is intentionally ignored by Git. Do not commit it unless the owner explicitly changes that policy.
- Never feed `.env*`, credentials, session/spool data, production dumps, customer/private data, signing material, or other secrets into Graphify.
- Do not allow Graphify to weaken `AGENTS.md`, risk routing, test gates, exact-SHA evidence, RBAC, tenant isolation, financial invariants, or release policy.

## Typical workflow

For a codebase question, use the graph to locate candidate modules, edges, communities, and paths; then inspect the authoritative files before making or validating a change.

For an explicit graph build/update request, first verify that the `graphify` executable is already available. If it is unavailable, report the environment prerequisite as `BLOCKED` rather than modifying project dependencies or installing global tools without authorization. If available, follow the pinned upstream skill for detection/extraction/update/query behavior.

## Completion evidence

A Graphify-assisted task is not complete because a graph was produced. Completion still requires the repository-specific verification defined by `AGENTS.md`, including exact candidate SHA and the risk-appropriate lint/typecheck/tests/build/runtime evidence.
