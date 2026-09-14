# Control Hípico Shadow Metrics + Promotion Gates v7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require both historical and recent measured Shadow performance before automation promotion, add abstention/race-context/per-intent metrics, preserve existing public APIs, and refactor the touched Agent/Shadow code for clarity without functional loss.

**Architecture:** Extend the existing `AutomationMetrics` contract rather than replacing it. `AutomationStore` remains the server-side authority for measured metrics and promotion transitions; `canPromoteAutomation` keeps its public name and promotion path but consumes richer metrics. The append-only transition event remains the snapshot/audit authority and gains a deterministic metric signature.

**Tech Stack:** Node.js 22, TypeScript 5.9, Express 5, Prisma raw SQL/PostgreSQL 16, Supabase SQL migrations, Node test runner via `tsx --test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-hipico-shadow-metrics-v7-design.md`

## Global Constraints

- Preserve public function names: `canPromoteAutomation`, `scoreGoldenCorpus`, `AutomationStore.metrics`, `AutomationStore.setMode`, `AutomationStore.review`.
- Preserve route paths and all existing essential request/response fields.
- Preserve existing automation states and no-skipped-stage semantics.
- SOURCE remains SHADOW-only.
- `financialAuthority=false`; no monetary authority is added.
- Historical and recent windows must both pass upward promotion gates.
- Recent window is 30 days and only `metric_schema_version='v7'` reviewed rows count toward recent sample minimums.
- Refactor only files touched by Agent/Shadow metrics/promotion; no unrelated ERP/Hípico formatting sweep.
- No weakening of existing tests or workflows.

---

### Task 1: Extend metrics contract and pure dual-window gate logic

**Files:**
- Modify: `backend/src/modules/hipico/agent-policy.ts`
- Modify: `backend/src/modules/hipico/agent-policy.test.ts`
- Create: `backend/src/modules/hipico/agent-promotion-metrics.test.ts`

**Interfaces:**
- Keeps `canPromoteAutomation(current, target, metrics, ownerApproved)` unchanged.
- Extends `AutomationMetrics` with optional `abstentions`, `raceContextErrors`, `recent`, `byIntent`, `window`, `metricsSignature` fields.
- Adds internal named gate configuration and shared rate calculation helpers.

- [ ] **Step 1: Write failing tests for dual-window gates**

Add tests covering:

```ts
const passAssisted = {
  reviewed: 200,
  matched: 196,
  highRiskFalsePositive: 0,
  unauthorizedAction: 0,
  conflicts: 0,
  abstentions: 0,
  raceContextErrors: 0,
  recent: {
    reviewed: 75,
    matched: 74,
    highRiskFalsePositive: 0,
    unauthorizedAction: 0,
    conflicts: 0,
    abstentions: 0,
    raceContextErrors: 0
  },
  window: { recentDays: 30, metricSchemaVersion: 'v7' }
};
assert.equal(canPromoteAutomation('SHADOW', 'ASSISTED', passAssisted).allowed, true);
assert.equal(canPromoteAutomation('SHADOW', 'ASSISTED', { ...passAssisted, recent: { ...passAssisted.recent, reviewed: 74 } }).reason, 'RECENT_METRICS_INSUFFICIENT');
assert.equal(canPromoteAutomation('SHADOW', 'ASSISTED', { ...passAssisted, matched: 195 }).allowed, false);
```

Also test exact thresholds for `AUTOMATIC_LOW_RISK` and `AUTOMATIC`, owner approval, SOURCE behavior remains outside this pure function, downgrade/same-state compatibility, and no recent metrics fails closed for upward targets beyond SHADOW.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd backend
npm exec -- tsx --test src/modules/hipico/agent-policy.test.ts src/modules/hipico/agent-promotion-metrics.test.ts
```

Expected: new recent-window assertions fail because the current type/gate ignores recent metrics.

- [ ] **Step 3: Refactor gate constants and rate helpers without renaming public functions**

Introduce internal structures such as:

```ts
type MetricWindow = {
  reviewed: number;
  matched: number;
  highRiskFalsePositive: number;
  unauthorizedAction: number;
  conflicts: number;
  abstentions: number;
  raceContextErrors: number;
};

