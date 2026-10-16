# Agent context tools review · ContaGest + Control Hípico · 2026-10-14

## Baseline and purpose
Baseline at review: `83b62082677f41777b7c586e75b1ae7d95c9d7a0` on `main`. Scope: developer-agent context only. No ERP, Hípico backend, WhatsApp, PostgreSQL, API, deployment, security policy or production runtime change. This review does **not** certify production readiness.

ContaGest already maintains Agent System v3, deterministic 2–4 ACTIVE domain/risk skills, execution capabilities, source-of-truth order and exact-SHA verification. Those must not be replaced by third-party advice. The purpose of this change is to preserve bounded continuity, reduce developer-agent context noise, and collect actionable improvement opportunities without leaking information or changing ticket ownership.

## Decisions and upstream provenance

| Requested tool | Decision | Source pinned in `agent-skills.lock.json` | Limit |
| --- | --- | --- | --- |
| Claude-Mem | Do not install Claude Code hooks, worker or auto-recording. Use a Codex-native file/handoff workflow instead. | Alternative: `richenyu/codex-smart-project-memory`, MIT | A skill cannot grant ChatGPT or Codex persistent cross-session memory by itself. |
| Headroom | Enable portable developer-agent guidance, not the transparent proxy/MCP daemon. | `romangalaxys10-spec/headroom-skill`, Apache-2.0 | Compression is allowed only for **derived summaries**; retain raw exact-SHA CI evidence, original errors and original inputs. |
| Task Observer | Enable lightweight, review-only workflow observations; no automatic skill edits or session-start hook. | `rebelytics/one-skill-to-rule-them-all`, CC-BY-4.0, by Eoghan Henn and contributors | Never observe live users, financial/health data, WhatsApp messages or production prompts. |

Repository-local adapters: `.agents/skills/codex-project-memory/SKILL.md`, `.agents/skills/headroom/SKILL.md`, `.agents/skills/task-observer/SKILL.md`. They are process aids, **not** additional ACTIVE domain-risk slots and do not alter v3 router policy. External source files are optional vendored reference material, allowlisted and pinned, never executed by sync.

## Four-window Codex handoff protocol
1. Before a ticket, refresh live `main`, open issue criteria/dependencies, open PRs/exclusive work claims, and run `node scripts/agent-ticket-router.mjs gates --base main --type <type>`.
2. Assign each window exactly one distinct issue/branch/worktree. **No** shared mutable checkout, database, observation log or artifact directory. PR claims remain canonical; another window's handoff is an untrusted hint.
3. Keep a short, sanitized ticket-local handoff (issue, branch, base/head SHA, owner, implemented boundaries, files, verification matrix + exact-SHA evidence, blockers, next action). Use PR description/comment or a branch-scoped document. Do not commit secrets, personal conversations, raw user/medical/financial payloads or sensitive logs.
4. On resumption, compare recorded SHA and live GitHub state. A stale handoff must be refreshed, not trusted. Never transplant PASS between SHAs. Before merge, rerun required gates against the candidate SHA; merge serially and refresh remaining branches against updated main.
5. Task Observer may suggest a skill improvement in the handoff with evidence, but only a separately reviewed change can modify `AGENTS.md`, skill contracts, authority, CI or policy.

## Headroom safety policy
- Compress human-facing **summaries** of long JSON, source navigation and large successful log sections. Keep source links, paths, lines, exact SHA, errors, failures, warnings, expected/received and investigation clues.
- Never truncate the original CI logs/artifacts, health/tenant/finance audit evidence, schema migrations or binary/protocol payloads. If compression could change interpretation or a parser fails, use the original.
- Do not store or transmit tool outputs to a proxy, third-party service or long-lived automatic memory from this integration.
- No numerical token-saving claim is verified by this PR. Benchmark only with identical representative tasks, raw-vs-summary retrieval correctness and redaction checks.

## Task Observer rules
- Observe only developer workflow friction, repeated failing checks, forgotten gates and user corrections. Evidence must be source/issue/PR links or sanitized descriptions.
- Format: issue + evidence SHA + observed friction + impact + proposed reusable fix + status `PROPOSED | ACCEPTED | REJECTED`.
- Capture a proposed observation in the issue/PR description or a local isolated handoff. No global append-only file shared by parallel windows; no silent writes to project authority or third-party hooks.
- At ticket close, summarize **at most** actionable findings; review and prioritize with existing backlog instead of generating issues automatically.

## Security, rollback and validation
Source review and SHA pins were performed. No upstream executable script, plugin, MCP proxy, hook, daemon, external API or DB migration is installed or activated. Vendor sync remains opt-in under the existing `skills:sync` command. Remove the three adapters, three source lock entries, docs and activation paragraph to roll back completely; runtime behavior is unchanged.

Required PR verification: `npm run skills:check`, `npm run agent:system:verify`, `npm run agent:system:test`, `node --test tests/agent_context_tooling_v1.test.mjs`; inspect GitHub Actions on the **PR head SHA**. Local all-repository commands, E2E and production probes must be separately marked NOT EXECUTED/BLOCKED unless run.

## Next priority (live backlog, not a proof of completion)
1. Complete P1 Hípico LAB Conversation Engine #892, then durable pre-query inbox/restart #907; maintain SOURCE read-only and tenant/group boundaries.
2. P0 Hípico readiness: isolated live backup-role / restore drill #842, physical device + two-session QA #119, sustained soak #120, and only then final go/no-go #839.
3. Parallel ContaGest: production security findings umbrella #651, runtime configuration contract #665, and release evidence/go-no-go owners. Reconcile #974 (prior agent-skills/FODA issue) without duplicating its exclusive claim.

All progress must be re-evaluated against live issues/PRs and exact SHAs before choosing a new ticket.
