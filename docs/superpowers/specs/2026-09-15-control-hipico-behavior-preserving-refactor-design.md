# Control Hípico — Behavior-Preserving Refactor Design

**Date:** 2026-09-15  
**Repository:** `adelvisMartin/ContaGest`  
**Design baseline:** `main@82fed2c6cc01044bf639f5b33065c10fb6309fea`  
**Status:** strategy approved by repository owner; written specification pending final owner review before implementation planning.

## 1. Purpose

Refactor the complete Control Hípico subsystem to improve readability, cohesion, maintainability, testability, efficiency where behavior-neutral, and adherence to existing project conventions **without intentionally changing product behavior**.

The campaign is explicitly a refactor, not a feature project. Public contracts, essential input/output variables, domain semantics, runtime safety, persistence semantics and operational behavior must remain equivalent before and after each wave.

The desired end state is a smaller set of well-bounded modules with single responsibilities, explicit dependencies and less duplication, while users, external clients, operators, WhatsApp integrations, PWA/Android clients and database consumers observe the same behavior.

## 2. Non-negotiable invariants

The following are hard constraints for every refactor PR.

1. **No public function rename.** Existing exported/public function names remain exactly unchanged throughout this refactor campaign.
2. **No essential input/output rename.** Existing public request fields, response fields, command arguments, event payload fields and essential domain DTO fields remain unchanged.
3. **No endpoint drift.** Existing routes, methods, exact HTTP status codes for equivalent inputs, cache headers, authentication expectations and response shapes remain unchanged.
4. **No state-machine drift.** Automation states, outbox states, race/document/provider states, SOURCE/LAB safety semantics and transition rules remain unchanged.
5. **No persistence drift.** Existing table names, existing columns, constraints, idempotency semantics, ownership scopes, RLS assumptions and transaction boundaries remain unchanged unless a separate non-refactor ticket explicitly authorizes a schema change.
6. **Historical migrations are immutable.** No previously committed/applied migration is edited for cleanup, formatting or restructuring. Any future schema correction must be an additive migration under a separately reviewed change.
7. **No security-policy drift.** Webhook signatures, operator authentication, SOURCE read-only behavior, LAB separation, secret handling, provider allowlists, fail-closed paths and audit/idempotency controls remain behaviorally equivalent in this campaign. Any security tightening that changes observable acceptance/rejection behavior is a separate change, not part of the refactor.
8. **No financial-authority expansion.** No refactor may grant Agent/LLM code new write, settlement, betting, balance or monetary authority.
9. **No cache/offline drift.** Live operational data remains subject to the same no-store/network/freshness behavior; PWA offline/stale semantics remain equivalent.
10. **No framework rewrite.** No React/MUI/framework migration is part of this campaign.
11. **No hidden compatibility removal.** Legacy adapters that are still consumed may be internally simplified but not removed without evidence that no supported consumer relies on them and a separate compatibility-removal decision.
12. **No test weakening.** Existing assertions may be rewritten only when they verify the same behavior more robustly. Tests must not be skipped, deleted or softened to make a refactor pass.

Internal local variable names may change when they are not part of a public or serialized contract. Public names and essential input/output names may not.

## 3. Current architecture and refactor pressure

Control Hípico spans several runtime boundaries:

- canonical backend under `backend/src/modules/hipico/`;
- WhatsApp/Bridge adapters under `backend/src/modules/hipico-bot/`;
- Vercel/serverless compatibility endpoints under `frontend/api/hipico/`;
- PWA/Command Center under `frontend/public/hipico-control/`;
- Android wrapper/sync and parity tooling;
- PostgreSQL/Supabase schema and migration history;
- QA, browser, security, contract and exact-SHA release tooling;
- Hípico architecture/security/release documentation.

The highest refactor pressure is concentrated in modules with multiple responsibilities, including service/router files that combine validation, orchestration, persistence, security, transport and formatting. Examples on the design baseline include `hipico-bot.service.ts`, `hipico-bridge.routes.ts`, `automation.store.ts`, `frontend/api/hipico/_shared.js`, `group-bridge-ingest.js`, `whatsapp-send.js` and `whatsapp-webhook.js`.

The refactor must not create a third business-logic authority. The backend canonical domain remains authoritative; serverless and transport layers remain adapters.

## 4. Dependency and branch policy

This design branch is documentation-only. Actual refactor implementation must branch from the **then-current `main`**, not from this documentation baseline.

Before Wave 0 behavior freeze begins:

