# ContaGest Agent Cold Start

This is the minimum entry point for a fresh agent. Do not reconstruct normal project context from historical chats.

## Authority

1. Read root `AGENTS.md`; it is the permanent engineering contract.
2. Treat live Git/GitHub state as authority for current branch, SHA, issues, pull requests and checks.
3. Treat `.agents/context/WORK_QUEUE.json` as owner ordering hints only; GitHub live state wins.
4. Use Graphify for repository navigation and dependency intelligence, never as business, authorization, financial or release authority.
5. Load agent profiles and skills progressively instead of loading the whole catalog.

## Cold-start sequence

1. Resolve repository root, current branch and HEAD.
2. Resolve the live/default `main` SHA and detect branch drift.
3. Read `WORK_QUEUE.json`; skip tickets that live GitHub reports closed/not-planned.
4. Before creating a branch, inspect open PR/work claims for the selected issue. Two active exclusive closing claims are `DUPLICATE_WORK_CLAIM`; continue/reconcile existing work instead of starting a third copy.
5. Inspect local Graphify metadata. Graphify is `CURRENT` only when its bound source SHA equals the exact current HEAD; otherwise report `STALE` or `UNAVAILABLE`.
6. Use a bounded Graphify query only when architecture/dependency discovery is needed. Prefer 600–1200 output tokens before expanding.
7. Run `npm run agent:gates -- --base main` (or the equivalent explicit-file route when there is not yet a diff).
8. Load the routed agent profiles and only the minimum 2–4 skills needed for the task.
9. Continue existing work when present. Create new work only when live state shows no conflicting claim.
10. Bind tests/evidence to the candidate SHA. Use only `PASS`, `FAIL`, `BLOCKED`, `NOT_EXECUTED` for execution evidence.

## Progressive disclosure

Default read order:

```text
AGENTS.md
→ BOOTSTRAP.md
→ agent:bootstrap summary
→ routed agent profiles
→ minimum task skills
→ bounded Graphify query
→ authoritative source/tests needed for the material claim
```

Do not dump full issue bodies, all skills, full Graphify reports, full PR diffs or historical chat transcripts by default.

## No implicit mutation

Cold start and `agent:bootstrap` are discovery operations. They do not install global tools, create branches, merge PRs, close issues, deploy, migrate databases or mutate production.
