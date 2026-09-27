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
3. `qa/support/domain-risk-catalog.mjs` returns named agents such as DBRE, QA and Backend/API, but those are currently nominal roles rather than versioned profiles.
4. Graphify is available for repository intelligence, but `graphify-out/` is intentionally local/ignored and cannot be the shared operational source of truth.
5. Mutable state is duplicated across GitHub issues/comments, chats and documents. It can become stale within minutes.
6. Separate agents/chats can start the same ticket without detecting existing work. The live #562 state demonstrated this with two concurrent PRs, #599 and #600.
7. New sessions repeatedly reread repository history and large documents, increasing token use and context drift.

The target experience is that a new agent can receive only `Continúa ContaGest`, discover the live state, load only the minimum relevant context, and continue the existing work without asking the owner to restate project history.

## 2. Goals

- Make cold-start agent work deterministic and low-token.
- Keep one authority per responsibility instead of copying mutable state into Markdown.
- Make Graphify useful for architecture/navigation without making it business or release authority.
- Convert nominal agent names into small, persistent role contracts.
- Introduce a mandatory Skill Contract v2 for project-owned skills.
- Expand deterministic risk routing to current project domains.
- Detect duplicate work claims before an agent creates parallel work.
- Keep all PASS/FAIL/BLOCKED/NOT_EXECUTED claims SHA-bound.
- Preserve existing financial, tenant, privacy, security, accessibility and release invariants.

## 3. Non-goals

- Do not replace GitHub Issues/PRs as the live work-state authority.
- Do not commit the full Graphify graph or Graphify reports by default.
- Do not add Graphify as a production Python dependency.
- Do not turn an LLM/agent into financial, authorization or release authority.
- Do not auto-merge, auto-deploy or auto-close issues merely because the bootstrap identifies a next action.
- Do not make a manually edited snapshot the canonical current SHA.
- Do not require every skill/agent file to be loaded on every task.

## 4. Authority model

The Context Plane SHALL preserve this precedence:

1. Explicit owner instruction for the current task.
2. `AGENTS.md` project contract and project-owned security/accounting/accessibility policy.
3. Live Git/GitHub state for branch/SHA/issues/PR/checks.
4. Project-owned agent profiles and project-owned skills.
5. Deterministic router output and repository contracts/tests.
6. Graphify-generated repository intelligence.
7. Pinned external skills/references.
8. Historical chats, comments, reports and advisory research.

Graphify may locate ownership, paths, dependencies and communities. Material correctness claims must still be verified against source/tests/runtime/evidence.

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

`BOOTSTRAP.md` SHALL be the cold-start entry point and remain intentionally small. It SHALL describe the algorithm for discovering current state, not duplicate current state.

Required cold-start sequence:

1. Read `AGENTS.md` and `.agents/context/BOOTSTRAP.md`.
2. Resolve repository root, current HEAD, branch and live/default `main` SHA.
3. Load `.agents/context/WORK_QUEUE.json` as owner ordering hints only.
4. Resolve live issue/PR state before selecting work.
5. Detect an existing PR/work claim for the selected ticket before creating a branch.
6. Check whether a local Graphify graph exists and is bound to a sufficiently current source SHA.
7. Use a budgeted Graphify query for architecture/dependency discovery when useful.
8. Run deterministic risk routing.
9. Load only the agent profiles and 2–4 minimum skills required by the router/task.
10. Continue existing work when present; create new work only when no conflicting work claim exists.
11. Bind verification to the candidate SHA and preserve release-evidence vocabulary.

A new chat must not need historical chat text to understand the repository's normal engineering process.

## 7. WORK_QUEUE.json

`WORK_QUEUE.json` SHALL be a minimal ordering hint, not a mirror of issue bodies.

Example shape:

```json
{
  "schemaVersion": 1,
  "source": "github-live",
  "metaIssue": 553,
  "queue": [562, 563, 564, 565, 566, 567, 549, 550, 588, 589, 590, 554, 235, 236, 282, 547, 548]
}
```

Rules:

- IDs only plus minimal metadata needed for ordering.
- Live GitHub state wins over this file.
- Closed/not-planned tickets are skipped automatically.
- A ticket with an active non-superseded work claim is continued, not restarted.
- The queue may be updated by the owner without copying acceptance criteria into the file.

## 8. PROJECT_MAP.json

`PROJECT_MAP.json` SHALL contain stable navigation pointers, not mutable status:

- platform/financial/commercial/operations/vertical roots;
- canonical schema/migration locations;
- canonical route catalog;
- canonical visual authority;
- Hípico domain/adapter boundaries;
- QA/evidence entry points;
- agent/skill/router locations.

Its purpose is to reduce discovery tokens before Graphify is required.

## 9. Agent profile contract

Named agents returned by routing SHALL map to versioned profiles under `.agents/agents/`.

Each profile SHALL be small and follow:

```text
Name
Purpose
Triggers
Reads
Owns
Does not own
Required invariants
Expected outputs
Escalation/stop conditions
```

Initial profiles:

- `orchestrator.md`: route work and prevent authority overlap.
- `accounting.md`: financial posting/reconciliation/fiscal integrity.
- `backend-api.md`: API contracts, domain services, idempotency, integration boundaries.
- `dbre.md`: PostgreSQL authority, migrations, RLS, concurrency, restore concerns.
- `appsec-iam.md`: auth, RBAC, tenant isolation, privacy/security review.
- `frontend-pwa-ux.md`: React/MUI, PWA/offline, design-system/accessibility/runtime UX.
- `hipico-reliability.md`: WhatsApp adapter, autonomous operation, outbox/reconcile/recovery with financialAuthority=false.
- `qa-release.md`: test selection, runtime evidence, exact-SHA/release evidence.

A profile SHALL reference skills rather than repeat their full contents.

## 10. Skill Contract v2

Project-owned skills SHALL conform to a common schema.

Required sections:

1. YAML frontmatter: `name`, `description`, `contractVersion: 2`.
2. `Trigger` — when the skill must be used.
3. `Non-trigger` — when not to load it.
4. `Authority` — what the skill may and may not decide.
5. `Source of truth` — authoritative repository files/contracts.
6. `Graphify probes` — optional compact queries/paths useful for the domain.
7. `Inputs` — minimum context required.
8. `Invariants` — non-negotiable rules.
9. `Workflow` — deterministic execution sequence.
10. `Negative tests` — required failure/abuse cases where applicable.
11. `Stop conditions` — conditions that block unsafe progression.
12. `Verification` — exact commands/evidence classes, without claiming execution.
13. `Output schema` — deterministic result vocabulary.
14. `References` — links to canonical project docs instead of copied policy.

The contract SHALL be enforced by a repository validator. A skill failing v2 validation cannot be treated as a senior project-owned skill.

Migration SHALL be progressive but explicit: existing skills become `v2-compliant` one at a time or through a controlled batch; external/vendored skills are not rewritten as if project-owned.

## 11. Router v2

`qa/support/domain-risk-catalog.mjs` SHALL retain current domains and add explicit routing for at least:

- `agent-system`
- `hipico-automation`
- `data-lifecycle`
- `api-governance`
- `observability`
- `supply-chain`
- `vertical-runtime`
- `privacy-sensitive`

The `agent-system` domain SHALL match at minimum:

```text
AGENTS.md
.agents/**
agent-skills.lock.json
scripts/agent-*
scripts/*skill*
qa/support/domain-risk-catalog.mjs
```

Changes to the system that governs agents SHALL therefore receive their own QA/release/security gates rather than silently bypass routing.

The router SHALL emit stable IDs for agents as well as human labels so scripts can map a route result directly to `.agents/agents/<id>.md`.

## 12. `agent:bootstrap`

Add a deterministic command:

```bash
npm run agent:bootstrap
```

Expected machine-readable + concise human output:

```text
CONTAGEST_AGENT_BOOTSTRAP
repo/root
current branch + HEAD
main SHA
main drift yes/no
work item selected/blocked
existing PR/work claims
Graphify status CURRENT|STALE|UNAVAILABLE
risk domains
agent profile paths
skill paths
required gate IDs
next action
```

The command SHALL not silently install global tools, mutate GitHub, create branches, close issues, merge PRs or deploy.

Offline behavior:

- local Git state and repository contracts are still reported;
- GitHub-dependent fields become `BLOCKED_LIVE_STATE`/equivalent machine state;
- no stale Markdown is promoted to live truth.

## 13. Graphify SHA-awareness

Graphify remains local/generated. Add project tooling around it so bootstrap can determine whether repository intelligence is current.

Required behavior:

- capture source repository SHA when a project Graphify build/update completes;
- store the binding under ignored `graphify-out/` metadata;
- bootstrap compares bound Graphify SHA to local HEAD;
- `CURRENT` only when binding is valid for the current source state;
- `STALE` triggers a recommendation/update path, never an implicit production dependency install;
- queries default to bounded budgets (target 600–1200 tokens) and expand only when needed.

Example probes:

```bash
graphify query "trace lifecycle authority and database dependencies" --budget 800
graphify path "WhatsAppBridge" "FinancialPosting"
```

## 14. Duplicate work claims

Before creating new work for an issue, tooling SHALL inspect open PRs/work claims.

Default invariant:

```text
Two active PRs that both make an exclusive closing claim for the same issue
=> DUPLICATE_WORK_CLAIM
```

Examples of exclusive claims include `Closes #N`, `Fixes #N` and equivalent supported syntax.

CI SHALL fail closed for an unapproved duplicate exclusive claim.

Allowed exceptions:

- explicitly stacked work where exactly one PR is the closing owner;
- an explicit machine-readable override documenting parent/child or supersession relationship;
- a diagnostic/draft PR that does not claim issue closure.