- PR #348 (Risk Policy v6) must either be merged, explicitly abandoned, or its final behavior incorporated into the selected implementation baseline.
- PR #350 (Command Center fail-closed source-contract correction) must either be merged or its exact behavioral-test correction incorporated into the selected implementation baseline.
- PR #349 is documentation/governance-only and is not a runtime dependency, but implementation branches must still be based on the current repository state to avoid documentation conflicts.

No refactor PR may silently subsume unrelated open feature work. If `main` advances during a wave, the branch is reconciled before final verification and the behavior-freeze evidence is re-evaluated against the new base.

## 5. Refactor architecture

### 5.1 Boundary rule

The final structure follows this dependency direction:

`HTTP / webhook / CLI / PWA adapter -> application orchestration -> domain policy/parser/read models -> persistence/transport adapters`

Dependencies must point inward toward stable domain contracts. Infrastructure modules may depend on domain interfaces; domain policy must not import Express routers, Vercel handlers or provider-specific HTTP clients.

### 5.2 Public facade preservation

When a large module is decomposed, the existing public module remains a compatibility facade where necessary. It re-exports or delegates to internal modules while preserving:

- exported symbol names exactly;
- parameter names/types that form external contracts;
- return shapes;
- thrown public error codes/messages where callers depend on them;
- side-effect ordering where observable;
- transaction/idempotency boundaries.

Internal helpers may be renamed, extracted or reorganized freely when characterization tests prove equivalence.

### 5.3 Shared helpers rule

A helper is extracted only when at least one of the following is true:

- identical validation/normalization logic exists in multiple Hípico modules;
- the helper represents a stable domain concept;
- extraction makes a unit independently testable;
- extraction reduces a file that currently mixes unrelated responsibilities.

Do not create generic utility buckets. Helpers must have domain-specific names and narrow APIs.

## 6. Wave plan

Each wave is a separate reviewable PR unless a smaller PR split is required. A wave is not started by merging unverified work from the previous wave.

### Wave 0 — Behavior Freeze and characterization

**Objective:** establish a reliable equivalence baseline before production code moves.

Actions:

- inventory public exports for Hípico modules;
- inventory all `/api/v1/hipico/*`, `/api/v1/hipico-bot/*` and `frontend/api/hipico/*` endpoints;
- inventory environment variables consumed by Hípico;
- inventory observable error/status codes;
- inventory DB tables/columns directly touched by Hípico runtime;
- inventory public frontend state names, PWA cache rules and Android parity paths;
- add characterization tests for uncovered behavior without changing production implementation;
- capture representative fixtures for valid, invalid, duplicate, replay, ambiguous, offline, stale, SOURCE, LAB and authorization flows;
- establish contract snapshots/hashes for route shapes where useful.

Wave 0 may change tests and documentation only. If a characterization test reveals an existing product bug, that bug is documented and handled in a separate fix; the refactor baseline records the existing behavior rather than silently correcting it.

### Wave 1 — Internal primitives and low-risk duplication removal

**Objective:** consolidate repeated internal validation/normalization without changing orchestration.

Targets include repeated handling of:

- bounded strings and identifier validation;
- UUID/group/groupId validation;
- owner/operator identity resolution;
- no-store response headers;
- safe JSON/evidence sanitization;
- provider/public-error mapping where the mapping is already identical;
- timestamp normalization;
- common idempotency-key validation.

Public imports remain compatible. No route movement and no persistence change occurs in this wave.

### Wave 2 — Canonical backend decomposition

**Scope:** `backend/src/modules/hipico/`.

**Objective:** split domain policy, application orchestration, persistence/read models and HTTP routing into focused units while preserving canonical behavior.

Primary targets:

- `automation.store.ts`;
- Agent policy/engine/store/routes;
- Command Center read model/routes;
- document/provider/race lifecycle services where files mix concerns.

Rules:

- `agent-policy.ts` remains the policy authority for its public API;
- automation transition adjacency, idempotency, audits and SOURCE constraints remain identical;
- `AutomationStore` public methods remain named and compatible;
- Command Center observable status/alert codes remain identical;
- query ordering and transaction boundaries remain unchanged unless equivalence is demonstrated with PostgreSQL tests and the change is behavior-neutral.

### Wave 3 — WhatsApp/Bridge adapter decomposition

**Scope:** `backend/src/modules/hipico-bot/`.

**Objective:** reduce service/router monoliths by extracting parser, orchestration, store, transport, security and response-formatting responsibilities.

Primary targets:

- `hipico-bot.service.ts`;
- `hipico-bridge.routes.ts`;
- webhook/operator/outbox/Meta receipt orchestration;
- document bridge ingestion;
- provider transport adapters.

