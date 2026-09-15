# Control Hípico v8 — Behavior-Preserving Refactor Design

## Context

Implementations 1–7 have grown Control Hípico from adapters and canonical domain/API foundations into a production-oriented stack with Command Center, canonical outbound delivery, deterministic risk policy, Agent/Shadow evaluation, and dual-window promotion metrics. The result is functionally richer, but several core files now combine policy, validation, persistence, orchestration, serialization, and compatibility responsibilities.

Implementation 8 is deliberately **not a feature ticket**. It is a compatibility-first refactor whose only product-level requirement is that observable behavior remains unchanged while internal boundaries become easier to understand, test, and maintain.

The refactor is stacked on `feat/hipico-shadow-metrics-v7`. It inherits the verification status of PR #348 and PR #351; an infrastructure-blocked parent is not silently reclassified as green by this work.

## Goal

Improve readability, internal cohesion, testability, and maintainability of the Control Hípico code introduced or materially evolved through Implementations 1–7 without removing functionality, renaming public APIs, changing essential input/output contracts, weakening safety gates, or changing runtime decisions for equivalent inputs.

## Non-goals

- No new business capability.
- No new automation authority.
- No changes to promotion thresholds, risk dispositions, outbound retry semantics, reconciliation semantics, SOURCE/LAB policy, or financial authority.
- No framework migration.
- No React/MUI rewrite.
- No schema redesign and no edits to already-applied historical migrations.
- No endpoint renames, route removals, response reshaping, or error-code cleanup.
- No broad ERP refactor outside the Hípico vertical.
- No performance optimization that changes ordering, timing semantics, locking behavior, retry timing, or idempotency.

## Compatibility invariants

For the same persisted state, environment, authenticated principal, and request/input, pre-v8 and post-v8 behavior must remain equivalent.

The following are frozen public contracts:

1. Existing Hípico route paths and HTTP methods.
2. Existing success/error HTTP status behavior.
3. Existing JSON field names and required/optional semantics. New fields are out of scope.
4. Existing exported public function/class names and externally consumed method names.
5. Existing essential input/output variable names where they participate in documented or test-covered contracts.
6. Existing error codes and idempotency mismatch semantics.
7. Existing environment variable names and fail-closed defaults.
8. Existing database table/column names and migration history.
9. Existing automation states and adjacent-only transition rules.
10. Existing `AUTO | SUGGEST | HUMAN_REQUIRED | DENY` decisions and reason codes.
11. Existing golden-corpus case scoring and signature semantics.
12. Existing outbox states, lease ownership rules, delivery ambiguity handling, receipts, cooldown, and reconciliation behavior.
13. SOURCE remains SHADOW/read-only where currently enforced; LAB remains isolated.
14. `financialAuthority=false` and no LLM direct writes remain invariant.
15. Command Center operational states, DOM/test hooks, offline/stale semantics, and theme/accessibility behavior remain unchanged unless a characterization test proves exact equivalence.

## Approaches considered

### A. Façade-preserving incremental extraction — selected

Keep every current public module path as a compatibility façade and move cohesive private behavior behind it in small, test-first steps. Each extraction is protected by characterization tests before code moves.

Advantages:
- lowest compatibility risk;
- callers do not need coordinated migration;
- easy to review and revert one extraction at a time;
- allows public contracts to remain stable while internals improve.

Trade-off: temporary delegation layers remain, but they are intentional compatibility boundaries rather than accidental duplication.

### B. In-place cleanup only

Rename private locals, shorten functions, and remove duplication without creating new internal modules.

This has a small diff but leaves large mixed-responsibility files such as `agent-policy.ts`, `automation.store.ts`, and `hipico-bot.service.ts` structurally coupled. It does not sufficiently improve long-term maintainability.

### C. Big-bang module rewrite — rejected

Reorganize the entire Hípico vertical and update all imports in one pass.

This produces the cleanest theoretical tree but is incompatible with the requirement of exact behavior preservation and the current CI infrastructure limitations. It also makes regression attribution unnecessarily difficult.

## Refactor boundary

Implementation 8 protects the behavior of all Implementations 1–7, but it will **only modify hotspots where extraction measurably improves separation of concerns**. Unaffected Hípico files are covered by compatibility tests and left untouched.

Primary hotspots:

- `backend/src/modules/hipico/agent-policy.ts`
- `backend/src/modules/hipico/automation.store.ts`
- `backend/src/modules/hipico/shadow-metrics.ts`
- `backend/src/modules/hipico/agent-golden.ts`
- `backend/src/modules/hipico/agent.routes.ts`
- `backend/src/modules/hipico-bot/hipico-bot.service.ts`
- canonical outbox policy/store/worker modules where duplicate validation or state classification exists
- Command Center shell/render modules only if a characterization test exposes safe internal duplication worth extracting

