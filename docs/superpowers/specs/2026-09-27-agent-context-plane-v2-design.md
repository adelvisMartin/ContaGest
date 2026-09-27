# ContaGest Agent Context Plane v2 — Design

**Status:** DRAFT_FOR_OWNER_REVIEW  
**Date:** 2026-09-27  
**Design baseline:** `main@8803538b12c4df9cd1b7c3959bc17ffe53abf25b`  
**Scope:** agent/tooling architecture only; no product, financial, tenant, clinical or production behavior changes.

## 1. Problem

ContaGest already has strong project rules, risk routing, domain skills and exact-SHA evidence, but agent continuity is fragmented.

Observed problems:

1. `AGENTS.md` is authoritative but large and mixes permanent policy with operational detail.
2. `.agents/` contains skills but no canonical continuity/bootstrap layer and no persistent agent-role contracts.
3. `qa/support/domain-risk-catalog.mjs` returns named agents such as DBRE, QA and Backend/API, but those are nominal roles rather than versioned profiles.
4. Graphify is available for repository intelligence, but `graphify-out/` is intentionally local/ignored and cannot be the shared operational source of truth.
5. Mutable state is duplicated across GitHub issues/comments, chats and documents and can become stale within minutes.
6. Separate agents/chats can start the same ticket without detecting existing work. The live #562 state demonstrated this with concurrent PRs #599 and #600.
7. New sessions repeatedly reread repository history and large documents, increasing token use and context drift.

The target experience is that a new agent can receive only `Continúa ContaGest`, discover the live state, load the minimum relevant context, and continue existing work without asking the owner to restate project history.

## 2. Goals

- Deterministic, low-token cold start.
- One authority per responsibility rather than copied mutable state.
- Graphify for architecture/navigation without business or release authority.
- Small persistent contracts for routed agent roles.
- Mandatory Skill Contract v2 for project-owned skills.
- Expanded deterministic risk routing for current project domains.
- Duplicate-work detection before new branches/PRs are created.
- SHA-bound PASS/FAIL/BLOCKED/NOT_EXECUTED evidence.
- Preservation of existing financial, tenant, privacy, security, accessibility and release invariants.

## 3. Non-goals

- Do not replace GitHub Issues/PRs as live work-state authority.
- Do not commit the full Graphify graph/reports by default.
- Do not add Graphify as a production Python dependency.
- Do not make an LLM/agent financial, authorization or release authority.
- Do not auto-merge, auto-deploy or auto-close merely because bootstrap identifies a next action.
- Do not make a manually edited snapshot the canonical current SHA.
- Do not load every skill/agent profile for every task.

## 4. Authority model

The Context Plane SHALL preserve this precedence:

1. Explicit owner instruction for the current task.
2. `AGENTS.md` plus project-owned security/accounting/accessibility policy.
3. Live Git/GitHub state for branch/SHA/issues/PR/checks.
4. Project-owned agent profiles and project-owned skills.
5. Deterministic router output and repository contracts/tests.
6. Graphify-generated repository intelligence.
7. Pinned external skills/references.
8. Historical chats, comments, reports and advisory research.

Graphify may locate ownership, paths, dependencies and communities. Material correctness claims must still be verified against authoritative source/tests/runtime/evidence.

## 5. Target layout

```text
.agents/
├── context/
│   ├── BOOTSTRAP.md
│   ├── CONTEXT_CONTRACT.md
│   ├── WORK_QUEUE.json
│   └── PROJECT_MAP.json
├── agents/
│   ├── orchestrator.md
│   ├── accounting.md
│   ├── backend-api.md
│   ├── dbre.md
│   ├── appsec-iam.md
│   ├── frontend-pwa-ux.md
│   ├── hipico-reliability.md
│   └── qa-release.md
└── skills/
    └── ... existing skills ...
```

Generated/local state remains outside versioned authority:

```text
graphify-out/
artifacts/
```

## 6. BOOTSTRAP.md contract

`BOOTSTRAP.md` is the cold-start entry point and SHALL remain intentionally small. It describes the algorithm for discovering current state, not a copy of current state.

