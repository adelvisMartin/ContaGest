# Control Hípico Shadow Metrics + Promotion Gates v7 — Design

## Goal

Make automation promotion depend on two independent evidence windows: the complete historical record and a recent 30-day window with a minimum reviewed sample for the requested stage. A group must pass both windows; old success can never mask recent degradation.

## Scope

This design extends the existing Agent/Shadow subsystem only. It does not enable new automatic actions, does not grant financial authority, does not change the public names of existing functions, and does not alter the canonical outbound authority introduced by v5 or the deterministic response policy introduced by v6.

The refactor portion is intentionally limited to files touched by Agent/Shadow metrics and promotion. Public function names, route paths, essential request/response fields, automation state names, and existing downgrade/same-state semantics remain unchanged.

## Metrics model

`AutomationMetrics` remains the public metrics type and preserves the existing top-level fields:

- `reviewed`
- `matched`
- `highRiskFalsePositive`
- `unauthorizedAction`
- `conflicts`

v7 adds backwards-compatible fields:

- `abstentions`
- `raceContextErrors`
- `recent`: the same counters for reviewed evaluations from the last 30 days that were produced/reviewed under metric schema `v7`
- `byIntent`: reviewed/matched/risk/conflict/abstention/context counters grouped by ground-truth `actualIntent`
- `window`: metadata containing `recentDays`, `recentSince`, `metricSchemaVersion`

Historical metrics include all reviewed evaluations so the existing evidence record remains useful. New dimensions that did not exist before v7 are explicitly versioned; legacy rows do not count toward the recent v7 sample requirement.

### Derived rates

Both historical and recent windows calculate:

- accuracy = matched / reviewed
- conflictRate = conflicts / reviewed
- abstentionRate = abstentions / reviewed
- raceContextErrorRate = raceContextErrors / reviewed

No denominator is inferred from unreviewed rows.

## Promotion gates

The existing promotion path is preserved: no skipped stages and downgrades/same-state remain permitted.

Upward gates require both historical and recent windows:

| Target | Historical reviewed | Recent reviewed / 30d | Accuracy (both) | Conflict rate (both) | Abstention rate (both) | Race-context error rate (both) | High-risk FP | Unauthorized action |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ASSISTED | 200 | 75 | >= 0.98 | <= 0.02 | <= 0.05 | <= 0.02 | 0 | 0 |
| AUTOMATIC_LOW_RISK | 500 | 200 | >= 0.99 | <= 0.005 | <= 0.03 | <= 0.005 | 0 | 0 |
| AUTOMATIC | 1000 | 400 | >= 0.995 | <= 0.002 | <= 0.02 | <= 0.002 | 0 | 0 |

`AUTOMATIC` additionally retains the existing explicit owner approval requirement.

If recent metrics are absent or the recent sample is below the target minimum, promotion fails closed with `RECENT_METRICS_INSUFFICIENT`. Existing historical failure reasons remain stable where possible; the new dual-window failure reason is exposed in the transition event decision.

SOURCE remains SHADOW-only under the existing source pinning rule regardless of metrics.

## Abstention and race-context semantics

An evaluation is recorded as an abstention when the deterministic/agent result explicitly returns intent `unknown`. It is not inferred from ordinary human-required operational workflows.

`raceContextError` is an operator-review fact. The review endpoint gains an optional boolean `raceContextError`, default `false`, preserving existing clients.

## Reproducible snapshots

Every promotion attempt already persists an append-only transition event. v7 extends that event evidence with:

- metrics schema version
- recent-window metadata
- historical metrics
- recent metrics
- per-intent metrics
- deterministic SHA-256 `metricsSignature`

The signature is computed from canonical JSON of the metric snapshot and gate version. The same rows/as-of time and gate version reproduce the same signature.

No mutable metrics snapshot table is required; the existing append-only transition event is the audit authority.

## Persistence

A replay-safe migration adds to `hipico_agent_evaluations`:

- `abstained boolean`
- `race_context_error boolean`
- `metric_schema_version text`

Existing rows are tagged `legacy-v6`; new rows default to `v7`. Existing rows keep `abstained=false` and `race_context_error=false`, but they are excluded from the recent v7 minimum sample.

The one-time review trigger is recreated so the two review-time fields can transition exactly once while every other evaluation/policy field remains immutable.

## API/read model

Existing endpoints and public names remain unchanged.

`GET /groups/:groupId/automation` continues returning `metrics`, now enriched with historical/recent/byIntent/window fields.

`POST /groups/:groupId/automation/evaluations/:id/review` accepts optional `raceContextError` while retaining every existing field.

`POST /groups/:groupId/automation` keeps the same request shape; its transition result gains the richer measured decision/snapshot evidence without removing existing properties.

## Golden corpus

The golden scorer keeps its public function name `scoreGoldenCorpus`. Its current output remains intact; v7 adds intent-level aggregates and abstention count without removing existing fields or changing signature generation semantics for the existing case payload.

Golden corpus results are regression evidence, not a substitute for measured production-shadow reviews. Promotion requires production metrics; golden scoring is a separate release gate.

## Refactor constraints

The following files may be refactored for readability while preserving behavior/public API:

- `agent-policy.ts`
- `automation.store.ts`
- `agent.routes.ts`
- `agent-golden.ts`
- directly related tests/migrations

Refactoring goals: named gate configuration, shared metric-rate helpers, focused row mappers/query helpers, removal of nested promotion-condition duplication, and clearer server-side evidence boundaries. No unrelated ERP/Hípico modules are reformatted or rewritten.

## Testing

Required evidence:

1. unit tests for historical + recent gates and exact thresholds;
2. regression that historical PASS + recent FAIL cannot promote;
3. regression that recent PASS + historical FAIL cannot promote;
4. abstention/race-context rates and per-intent aggregation;
5. SOURCE remains SHADOW-only;
6. review immutability with new race-context field;
7. deterministic metrics signature;
8. real PostgreSQL E2E for recent-window SQL and one-time review;
9. existing Agent/Shadow, risk-policy and golden corpus tests unchanged or extended, never weakened;
10. exact-SHA workflow with Node 22, PostgreSQL 16, typecheck, Hípico tests, Agent E2E, build, diff-check and cleanup.

## Production safety

- LLM output still has no direct DB/money authority.
- No promotion stage can be skipped.
- SOURCE cannot be promoted beyond SHADOW.
- Missing recent evidence fails closed.
- No promotion gate is client-calculated.
- All promotion evidence is server-measured and append-only in transition history.