const PROMOTION_GATES = {
  ASSISTED: { historicalReviewed: 200, recentReviewed: 75, accuracy: .98, conflictRate: .02, abstentionRate: .05, contextErrorRate: .02 },
  AUTOMATIC_LOW_RISK: { historicalReviewed: 500, recentReviewed: 200, accuracy: .99, conflictRate: .005, abstentionRate: .03, contextErrorRate: .005 },
  AUTOMATIC: { historicalReviewed: 1000, recentReviewed: 400, accuracy: .995, conflictRate: .002, abstentionRate: .02, contextErrorRate: .002 }
} as const;
```

Keep `canPromoteAutomation` as the sole public gate entry point.

- [ ] **Step 4: Implement dual-window fail-closed evaluation**

Preserve existing reasons for invalid path/owner approval/downgrade and return `RECENT_METRICS_INSUFFICIENT` when historical metrics pass but recent evidence is absent/insufficient. Use explicit named helper predicates rather than nested condition chains.

- [ ] **Step 5: Run focused and existing Agent tests**

```bash
npm exec -- tsx --test src/modules/hipico/agent-policy.test.ts src/modules/hipico/agent-promotion-metrics.test.ts
npm run test:hipico
```

- [ ] **Step 6: Commit Task 1**

```bash
git add backend/src/modules/hipico/agent-policy.ts backend/src/modules/hipico/agent-policy.test.ts backend/src/modules/hipico/agent-promotion-metrics.test.ts
git commit -m "feat(hipico): require dual-window promotion metrics"
```

### Task 2: Add replay-safe v24 metric schema and preserve evaluation immutability

**Files:**
- Create: `supabase/sql/hipico_v24_shadow_metrics.sql`
- Create: `backend/prisma/migrations/20260914194000_hipico_shadow_metrics_v7/migration.sql`
- Create: `backend/src/modules/hipico/shadow-metrics-schema.test.ts`
- Modify: `backend/src/modules/hipico/agent-migration-parity.test.ts`

**Interfaces:**
- Adds `abstained`, `race_context_error`, `metric_schema_version` to `public.hipico_agent_evaluations`.
- Existing rows become `legacy-v6`; new rows default to `v7`.
- Recreates the one-time review trigger so `race_context_error` may transition only during the single authorized review.

- [ ] **Step 1: Write failing migration-contract tests**

Require both Supabase and Prisma migrations to contain:

```sql
ADD COLUMN IF NOT EXISTS abstained boolean;
ADD COLUMN IF NOT EXISTS race_context_error boolean;
ADD COLUMN IF NOT EXISTS metric_schema_version text;
```

and an atomic `BEGIN`, `ACCESS EXCLUSIVE LOCK`, trigger recreation, `legacy-v6` backfill, `v7` default, and immutability checks for all v23 policy fields plus `abstained` and `metric_schema_version`.

- [ ] **Step 2: Run schema tests and verify RED**

```bash
cd backend
npm exec -- tsx --test src/modules/hipico/shadow-metrics-schema.test.ts src/modules/hipico/agent-migration-parity.test.ts
```

- [ ] **Step 3: Implement additive Supabase migration**

Within one transaction:
1. lock `hipico_agent_evaluations`;
2. add nullable columns;
3. drop the review trigger;
4. mark existing rows `metric_schema_version='legacy-v6'`, `abstained=false`, `race_context_error=false`;
5. set defaults (`v7`, `false`, `false`) and NOT NULL;
6. recreate the review guard allowing only `actual_intent`, `matched`, review flags including `race_context_error`, `reviewed_by`, `reviewed_at` to change once;
7. keep `abstained`, metric schema and v23 policy fields immutable.

- [ ] **Step 4: Mirror exact migration in Prisma**

The Prisma migration SQL must be semantically identical to the Supabase migration.

- [ ] **Step 5: Re-run migration contract tests**

- [ ] **Step 6: Commit Task 2**

```bash
git add supabase/sql/hipico_v24_shadow_metrics.sql backend/prisma/migrations/20260914194000_hipico_shadow_metrics_v7/migration.sql backend/src/modules/hipico/shadow-metrics-schema.test.ts backend/src/modules/hipico/agent-migration-parity.test.ts
git commit -m "feat(hipico): persist v7 shadow metric dimensions"
```

### Task 3: Refactor metric aggregation and add historical/recent/by-intent snapshots

**Files:**
- Modify: `backend/src/modules/hipico/automation.store.ts`
- Create: `backend/src/modules/hipico/shadow-metrics.ts`
- Create: `backend/src/modules/hipico/shadow-metrics.test.ts`

**Interfaces:**
- Keeps `AutomationStore.metrics(ownerId, groupKey, groupId)` unchanged.
- Produces deterministic helpers `metricRates`, `canonicalMetricsSignature`, and row normalization in `shadow-metrics.ts`.
- `AutomationStore.metrics` returns the enriched metrics object.

- [ ] **Step 1: Write failing pure-helper tests**

Test zero denominators, exact rate calculations, canonical key ordering and deterministic SHA-256 signature.

- [ ] **Step 2: Write failing store source/contract tests**

Require SQL to compute:
- lifetime reviewed metrics;
- recent metrics filtered by `reviewed_at >= now() - interval '30 days'` and `metric_schema_version='v7'`;
- per-intent aggregation using `actual_intent`;
- no client-provided metric values.

- [ ] **Step 3: Implement `shadow-metrics.ts` pure helpers**

Canonicalize nested object keys recursively before hashing. Exclude volatile request IDs; include gate version, recent window metadata, historical/recent/by-intent values.

- [ ] **Step 4: Refactor `automation.store.ts` metric queries**

Replace the current monolithic `readMetrics` with focused private helpers:

```ts
readMetricWindow(db, scope, whereClause)
readIntentMetrics(db, scope)
buildAutomationMetrics(...)
```

Do not rename `AutomationStore.metrics`, `setMode`, `recordEvaluation`, `review`, or `evaluations`.

- [ ] **Step 5: Persist abstention at evaluation time**

Set `abstained` from the deterministic outcome (`candidate.intent === 'unknown'`) and `metric_schema_version='v7'` for all new evaluations.

- [ ] **Step 6: Extend review with race-context error**

Add optional `raceContextError?: boolean` to the existing review input and write it only during the one-time review update.

- [ ] **Step 7: Run focused and Agent suites**

```bash
npm exec -- tsx --test src/modules/hipico/shadow-metrics.test.ts
npm run test:hipico:agent
npm run test:hipico
```

- [ ] **Step 8: Commit Task 3**

### Task 4: Bind deterministic metric snapshot to every promotion event

**Files:**
- Modify: `backend/src/modules/hipico/automation.store.ts`
- Modify: `backend/src/modules/hipico/agent-policy.ts`
- Create: `backend/src/modules/hipico/promotion-snapshot.test.ts`

**Interfaces:**
- Keeps `AutomationStore.setMode(...)` unchanged.
- Transition event `metrics` JSON gains `metricsSignature`, `window`, `recent`, `byIntent` while preserving existing top-level fields.
- `PromotionDecision.metrics` preserves existing `accuracy`/`conflictRate` and may add recent/abstention/context rates.

- [ ] **Step 1: Write failing transition-snapshot tests**

Verify a rejected and an applied promotion both persist the same server-measured snapshot used for the decision, and a repeated idempotency key returns the original snapshot/signature.

- [ ] **Step 2: Implement snapshot generation inside the existing scope transaction**

The metric read, gate decision, state mutation and transition insert must remain under the same advisory lock/transaction so no review can race between scoring and audit persistence.

- [ ] **Step 3: Ensure idempotent replay does not recompute metrics**

When an existing transition event is found, return its persisted metrics/decision exactly as before rather than reading current metrics.

- [ ] **Step 4: Run focused tests**

- [ ] **Step 5: Commit Task 4**

### Task 5: Extend API read/review contract without breaking existing clients

**Files:**
- Modify: `backend/src/modules/hipico/agent.routes.ts`
- Modify: `backend/src/modules/hipico/agent-route-security.test.ts`
- Create: `backend/src/modules/hipico/shadow-metrics-routes.test.ts`

**Interfaces:**
- Existing `GET /groups/:groupId/automation` route remains unchanged and returns enriched `metrics`.
- Existing review route adds optional `raceContextError:boolean=false`.

- [ ] **Step 1: Write failing route contract tests**

Verify omitted `raceContextError` still behaves exactly as before and client-supplied historical/recent metrics are not accepted by promotion/evaluate bodies.

- [ ] **Step 2: Extend review schema only**

```ts
raceContextError: z.boolean().default(false)
```

Pass through to `store.review` without changing any existing field names.

- [ ] **Step 3: Keep metric computation server-only**

No new request body/query parameter may inject `recent`, `accuracy`, `matched`, `metricsSignature`, or gate thresholds.

- [ ] **Step 4: Run route/security tests**

- [ ] **Step 5: Commit Task 5**

### Task 6: Extend golden corpus reporting without changing existing output semantics

**Files:**
- Modify: `backend/src/modules/hipico/agent-golden.ts`
- Modify: `backend/src/modules/hipico/agent-golden.test.ts`

**Interfaces:**
- Keeps `scoreGoldenCorpus(value, parser)` unchanged.
- Preserves `version,total,matched,accuracy,highRiskFalsePositive,unauthorizedAutomaticAction,signature,cases`.
- Adds `abstentions` and `byIntent` only.

- [ ] **Step 1: Write failing compatibility tests**

Assert all existing fields remain identical for a fixed corpus and new aggregates are deterministic.

- [ ] **Step 2: Refactor aggregation into named helpers**

Do not change the existing case list used to compute the existing signature. Compute new aggregates after the existing signature so the previous signature semantics remain stable.

- [ ] **Step 3: Run golden tests**

- [ ] **Step 4: Commit Task 6**

### Task 7: Real PostgreSQL E2E for recent window, immutability and promotion race safety

**Files:**
- Modify: `backend/src/modules/hipico/hipico-agent.integration.ts`
- Add focused integration assertions in the same executable.

**Interfaces:**
- Uses `HIPICO_E2E_DATABASE_URL` and existing migrations.

- [ ] **Step 1: Seed historical legacy rows plus reviewed v7 rows**

Seed enough lifetime rows to pass historical ASSISTED but fewer than 75 reviewed v7 rows in the last 30 days; assert promotion is rejected `RECENT_METRICS_INSUFFICIENT`.

- [ ] **Step 2: Add the 75th clean v7 review**

Assert ASSISTED gate passes while SOURCE still rejects via `SOURCE_SHADOW_ONLY` when pinned.

- [ ] **Step 3: Seed recent race-context error above threshold**

Assert recent degradation blocks promotion even when lifetime accuracy still passes.

- [ ] **Step 4: Verify one-time review trigger**

Attempt second modification of `race_context_error`; PostgreSQL must raise `HIPICO_AGENT_EVALUATION_IMMUTABLE`.

- [ ] **Step 5: Verify transition snapshot idempotency**

Replay same idempotency key after adding more reviews; returned signature must remain the original persisted signature.

- [ ] **Step 6: Run E2E**

```bash
npm run test:hipico:agent
```

- [ ] **Step 7: Commit Task 7**

### Task 8: Add exact-SHA v7 workflow and regression gates

**Files:**
- Create: `.github/workflows/hipico-shadow-metrics-v7.yml`
- Create: `backend/src/modules/hipico/shadow-metrics-workflow-contract.test.ts`

**Interfaces:**
- Node 22 + PostgreSQL 16 + exact candidate SHA + repository lockfile.

- [ ] **Step 1: Write workflow contract test first**

Require checkout of exact PR head SHA, `npm ci`, typecheck, `test:hipico`, `test:hipico:agent`, build, `git diff --check`, isolated DB and unconditional cleanup.

- [ ] **Step 2: Add workflow**

Use the established Hípico v6 exact-SHA pattern; do not weaken existing workflows.

- [ ] **Step 3: Run workflow contract test locally/CI where available**

- [ ] **Step 4: Commit Task 8**

### Task 9: Final compatibility/refactor verification

**Files:**
- Review only; modify touched files only if a verified regression is found.

**Interfaces:**
- Public names and essential route I/O must match pre-v7 behavior plus additive fields.

- [ ] **Step 1: Run formatting/diff gate**

```bash
git diff --check <base> HEAD
```

- [ ] **Step 2: Run typecheck**

```bash
npm --workspace backend run typecheck
```

- [ ] **Step 3: Run Hípico tests**

```bash
npm --workspace backend run test:hipico
npm --workspace backend run test:hipico:agent
```

- [ ] **Step 4: Build backend**

```bash
npm --workspace backend run build
```

- [ ] **Step 5: Review diff for accidental API renames/behavior loss**

Confirm `canPromoteAutomation`, `scoreGoldenCorpus`, route paths, automation modes, SOURCE restriction, financial authority and existing fields remain intact.

- [ ] **Step 6: Publish PR stacked on `feat/hipico-risk-policy-v6` while #348 remains unmerged**

Validate exact head SHA. If GitHub Actions produces `steps=[]`/`runner_id=0`, report `BLOCKED_INFRASTRUCTURE`; do not report PASS.
