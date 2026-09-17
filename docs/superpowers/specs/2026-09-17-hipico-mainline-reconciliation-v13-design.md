# Control Hípico Mainline Reconciliation v13 — Design

## Goal

Reconciliar de forma semántica las implementaciones Hípico 9→12 con el `main` actual sin sobrescribir la evolución posterior del repositorio, sin duplicar capacidades ya integradas y sin convertir evidencia no ejecutada en PASS.

## Baseline and lineage

- Target branch: `main`
- Approved baseline: `ab02c550f24c3347121d8c74c636b450245036ac`
- Working branch: `feat/hipico-mainline-reconciliation-v13`
- Historical merge base for v9→v12: `d40a00134104bd7f6ad3d72e9b6ff267a7b94f75`
- v9 candidate: `5c285ce12ff0f62f4fc69fade57dff447015b81e`
- v10 candidate: `b8aeb88242dcc8e3ecd15501d113a97dd4cd0146`
- v11 candidate: `dc81330ee1e6c8d59cf14cac854520449e8a5851`
- v12 branch head: `5b36fc5965d7e654ef63c3c1baba3408fce7b0c7`

GitHub compare shows the stacked chain is not a descendant of current `main`:

- v9: 27 commits ahead / 43 behind current `main`.
- v10: 41 commits ahead / 43 behind.
- v11: 50 commits ahead / 43 behind.
- v12: 54 commits ahead / 43 behind.

Therefore this work MUST NOT merge or cherry-pick the stacked branch wholesale. The reconciliation is behavior-first and file-by-file.

## Non-negotiable invariants

The reconciliation cannot weaken any of the following:

- `SOURCE = READ_ONLY`.
- During QA, LAB is the only permitted write destination.
- `financialAuthority = false`.
- LLMs do not write directly to the database.
- LLMs do not settle money, grant financial authority or bypass deterministic policy.
- PostgreSQL server remains authoritative; IndexedDB is projection/offline/outbox only.
- Multi-group state remains scoped by `ownerId + groupKey + groupId` and race/meeting scope where applicable.
- Dedupe, idempotency, replay protection, leases, receipts and reconciliation cannot regress.
- Canonical outbox/send authority remains the only external-delivery authority.
- Human-review and reconciliation history remain append-only/auditable where the current schema requires it.
- No `skip`, `only`, artificial sleeps, forced browser interactions, disabled suites, `continue-on-error` or `|| true` may be introduced to manufacture green CI.
- A GitHub job with no runner/steps/logs is `BLOCKED_INFRASTRUCTURE`, never PASS and never a demonstrated product failure.
- Every PASS must reference the exact candidate SHA that executed it.

## Architectural approach

Use current `main` as the authority for all files that evolved after the stacked merge base. For every v9→v12 artifact, classify it before editing:

- `PRESENT`: equivalent or stronger behavior is already in current `main`; do not port old code.
- `MISSING`: behavior/file does not exist in `main`; port it against current interfaces.
- `SUPERSEDED`: current `main` has a newer implementation serving the same contract; preserve current implementation and adapt tests/contracts if required.
- `CONFLICT`: both lines changed the same behavior and neither can be accepted mechanically; write a characterization regression first, then reconcile intentionally.

The classification is about behavior and contracts, not just filenames.

## Reconciliation scope

### v9 — Production QA / release hardening

Review against current `main`:

- `.github/workflows/hipico-production-gates-v290.yml`
- `scripts/hipico-apply-e2e-schema-v290.mjs`
- `scripts/hipico-ci-verdict-v290.mjs`
- `scripts/hipico-release-guard-v290.mjs`
- `scripts/hipico-release-readiness-v9.mjs`
- `scripts/hipico-release-report-v290.mjs`
- `scripts/hipico-verify-evidence-v290.mjs`
- v9 root contracts and PostgreSQL-chain contracts.
- accessibility helper and smoke coverage only if current `main` does not already contain equivalent or stronger behavior.

Required behavior to preserve/recover:

- exact-SHA evidence;
- PostgreSQL chain covering risk policy + shadow metrics migrations already present in the current schema line;
- fail-closed readiness when automation/security/P0 evidence is absent;
- runner-aware CI verdict;
- Chromium PR gate and browser matrix without fabricated results;
- security/performance/Android artifacts tied to the same SHA.

### v10 — Golden/adversarial corpus

Expected primarily additive artifacts:

- `.github/workflows/hipico-golden-adversarial-v10.yml`
- `backend/scripts/hipico-agent-golden-v10.ts`
- `backend/src/modules/hipico/agent-adversarial-golden.ts`
- `backend/src/modules/hipico/agent-adversarial-golden.test.ts`
- `backend/src/modules/hipico/agent-adversarial-integration.test.ts`
- `backend/src/modules/hipico/corpus/hipico-agent-adversarial.v10.json`
- `tests/hipico_v10_golden_contract.test.mjs`

`agent-engine.ts` MUST NOT be replaced with the historical version. Any v10 hook into the engine must be reapplied to the current engine interface with regression coverage.

Golden evidence must remain deterministic, sanitized and fail when:

- unsafe/high-risk requests gain automatic authority;
- financial authority becomes true;
- parser/policy versions do not match the corpus contract;
- corpus cases are malformed, duplicated or unsanitized.

### v11 — Observability and support evidence

Expected additive artifacts:

- `.github/workflows/hipico-observability-v11.yml`
- `backend/src/modules/hipico-bot/hipico-observability.ts`
- `backend/src/modules/hipico-bot/hipico-observability.store.ts`
- `backend/src/modules/hipico-bot/hipico-observability.test.ts`
- `scripts/hipico-observability-v11-pg.mjs`
- `supabase/sql/hipico_v25_observability.sql`

Historical edits to these existing files are `CONFLICT` until reconciled against current `main`:

- `backend/src/modules/hipico/agent.routes.ts`
- `backend/src/modules/hipico-bot/hipico-webhook-outbound.ts`
- `backend/src/modules/hipico-bot/hipico-outbound-worker.ts`

Those files must keep current functionality and public contracts. Observability is an additive side effect only and cannot become a source of business authority.

Observability requirements:

- canonical stages: inbound, normalization, parser, context, risk policy, agent decision, persistence, outbox, delivery/receipt, reconciliation/handoff;
- deterministic request/correlation IDs that do not expose raw provider IDs;
- exact candidate SHA where available;
- full owner/group scope internally;
- support bundles hash/redact identifying scope;
- no raw WhatsApp body/text, credentials, auth headers, tokens, cookies, destinations, phone/JID or secrets in metadata;
- observability persistence failure must not grant authority or silently turn a failed business operation into success;
- append-only database evidence and scope isolation.

The PostgreSQL migration chain must become additive through v25 if current `main` has not already introduced a later compatible migration. Existing newer migrations take precedence; v25 naming/order must not collide.

### v12 — Strict release manifest and progressive rollout contract

Expected additive artifacts:

- `.github/workflows/hipico-production-release-v12.yml`
- `scripts/hipico-release-manifest-v12.mjs`
- `tests/hipico_release_v12_contract.test.mjs`
- `docs/hipico/production-release-v12.md`

Release manifest requirements:

- exact 40-hex candidate SHA;
- deterministic signature independent of gate input ordering;
- every required gate must be PASS for the same candidate before `releaseEligible=true`;
- `BLOCKED`, `NOT_EXECUTED`, `FAIL`, missing evidence or SHA mismatch block release;
- invariant manifest keeps SOURCE read-only, LAB-only QA writes, `financialAuthority=false`, no LLM direct DB writes and no LLM settlement authority;
- progressive order remains `SHADOW → ASSISTED → AUTOMATIC_LOW_RISK → AUTOMATIC`;
- upward promotion is sequential and evidence-gated;
- rollback may always demote to SHADOW, preserves data/evidence and requires a reason;
- workflow may orchestrate a candidate but MUST NOT auto-deploy or auto-promote production.

The v12 workflow must consume current release scripts/contracts from `main`, not historical copies.

## Conflict-resolution rules