Compatibility requirements include preserving existing public parser/classifier/send/orchestration function names, public route paths, exact status/error behavior, WhatsApp signature behavior, webhook replay semantics, outbox lease/idempotency behavior and `reconciliation_required` handling.

### Wave 4 — Serverless adapter simplification

**Scope:** `frontend/api/hipico/`.

**Objective:** make serverless endpoints thin adapters and remove duplicated decision logic where the backend already owns the domain behavior.

Primary targets:

- `_shared.js`;
- `group-bridge-ingest.js`;
- `whatsapp-send.js`;
- `whatsapp-webhook.js`;
- status/Command Center/backend adapter modules.

Constraints:

- Vercel endpoint paths, exact HTTP status behavior and response contracts remain unchanged;
- serverless must not become a second domain authority;
- any delegation change must retain timeout/error/fallback behavior observable by supported clients;
- no secret is moved to browser code.

### Wave 5 — PWA, Command Center and Android parity refactor

**Scope:** `frontend/public/hipico-control/`, related runtime helpers and Android parity/sync tooling.

**Objective:** improve internal UI organization without changing observable UX behavior.

Preserve exactly:

- light/dark/system theme behavior;
- loading/empty/error/success/disabled/offline/stale/unavailable/not-configured/degraded states;
- SOURCE/LAB safety copy and affordances;
- keyboard/focus/dialog behavior;
- responsive 360/390/393/430/768/1024/1440 behavior;
- natural vertical scroll and no unintended global scroll lock;
- 44px critical target behavior;
- service worker API/live-data cache exclusions;
- update/version-mismatch behavior;
- Android/PWA source/hash/protocol parity.

Refactor rendering/state helpers only behind characterization/browser tests.

### Wave 6 — Test/fixture/tooling consolidation

**Objective:** reduce duplication in QA infrastructure without reducing behavioral coverage.

Actions may include:

- common fixture builders;
- common PostgreSQL test setup/cleanup helpers;
- shared Playwright helpers;
- exact-SHA evidence helpers;
- reusable security/input test factories.

A test helper refactor must keep test coverage intent and preserve or strengthen assertions. Golden corpora and historical regression evidence remain reproducible. Test-count changes caused only by consolidation are allowed only when the same scenarios remain explicitly exercised and reviewable.

### Wave 7 — Final cross-boundary cleanup

**Objective:** remove only internal compatibility shims proven unused after Waves 1-6, update architecture documentation, and verify that module boundaries match the intended canonical architecture.

Public compatibility adapters remain if any supported consumer still uses them. Removing a public route/export is explicitly out of scope for this campaign.

## 7. Database and migration policy

Historical SQL files and already-created Prisma migrations are immutable.

The refactor campaign should require **no schema change**. If implementation uncovers a schema defect that blocks safe decomposition:

1. stop the affected wave;
2. document the defect separately;
3. create a dedicated additive migration ticket/PR;
4. validate upgrade/replay/rollback implications independently;
5. resume refactor only after the schema correction is incorporated into the baseline.

Formatting a historical migration is also prohibited because it destroys migration identity/evidence without providing runtime value.

## 8. Behavior equivalence contract

For each changed component, equivalence is defined over all observable effects relevant to supported consumers.

At minimum this includes:

- same public function/export names;
- same accepted/rejected input classes;
- same normalized outputs;
- same HTTP routes/methods and exact status codes for equivalent inputs;
- same response field names/types/nullability;
- same public error codes/messages where part of the contract;
- same authentication/authorization decision;
- same DB rows created/updated/read under equivalent input;
- same transaction/idempotency behavior;
- same webhook replay and duplicate handling;
- same provider call conditions;
- same cache-control/offline semantics;
- same PWA/Android user-visible state;
- same financial side-effect boundary;
- same SOURCE/LAB safety boundary.

Internal logging wording, local helper names and file locations are not public behavior unless a documented operational consumer depends on them.

## 9. Testing strategy

### 9.1 Characterization before transformation

Before refactoring a behavior-rich module, add or identify tests that capture its current observable behavior. Refactoring begins only after the relevant characterization suite exists.

### 9.2 Required test layers

Depending on the touched boundary, each PR runs the applicable subset of:

- unit tests;
- source/contract tests;
- backend typecheck;
- backend build;
- full Hípico backend suite;
- PostgreSQL integration tests;
- security/webhook/idempotency tests;
- browser/Playwright Command Center and PWA tests;
- service-worker/offline tests;
- Android/PWA parity checks;
- migration parity checks without modifying historical migrations;
- exact-SHA release guard/evidence checks.

### 9.3 No false green