Required sequence:

1. Read `AGENTS.md` and `.agents/context/BOOTSTRAP.md`.
2. Resolve repository root, current HEAD/branch and live/default `main` SHA.
3. Load `.agents/context/WORK_QUEUE.json` only as owner ordering hints.
4. Resolve live issue/PR state before selecting work.
5. Detect existing PR/work claims for the selected ticket before creating a branch.
6. Determine Graphify availability and exact-SHA freshness.
7. Use a budgeted Graphify query for architecture/dependency discovery when useful.
8. Run deterministic risk routing.
9. Load only routed agent profiles and the minimum relevant skills, targeting 2–4 skills for ordinary tasks.
10. Continue existing work when present; create new work only when no conflicting work claim exists.
11. Bind verification to the exact candidate SHA and preserve release-evidence vocabulary.

Historical chat text must not be required for normal repository continuation.

## 7. WORK_QUEUE.json

`WORK_QUEUE.json` is a minimal ordering hint, not a mirror of issue bodies.

Illustrative shape only; live GitHub state always wins:

```json
{
  "schemaVersion": 1,
  "source": "github-live",
  "metaIssue": 553,
  "queue": [562, 563, 564, 565, 566, 567, 549, 550, 588, 589, 590, 554, 235, 236, 282, 547, 548]
}
```

Rules:

- Store issue IDs/order plus only minimal routing metadata.
- Closed/not-planned tickets are skipped automatically.
- An active non-superseded claim is continued, not restarted.
- Acceptance criteria stay in the issue/authoritative contracts rather than being copied here.

## 8. PROJECT_MAP.json

`PROJECT_MAP.json` contains stable navigation pointers, never mutable status:

- platform/financial/commercial/operations/vertical roots;
- canonical schema/migration locations;
- canonical route catalog and visual authority;
- Hípico domain/adapter boundaries;
- QA/evidence entry points;
- agent/skill/router locations.

Its purpose is to reduce discovery tokens before Graphify is needed.

## 9. Agent profile contract

Every stable agent ID emitted by routing SHALL resolve to a versioned profile under `.agents/agents/`.

Each profile remains small and contains:

```text
id + name
Purpose
Triggers
Reads
Owns
Does not own
Required invariants
Expected outputs
Escalation / stop conditions
```

Initial profiles:

- `orchestrator.md` — work routing and authority-overlap prevention.
- `accounting.md` — financial posting/reconciliation/fiscal integrity.
- `backend-api.md` — APIs, domain services, idempotency and integration boundaries.
- `dbre.md` — PostgreSQL authority, migrations, RLS, concurrency and recovery concerns.
- `appsec-iam.md` — auth, RBAC, tenant isolation, privacy/security review.
- `frontend-pwa-ux.md` — React/MUI, PWA/offline, design system, accessibility and runtime UX.
- `hipico-reliability.md` — WhatsApp adapter, autonomous operation, outbox/reconcile/recovery, always `financialAuthority=false`.
- `qa-release.md` — test selection, runtime evidence and exact-SHA release evidence.

Profiles define responsibility and reference skills; they do not duplicate full skill procedures.

## 10. Skill Contract v2

Every **project-owned** skill SHALL conform to Skill Contract v2. Vendored/external skills remain pinned external inputs and are not rewritten as project-owned.

Required sections:

1. YAML frontmatter: `name`, `description`, `contractVersion: 2`.
2. `Trigger`.
3. `Non-trigger`.
4. `Authority`.
5. `Source of truth`.
6. `Graphify probes` when useful.
7. `Inputs`.
8. `Invariants`.
9. `Workflow`.
10. `Negative tests` where applicable.
11. `Stop conditions`.
12. `Verification` commands/evidence classes without claiming execution.
13. `Output schema` with deterministic vocabulary.
14. `References` to canonical project docs instead of copied policy.

### Migration rule

