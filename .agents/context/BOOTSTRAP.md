# ContaGest Agent Cold Start v3

This is the minimum entry point for a fresh agent. Do not reconstruct normal project context from historical chats.

## Authority

1. Read root `AGENTS.md`; it is the permanent engineering contract.
2. Treat live Git/GitHub state as authority for current branch, SHA, issues, pull requests and checks.
3. Treat `.agents/context/WORK_QUEUE.json` as owner ordering hints only; GitHub live state wins.
4. Use Graphify for repository navigation and dependency intelligence, never as business, authorization, financial or release authority.
5. Load agent profiles and skills progressively instead of loading the whole catalog.
6. Treat `config/agent-system-v3.json` and `config/agent-skill-contracts-v3.json` as machine-readable implementations subordinate to `AGENTS.md`.

## Cold-start sequence

1. Resolve repository root, current branch and exact HEAD.
2. Resolve the live/default `main` SHA and detect branch drift.
3. Read `WORK_QUEUE.json`; skip tickets that live GitHub reports closed/not-planned.
4. Before creating a branch, inspect open PR/work claims for the selected issue. Exclusive claims own closure; advisory claims do not. Multiple active exclusive claims require a single directed supersession owner or produce `DUPLICATE_WORK_CLAIM`.
5. Inspect local Graphify metadata. Graphify is `CURRENT` only when its bound source SHA equals exact current HEAD; otherwise report `STALE` or `UNAVAILABLE`. `UNAVAILABLE` alone does not block simple source-grounded work.
6. Use a bounded Graphify query only when architecture/dependency discovery is needed. Prefer 600–1200 output tokens before expanding.
7. Run `npm run agent:gates -- --base main --type <feature|bugfix|refactor|migration|incident|audit|design>` (or the equivalent explicit-file route when there is not yet a diff). Add `--risk P0|P1|P2|P3` only when the issue supplies a stronger explicit classification.
8. Load only the routed 2–4 ACTIVE project skills plus their agent profiles. Deprecated/superseded skills are not selected.
9. Derive the evidence plan before implementation. The standard dimensions are `SOURCE_REVIEW`, `LOCAL_STATIC`, `LOCAL_UNIT`, `LOCAL_INTEGRATION`, `LOCAL_POSTGRES`, `LOCAL_BUILD`, `LOCAL_BROWSER_E2E`, `REMOTE_CI`, `REMOTE_DEPLOY`, `PHYSICAL_EXTERNAL`.
10. Continue existing work when present. Create new work only when live state shows no conflicting claim.
11. Bind every material test/evidence record to the exact candidate SHA. Use only `PASS`, `FAIL`, `BLOCKED`, `NOT_EXECUTED`, `NOT_APPLICABLE`.
12. A PASS must include actual command, environment and evidence. `REMOTE_CI_BLOCKED_PLAN` / `REMOTE_DEPLOY_BLOCKED_PLAN` remain `BLOCKED`, never PASS. `MERGED` is not verification evidence.

## Progressive disclosure

Default read order:

```text
AGENTS.md
→ BOOTSTRAP.md
→ agent:bootstrap summary
→ routed agent profiles
→ minimum 2–4 task skills
→ bounded Graphify query when useful
→ authoritative source/tests needed for the material claim
→ exact-SHA evidence ledger
```

Do not dump full issue bodies, all skills, full Graphify reports, full PR diffs or historical chat transcripts by default.

## Work claim metadata

Backward-compatible `Closes #123` is an exclusive claim. v3 may additionally declare:

```text
Agent-Claim-Mode: exclusive | advisory
Agent-Claim-Issue: #123
Agent-Claim-Supersedes: #456,#457
```

Stale claims are surfaced for reconciliation; they are not silently treated as current authority.

## No implicit mutation

Cold start and `agent:bootstrap` are discovery operations. They do not install global tools, create branches, merge PRs, close issues, deploy, migrate databases or mutate production.