If GitHub Actions returns a job with no runner/no steps, or Vercel is blocked by platform rate limiting, classify the result as `BLOCKED_INFRASTRUCTURE` / `NOT VERIFIED`. Never report such a run as PASS.

A refactor PR is not complete merely because source review looks correct.

## 10. Refactor acceptance criteria

A wave is acceptable only when all of the following are true:

1. its diff is limited to the declared Hípico scope plus necessary tests/docs;
2. no public export, public function or endpoint was removed/renamed;
3. no essential public input/output variable was renamed;
4. no historical migration was modified;
5. characterization tests demonstrate unchanged behavior for touched flows;
6. typecheck/build/tests applicable to the wave are executed successfully, or any non-execution is explicitly classified as an infrastructure blocker;
7. DB/security/idempotency behavior is unchanged for touched persistence paths;
8. no secrets or real group/destination identities are introduced;
9. no test/workflow was weakened to obtain green status;
10. final diff review finds no unrelated product changes;
11. exact final SHA is tied to the verification evidence.

## 11. Efficiency rule

“Efficiency” in this campaign means reducing unnecessary work without altering semantics. Safe examples include eliminating duplicate parsing/normalization, avoiding repeated pure computation inside one request and reusing already-loaded immutable configuration.

Do **not** change query ordering, cache live operational data, combine transactions, parallelize side effects or modify retry timing merely for performance unless a dedicated benchmark plus behavior-equivalence proof shows the change is safe. Those are behavioral changes and therefore outside ordinary refactor scope.

## 12. Error handling and fail-closed behavior

Refactoring must preserve the current distinction between:

- invalid input;
- unauthorized access;
- unavailable dependency;
- stale/ambiguous evidence;
- retryable transport failure;
- ambiguous provider acceptance requiring reconciliation;
- terminal provider/policy rejection;
- human-review-required paths.

Catch blocks may be deduplicated, but errors must not be collapsed into less-specific public outcomes. Fail-open transformations are prohibited.

## 13. Security review checklist per wave

Review explicitly for:

- raw SQL/shell/tool exposure;
- prototype-pollution keys and unsafe object spreading;
- secret/token/cookie leakage into evidence/logs/UI;
- webhook signature verification ordering;
- operator token comparison/authentication;
- SOURCE write capability;
- group/owner cross-scope reads;
- idempotency-key collisions/reuse;
- lease ownership and duplicate delivery;
- path/body/header authority confusion;
- financial authority expansion.

## 14. PR and merge strategy

- one wave per PR by default;
- smaller PRs are preferred when a wave exceeds reviewable size;
- no giant all-at-once refactor PR;
- PR descriptions state baseline SHA, final SHA, touched boundaries, characterization evidence and explicit non-changes;
- merge only after exact-SHA evidence is classified;
- if infrastructure blocks verification, keep the PR unmerged unless the repository owner explicitly overrides the gate after the blocker is documented;
- after each merge, the next wave starts from the new current `main`.

## 15. Rollback strategy

Because behavior is preserved and waves are isolated, rollback is PR-level. No wave should require data rollback or destructive migration rollback.

If a regression appears after merge:

1. revert the affected refactor PR;
2. preserve captured evidence/logs;
3. reproduce against the pre-refactor characterization test;
4. correct the missing characterization or decomposition issue;
5. re-implement in a fresh PR.

## 16. Measures of success

The campaign succeeds when:

- externally observable Control Hípico behavior remains equivalent;
- large multi-responsibility files are decomposed into focused units;
- duplicate validation/policy/transport plumbing is reduced;
- serverless adapters contain less domain decision logic;
- canonical backend ownership is clearer;
- characterization and regression coverage is stronger than at campaign start;
- future Hípico tickets can modify one bounded unit without reading several unrelated monoliths;
- production gates remain at least as strict as before the refactor.

File size reduction alone is not a success metric. Moving complexity without improving boundaries is not considered a successful refactor.

## 17. Explicit out-of-scope items

This campaign does not:

- add new betting or settlement features;
- change automation promotion thresholds;
- redesign the Risk Policy dispositions;
- change provider selection behavior;
- introduce a new message broker;
- migrate the UI framework;
- rename public APIs, public functions or essential input/output variables;
- remove supported legacy endpoints;
- alter accounting/ERP features outside Hípico;
- rewrite historical migrations;
- change legal/governance policy;
- claim external physical-device/24h-soak evidence that was not actually executed.

## 18. First implementation action after written-spec approval

After this written specification is reviewed and approved, create a detailed implementation plan beginning with **Wave 0 — Behavior Freeze**. Wave 0 must establish the baseline contracts before any production refactor begins. The first production-code refactor is therefore Wave 1, never Wave 0.