- From the first Context Plane implementation commit onward, every **new or modified project-owned skill** must be v2-compliant.
- Existing non-v2 project-owned skills may exist only while explicitly listed by the validator as legacy migration targets; adding a new legacy skill is forbidden.
- Modifying a legacy project-owned skill requires upgrading it to v2 in the same change.
- The final Context Plane rollout is not complete until **zero project-owned legacy skills remain**.
- External/vendored skills are excluded from this migration count.

A repository validator SHALL enforce these rules.

## 11. Router v2

`qa/support/domain-risk-catalog.mjs` retains current domains and adds explicit routing for at least:

- `agent-system`
- `hipico-automation`
- `data-lifecycle`
- `api-governance`
- `observability`
- `supply-chain`
- `vertical-runtime`
- `privacy-sensitive`

`agent-system` SHALL match at minimum:

```text
AGENTS.md
.agents/**
agent-skills.lock.json
scripts/agent-*
scripts/*skill*
qa/support/domain-risk-catalog.mjs
```

Changes to the system governing agents must therefore receive dedicated QA/release/security gates.

Router output SHALL include stable agent IDs plus human labels, allowing direct mapping to `.agents/agents/<id>.md`.

## 12. `agent:bootstrap`

Add:

```bash
npm run agent:bootstrap
```

Expected concise human output plus a machine-readable mode:

```text
CONTAGEST_AGENT_BOOTSTRAP
repo/root
current branch + HEAD
main SHA
main drift yes/no
selected/blocked work item
existing PR/work claims
Graphify CURRENT|STALE|UNAVAILABLE
risk domains
agent profile paths
skill paths
required gate IDs
next action
```

The command SHALL NOT silently install tools, mutate GitHub, create branches, close issues, merge PRs or deploy.

Offline behavior:

- report local Git/contracts normally;
- mark GitHub-dependent state `BLOCKED_LIVE_STATE` or equivalent;
- never promote stale Markdown to live truth.

## 13. Graphify exact-SHA awareness

Graphify remains local/generated. Project tooling SHALL record the repository source SHA after a successful project Graphify build/update in ignored `graphify-out/` metadata.

Freshness is exact:

```text
bound Graphify source SHA == local HEAD SHA  => CURRENT
bound Graphify source SHA != local HEAD SHA  => STALE
no usable graph/binding                      => UNAVAILABLE
```

There is no “sufficiently recent” state.

Additional rules:

- `STALE` recommends/permits an explicit update path; it does not silently install a production dependency.
- Default Graphify query budget target is 600–1200 tokens and expands only when justified.
- Graphify conclusions remain navigation evidence.

Example probes:

```bash
graphify query "trace lifecycle authority and database dependencies" --budget 800
graphify path "WhatsAppBridge" "FinancialPosting"
```

## 14. Duplicate work claims

Before creating work for an issue, bootstrap/work-claim tooling SHALL inspect active PRs/claims.

Default invariant:

```text
Two active PRs with an exclusive closing claim for the same issue
=> DUPLICATE_WORK_CLAIM
```

Exclusive claims include supported `Closes #N`, `Fixes #N` and equivalent closure syntax.

CI SHALL fail closed for an unapproved duplicate exclusive claim.

Allowed exceptions are narrow and machine-readable:

- stacked work where exactly one PR is the closing owner;
- explicit parent/child relation;
- explicit supersession/replacement relation;
- diagnostic/draft PR with no exclusive closure claim.

An exception is never inferred from prose alone. The #599/#600 shape for #562 is the reference regression case.

## 15. Context freshness and drift

- Frozen baselines remain immutable historical evidence.
- `main`, open issues, open PRs and checks are live and resolved at bootstrap time when connectivity exists.
- META issues/comments are advisory indexes until reconciled to live state.
- No PASS is inherited between SHAs.
- No current runtime SHA is hardcoded into BOOTSTRAP or PROJECT_MAP.
- Before implementation/merge, drift from the design/task baseline must be detected and reconciled rather than silently ignored.

## 16. Token budget policy

Cold-start uses progressive disclosure:

1. `AGENTS.md` + `BOOTSTRAP.md`.
2. machine bootstrap summary.
3. routed agent profiles.
4. minimum task skills.
5. bounded Graphify query.
6. authoritative source files for material claims.
7. broad history/repository reads only when narrower evidence is insufficient.

Bootstrap SHALL not dump full issue bodies, full PR diffs, the full skill catalog, full Graphify reports or full test logs by default.

## 17. Verification design

Implementation SHALL add deterministic contracts for:

- context directory/file schemas;
- agent profile schema and unique stable IDs;
- Skill Contract v2 + legacy migration rules;
- router coverage for new domain classes;
- agent ID → profile resolution;
- bootstrap output schema and no-side-effect behavior;
- Graphify exact-SHA CURRENT/STALE/UNAVAILABLE logic;
- duplicate claim detection and explicit exception handling;
- package script wiring;
- CI workflow for agent-system contracts.

Implementation uses TDD: contract tests first RED for missing artifacts/behavior, then implementation without weakening the tests.

Allowed evidence vocabulary remains:

```text
PASS
FAIL
BLOCKED
NOT_EXECUTED
```

## 18. Rollout

### Phase A — Context Plane foundation

- context files;
- agent profiles;
- router v2;
- bootstrap command;
- duplicate claim gate;
- Graphify SHA binding;
- Skill Contract v2 validator and explicit legacy list.

### Phase B — zero-legacy skill normalization

Behavior-preserving migration order:

1. orchestrator
2. release evidence
3. tenant isolation/RBAC
4. accounting integrity
5. DB migration safety
6. systematic debugging
7. appsec/secure verification
8. UI/functional audit
9. BCP/DR and remaining project-owned skills

If migration reveals a real behavioral defect, characterize it separately rather than silently changing engineering semantics during formatting/refactor.

### Phase C — continuous enforcement

- CI contract for context/agents/skills/router;
- duplicate claim gate on PRs;
- drift tests preventing duplicated authorities;
- documented `Continúa ContaGest` cold start;
- zero project-owned legacy skills.

## 19. Acceptance criteria

The subsystem is complete only when all are true:

1. A fresh agent can follow one cold-start entry point without historical chat context.
2. `npm run agent:bootstrap` reports local/live identity, Graphify freshness, work claims, route/agents/skills/gates and next action without side effects.
3. Every router agent ID resolves to a versioned profile.
4. Router covers the eight new domain classes in this design.
5. **Every project-owned skill is Skill Contract v2 compliant; zero legacy project-owned skills remain.**
6. Duplicate exclusive claims are detected deterministically; #599/#600-equivalent input fails.
7. Legitimate stacked/superseding work passes only through explicit reviewable metadata.
8. Graphify CURRENT requires exact source-SHA == HEAD and `graphify-out/` remains ignored.
9. Graphify is not added to production dependencies.
10. Context files do not duplicate current SHA, issue bodies or test results as canonical mutable truth.
11. Agent-system changes route through dedicated gates.
12. Exact-SHA evidence rules are unchanged or stricter.
13. Product/runtime business behavior remains unchanged by the Context Plane foundation.

## 20. Risks and mitigations

- **Bootstrap becomes another giant prompt:** enforce concise output and progressive disclosure.
- **WORK_QUEUE becomes stale:** IDs/order only; GitHub live state wins.
- **Graphify result treated as proof:** navigation-only authority plus source verification.
- **Duplicate gate blocks legitimate stacks:** narrow explicit machine-readable exceptions.
- **Skill migration alters semantics:** behavior-preserving migration with contract tests.
- **Agent profiles duplicate skills:** profiles define responsibility; skills define method.
- **Parallel chats move main during work:** drift detection and reconciliation before implementation/merge.

## 21. Definition of Done

The Context Plane is not DONE because files exist. Completion requires contract tests, router tests, duplicate-work regression tests, bootstrap no-side-effect tests, zero project-owned legacy skills and applicable repository gates to execute on the exact candidate SHA. CI that never schedules a runner remains `NOT_EXECUTED`/`BLOCKED`, never PASS.
