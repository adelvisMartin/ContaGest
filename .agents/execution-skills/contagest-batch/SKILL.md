---
name: contagest-batch
description: Parallelize a large ContaGest ticket only after decomposition finds at least 5 genuinely independent work units; never exceed 30 isolated workers.
---

# ContaGest Batch

Use automatically after ticket decomposition when there are **5 or more independent units** that can be implemented without overlapping write ownership or ordered dependencies.

## Contract
1. Read the ticket, acceptance criteria, live branch/PR claims and Agent System v3 route first.
2. Decompose by independently reviewable outcomes, not arbitrary file chunks.
3. Use 5–30 workers maximum. `config/agent-execution-capabilities-v1.json` is the hard policy.
4. Give every worker an isolated worktree/branch when the harness supports it and one exclusive write scope.
5. Keep database migrations, destructive persistence work and any ordered dependency chain sequential.
6. Each worker runs risk-proportional verification for its scope and reports exact evidence; no worker may merge, deploy, close issues or change production.
7. Aggregate only after conflicts, overlapping ownership and failed gates are resolved.

If the current harness cannot launch parallel isolated workers, preserve the decomposition and execute the units sequentially. Never simulate 30 agents by pretending work ran.

`AGENTS.md`, ticket acceptance criteria, domain skills and release evidence always outrank this execution skill.