For any changed existing file:

1. Read current `main` implementation first.
2. Read the stacked version and identify the intended contract, not just textual diff.
3. Add or update a characterization/regression test that fails because the required behavior is absent from current `main`.
4. Make the smallest current-architecture change that satisfies the contract.
5. Preserve public function names and essential input/output contracts unless current `main` already intentionally superseded them.
6. Do not resurrect old code solely because it existed in v9→v12.
7. Re-run focused tests before moving to the next layer when execution is available.

## Data and migration safety

- Never apply migrations to a shared development or production database during this reconciliation.
- PostgreSQL validation must use an isolated ephemeral/local database matching the repository safety guards.
- Inspect current migration ordering before introducing v25.
- If current `main` already contains a later migration with equivalent observability schema, classify v25 as `SUPERSEDED` and adapt the v11 probe to the authoritative schema instead of creating duplicate tables/triggers.
- No destructive migration, backfill or data deletion belongs in this PR.

## Test strategy

### Characterization first

Create a v13 reconciliation contract that records expected presence/behavior without assuming historical source text. It should cover:

- v9 exact-SHA/readiness/postgres-chain invariants;
- v10 deterministic golden/adversarial evidence;
- v11 sanitized append-only observability and scope isolation;
- v12 strict release eligibility, promotion order and rollback.

For existing files with semantic conflicts, add focused failing regression tests before product edits.

### Required validation on final SHA

When the execution environment permits:

- `npm ci` using the repository lockfile;
- root/backend/frontend typecheck as applicable;
- `npm run test:hipico`;
- focused v9/v10/v11/v12/v13 contract tests;
- PostgreSQL 16 isolated schema/migration probes;
- backend build;
- frontend build;
- Chromium/responsive/accessibility gate where current workflow applies;
- security/replay/group-isolation regressions;
- Android/PWA parity contracts where current scripts apply;
- diff whitespace check and final diff review.

Physical QA #119 and soak #120 remain external execution gates. This PR may prepare/consume their exact-SHA evidence but cannot declare them PASS without real devices/sessions and >=24h execution respectively.

## CI and evidence semantics

Allowed execution states remain explicit:

- `PASS`
- `FAIL`
- `BLOCKED`
- `NOT_EXECUTED`

GitHub-hosted jobs with `runner_id=0`, empty runner name, `steps=[]` and no logs are classified `BLOCKED_INFRASTRUCTURE` under #134.

A Vercel or other provider build may support only the gates it actually executed. It cannot substitute for PostgreSQL, browser, Android, physical QA or soak evidence it did not run.

## Delivery structure

One implementation, one branch, one PR:

- Branch: `feat/hipico-mainline-reconciliation-v13`
- Base: `main`
- PR state initially: DRAFT

The PR must contain a machine-readable reconciliation inventory or a versioned test/report that makes each v9→v12 area traceable as `PRESENT`, `MISSING`, `SUPERSEDED` or `CONFLICT` and records the current-main authority chosen for conflicts.

## Definition of implementation complete

The reconciliation implementation is complete only when:

- v9→v12 required behavior is present on the v13 branch against current `main`;
- historical implementations have not overwritten newer mainline behavior;
- all conflict decisions are covered by tests or explicit source evidence;
- PostgreSQL migration ordering is coherent and non-destructive;
- SOURCE/LAB/financial/LLM authority invariants remain fail-closed;
- final diff has been reviewed for unrelated regressions/secrets;
- one DRAFT PR to `main` exists;
- all executable checks have truthful exact-SHA statuses.

`IMPLEMENTED` does not mean `VERIFIED`. The PR remains PARTIAL/BLOCKED if GitHub infrastructure, physical QA or soak evidence is unavailable.

## Out of scope

- Enabling production writes to SOURCE.
- Granting monetary/financial authority to automation or providers.
- Closing #119 without physical device/session evidence.
- Closing #120 without a real >=24h soak.
- Closing #134 by changing tests/workflows to avoid GitHub runners.
- Unrelated ERP refactors or feature work.
- Rewriting current mainline modules merely to match historical code style.