Already-small single-purpose modules are not churned merely for naming symmetry.

## Target architecture

### 1. Public compatibility façades

Current public import paths stay valid. Existing exports continue to originate from the same file paths even when implementation moves internally.

Examples:

- `agent-policy.ts` continues exporting `AUTOMATION_STATES`, `canPromoteAutomation`, `agentCanAct`, `safeToolRequest`, `validateModelCandidate`, `HipicoAgentEngine`, and existing public types.
- `automation.store.ts` continues exporting `AutomationStore` with the same public methods: `metrics`, `read`, `get`, `setMode`, `recordEvaluation`, `review`, `evaluations`, `transitionEvents`.
- `agent-golden.ts` continues exporting `scoreGoldenCorpus(value, parser)` with identical existing fields/signature semantics.
- canonical outbox public functions remain available from their existing paths.

A façade may re-export a symbol or delegate to an internal module, but consumer-facing names and behavior do not move.

### 2. Pure policy layer

Extract deterministic, side-effect-free policy from large modules into focused internal modules. Candidate targets:

- promotion thresholds/rate evaluation;
- candidate/tool validation and argument sanitization;
- deterministic risk decision helpers;
- metric normalization/signature helpers;
- outbound failure/state classification where currently duplicated.

No policy constants or thresholds change during extraction.

### 3. Persistence layer

Split SQL-oriented concerns from orchestration while preserving transaction boundaries.

For Agent/Shadow, internal repositories may separate:

- metric reads;
- automation state reads/writes;
- transition-event persistence;
- evaluation persistence/review.

`AutomationStore` remains the transaction/orchestration façade. Advisory locking, `FOR UPDATE`, append-only evidence, idempotency checks, and the single-snapshot promotion decision must remain in the same transactional order as before.

For outbound delivery, policy/state classification remains separate from raw persistence and transport. Lease ownership and ambiguous-delivery fail-closed behavior must not move across a transaction boundary.

### 4. Route layer

Routes remain thin adapters. Reusable parsing/auth/error helpers may be extracted only when:

- route paths stay identical;
- strict Zod schemas stay equivalent;
- status mapping stays identical;
- no client-supplied field gains authority;
- `Cache-Control: no-store` and operator authentication remain in place.

### 5. Serialization/read models

Response/read-model construction may be extracted into pure mappers. Existing JSON shape and omission/null behavior are characterized first and preserved.

Command Center refactoring is limited to internal rendering/read-model helpers. DOM hooks, aria-live behavior, loading/error/offline/stale/unavailable states, 44px interactions, theme behavior, and PWA/Android parity are not redesigned.

## Characterization-first strategy

Before each production extraction, add a test that describes current observable behavior. The production change is allowed only after the test can detect a deliberately introduced incompatibility or, where CI cannot execute, the exact RED attempt is recorded as infrastructure-blocked.

Characterization coverage must include at minimum:

- all exported Agent policy functions and their current reason codes;
- promotion boundary matrices, including historical/recent metrics;
- model candidate never obtaining autonomous authority;
- tool argument sanitization and injection rejection;
- golden scorer existing fields and SHA-256 signature;
- `AutomationStore` idempotent transition replay and immutable snapshot behavior;
- route schemas/status/error contracts;
- SOURCE SHADOW-only behavior;
- canonical outbox idempotency, lease, retry/reconciliation and receipt ordering;
- public operator/webhook outbound route contracts;
- Command Center read-model states if any frontend/backend Command Center code is touched.

Where practical, tests assert behavior rather than source text. Static source-contract tests remain only for architectural invariants that cannot be observed cheaply at runtime.

## Detailed extraction plan

### Agent policy façade

`agent-policy.ts` is currently responsible for automation state definitions, promotion math, model candidate validation, tool authorization/sanitization, automatic-action eligibility, and Agent engine orchestration. V8 will separate these private responsibilities while leaving the public façade intact.

Proposed internal units:

- `agent-promotion-policy.ts` — rates, thresholds, adjacent-transition gate.
- `agent-tool-policy.ts` — tool allowlists and argument sanitization.
- `agent-candidate-policy.ts` — model candidate schema normalization.

If an extraction introduces circular imports, the unit is reduced rather than adding an inversion framework.

### Agent persistence façade

`automation.store.ts` remains the public class. Internal units may include:

- `automation-scope.ts` — scope validation, SOURCE default/read-only helpers, advisory-lock key.
- `automation-metrics.repository.ts` — historical/recent/by-intent reads and snapshot assembly.
- `automation-evaluation.repository.ts` — evaluation insert/review/list SQL.
- `automation-transition.repository.ts` — transition read/insert SQL.