An exception SHALL never be inferred from prose alone. It must be explicit, reviewable and narrow.

The #599/#600 shape for #562 is the reference regression case.

## 15. Context freshness and drift

The Context Plane SHALL distinguish immutable/historical and live state:

- frozen baselines remain immutable evidence and are labeled historical;
- `main`, open issues, open PRs and checks are live and must be queried/resolved at bootstrap time when connectivity exists;
- comments and META issues are advisory indexes unless their claims are reconciled to live state;
- no PASS is inherited from an earlier SHA;
- no current SHA is hardcoded in BOOTSTRAP/PROJECT_MAP as runtime truth.

## 16. Token budget policy

Cold-start should favor progressive disclosure:

1. `AGENTS.md` + `BOOTSTRAP.md`.
2. machine bootstrap summary.
3. selected agent profiles.
4. minimum task skills.
5. bounded Graphify query.
6. authoritative source files for material claims.
7. broad repository/history reads only when the narrower path is insufficient.

The bootstrap output SHALL not dump full issue bodies, full PR diffs, entire skill catalog, full Graphify reports or full test logs by default.

## 17. Verification design

Implementation SHALL add deterministic contracts for at least:

- context directory/file schema;
- agent profile schema and unique IDs;
- Skill Contract v2 validation;
- router coverage for new domain classes;
- agent ID → profile resolution;
- bootstrap output schema and no-side-effect behavior;
- stale/current Graphify binding logic;
- duplicate work claim detection and explicit exception handling;
- package script wiring;
- CI workflow for agent-system contracts.

The implementation must use TDD: contract tests first RED for missing artifacts/behavior, then implementation without weakening tests.

Required evidence vocabulary remains:

```text
PASS
FAIL
BLOCKED
NOT_EXECUTED
```

## 18. Rollout

### Phase A — foundation

- context contract + BOOTSTRAP/PROJECT_MAP/WORK_QUEUE;
- agent profiles;
- router v2;
- bootstrap command;
- duplicate work claim gate;
- Graphify SHA binding;
- Skill Contract v2 validator.

### Phase B — skill normalization

Refactor project-owned skills to v2 by risk/usage priority, starting with:

1. orchestrator
2. release evidence
3. tenant isolation/RBAC
4. accounting integrity
5. DB migration safety
6. systematic debugging
7. appsec/secure verification
8. UI/functional audit
9. BCP/DR and remaining project-owned skills

The refactor SHALL preserve semantics unless a separately characterized defect is found.

### Phase C — continuous enforcement

- CI contract for context/agents/skills/router;
- duplicate claim gate on PRs;
- drift tests preventing reintroduction of duplicated authorities;
- documentation for `Continúa ContaGest` cold start.

## 19. Acceptance criteria

The design is implemented when all are true:

1. A fresh agent can follow one documented cold-start entry point without historical chat context.
2. `npm run agent:bootstrap` reports live/local identity, Graphify freshness, selected work state, route/agents/skills/gates and next action without side effects.
3. Every router agent ID resolves to a versioned profile.
4. Router covers the eight new domain classes listed in this design.
5. Project-owned senior skills validate against Skill Contract v2 according to the agreed migration gate.
6. Duplicate exclusive issue claims are detected deterministically; #599/#600-equivalent input fails.
7. Approved stacked/superseding work can pass only via an explicit reviewable exception.
8. Graphify current/stale status is SHA-aware while `graphify-out/` remains ignored.
9. No production dependency is added for Graphify.
10. Context files do not duplicate current SHA/issue bodies/test results as canonical mutable truth.
11. Agent-system changes route through dedicated gates.
12. Exact-SHA evidence rules remain unchanged or stricter.
13. Existing product behavior remains unchanged by Phase A.

## 20. Risks and mitigations

- **Risk: bootstrap becomes another giant prompt.** Mitigation: strict concise output and progressive disclosure.
- **Risk: WORK_QUEUE becomes stale.** Mitigation: IDs/order only; GitHub live state always wins.
- **Risk: Graphify result treated as proof.** Mitigation: navigation-only authority and source verification requirement.
- **Risk: duplicate gate blocks legitimate stacks.** Mitigation: explicit narrow machine-readable exception.
- **Risk: skill migration changes engineering semantics.** Mitigation: behavior-preserving v2 normalization plus contract tests.
- **Risk: agent roles duplicate skills.** Mitigation: profiles define responsibility and references; skills define method.
- **Risk: parallel chats mutate main while another agent is planning.** Mitigation: bootstrap drift detection and rebase/reconcile before implementation/merge.

## 21. Definition of Done for this subsystem

The Context Plane itself is not DONE because files exist. Completion requires contract tests, router tests, duplicate-work regression tests, bootstrap no-side-effect tests and applicable repository gates to execute on the exact candidate SHA. CI infrastructure that never schedules a runner remains `NOT_EXECUTED`/`BLOCKED`, never PASS.