`setMode()` retains one transaction covering scope lock → idempotency replay check → current state lock → metric snapshot → policy decision → optional mode update → transition-event insert.

### Golden/scoring utilities

Golden aggregation may reuse pure metric helpers only if doing so leaves the existing score result and signature byte-for-byte compatible for the same corpus. The existing case array remains the signature input.

### Outbound subsystem

Only duplicated or mixed-responsibility code is extracted. `public.hipico_outbox` remains the authority. The following are frozen:

- semantic payload digest behavior;
- idempotency-key mismatch behavior;
- lease claim rules;
- retry vs `reconciliation_required` classification;
- provider acceptance vs sent/delivered/read semantics;
- receipt monotonicity;
- approval-required claim boundary;
- runner disabled-by-default behavior.

### Command Center

No visual redesign. If touched, extraction is limited to pure formatting/read-model helpers with screenshot/browser/source contract equivalence. No CSS/token restructuring belongs in v8.

## Efficiency rules

“Efficiency” in this refactor means reducing duplicated computation, repeated parsing, and unnecessary object reconstruction **without changing externally observable timing semantics or database concurrency behavior**.

Allowed examples:

- compute normalized scope once and pass it internally;
- reuse a pure rate-calculation helper instead of duplicating formulas;
- reuse bounded-string/validation helpers when semantics are identical;
- avoid serializing the same canonical snapshot multiple times within one request.

Not allowed:

- removing locks for speed;
- parallelizing DB writes whose order is part of safety;
- changing retry/backoff/cooldown values;
- changing cache behavior;
- memoizing live race data across requests;
- batching operations if it changes error isolation or ordering.

## Error handling

Existing public error codes remain frozen. Internal modules may use typed/private errors, but façades must map them back to the exact existing public codes/status behavior.

No catch block may convert a fail-closed condition into success or retry. No new generic fallback may hide reconciliation, authorization, or persistence errors.

## Database and migration policy

V8 does not edit v22/v23/v24 or any earlier applied migration. No new database migration is expected because behavior and schema are unchanged.

If implementation unexpectedly requires schema change, stop and reclassify that work as a separate feature/migration ticket rather than hiding it inside the refactor.

## Testing and equivalence gates

V8 must add a dedicated characterization/equivalence suite and an exact-SHA workflow. Required gates:

1. `npm --workspace backend run typecheck`
2. `npm --workspace backend run test:hipico`
3. `npm --workspace backend run test:hipico:agent`
4. `npm --workspace backend run build`
5. existing Command Center/browser contract gates if Command Center code changes
6. `git diff --check`
7. exact candidate SHA + clean tree

Additional equivalence checks:

- exported public symbol manifest for touched façade modules;
- fixture matrix comparing pre/post pure policy outputs;
- fixed golden corpus preserves existing signature;
- route contract/source manifest preserves paths/methods/schemas/error codes;
- no migration files changed relative to v7 baseline;
- no new financial-authority path, SQL/shell tool, or SOURCE automatic enablement.

Because GitHub Actions is currently producing jobs with no executed steps, `steps=[]`/`steps=null`/`runner_id=0` remains `BLOCKED_INFRASTRUCTURE`; it can never be counted as PASS.

## Rollout and review strategy

Refactor in small commits by responsibility:

1. characterization contracts only;
2. pure Agent policy extraction;
3. Agent persistence extraction;
4. golden/metric helper deduplication;
5. outbound cleanup where justified;
6. route/read-model cleanup where justified;
7. final no-behavior-drift audit.

After each extraction, inspect the diff specifically for public export changes and moved transaction boundaries. If a cleanup requires a behavior change, defer it to a separate implementation/ticket.

## Acceptance criteria

Implementation 8 is acceptable only if:

- all existing public Hípico APIs remain available with the same names/signatures;
- essential request/response fields and error codes remain unchanged;
- no route path/method changes;
- no historical migration edits;
- no policy threshold/reason/state changes;
- no change to outbox authority or delivery ambiguity safety;
- no change to SOURCE/LAB/financial safety boundaries;
- golden signature is unchanged for the fixed corpus;
- transaction/lock/idempotency behavior is preserved;
- characterization tests cover every touched façade before extraction;
- exact-SHA verification is executed successfully, or the implementation remains explicitly `BLOCKED` rather than being declared complete.

## Risk controls

The principal risk is accidental semantic drift disguised as cleanup. The mitigation is to prefer duplication over risky abstraction whenever two code paths are only superficially similar. A shared helper is created only when inputs, outputs, error semantics, normalization rules, and security context are genuinely identical.

The second risk is refactoring on top of unverified parent PRs. V8 therefore remains stacked and inherits parent blockers. It must not be used to infer that v6/v7 are green.
