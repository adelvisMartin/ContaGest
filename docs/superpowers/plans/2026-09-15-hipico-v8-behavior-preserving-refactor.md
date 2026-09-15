# Control Hípico v8 Behavior-Preserving Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Control Hípico code evolved through Implementations 1–7 into clearer policy, persistence, route, and scoring boundaries without changing any public behavior, safety invariant, route, error code, database contract, or runtime decision for equivalent inputs.

**Architecture:** Existing public module paths remain compatibility façades. Private responsibilities move behind them into focused internal modules using characterization-first TDD. `AutomationStore` remains the transaction/orchestration façade; policy extraction must not move locks, idempotency checks, promotion snapshots, or write ordering across transaction boundaries.

**Tech Stack:** TypeScript, Node.js 22, Express, Prisma/PostgreSQL, Zod, Node `test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-hipico-v8-behavior-preserving-refactor-design.md`

## Global Constraints

- Do not remove any existing functionality.
- Do not rename public functions, public classes, route paths, route methods, environment variables, public error codes, or essential request/response fields.
- Preserve `AUTO | SUGGEST | HUMAN_REQUIRED | DENY` decisions and all existing reason codes for equivalent inputs.
- Preserve dual-window v7 promotion thresholds, recent-window semantics, SOURCE SHADOW-only behavior, LAB isolation, and `financialAuthority=false`.
- Preserve `public.hipico_outbox` authority, lease/idempotency behavior, receipt monotonicity, ambiguous-delivery reconciliation, approval gates, cooldown/backoff semantics, and runner disabled-by-default behavior.
- Do not edit historical migrations v22/v23/v24 or any earlier migration.
- Do not introduce a new schema migration in v8.
- Preserve exact transaction ordering in `AutomationStore.setMode()`: scope lock → replay check → current-state lock/read → metric snapshot → policy decision → optional mode update → transition insert.
- Preserve current golden-corpus result fields and signature input semantics.
- Characterization tests must exist before each extraction.
- A GitHub Actions job with no executed steps or `runner_id=0` is `BLOCKED_INFRASTRUCTURE`, never PASS.

---

### Task 1: Freeze public contracts and representative behavior

**Files:**
- Create: `backend/src/modules/hipico/v8-public-contracts.test.ts`
- Create: `backend/src/modules/hipico/v8-agent-policy-equivalence.test.ts`
- Test existing: `backend/src/modules/hipico/agent-policy.test.ts`
- Test existing: `backend/src/modules/hipico/agent-golden.test.ts`

**Interfaces:**
- Consumes: current exports from `agent-policy.ts`, `automation.store.ts`, `agent-golden.ts`, `shadow-metrics.ts`, canonical outbox modules, and `agent.routes.ts`.
- Produces: characterization tests that all later tasks must keep green.

- [ ] **Step 1: Write public export manifest test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import * as agentPolicy from './agent-policy.js';
import * as automationStore from './automation.store.js';
import * as golden from './agent-golden.js';

const requiredAgentExports = [
  'AUTOMATION_STATES', 'AGENT_TOOLS', 'AUTO_EXECUTABLE_TOOLS', 'MIN_AUTO_CONFIDENCE',
  'canPromoteAutomation', 'validateModelCandidate', 'agentCanAct', 'safeToolRequest', 'HipicoAgentEngine'
] as const;

test('v8 preserves public Hípico façade exports', () => {
  for (const key of requiredAgentExports) assert.ok(key in agentPolicy, `missing export ${key}`);
  assert.ok('AutomationStore' in automationStore);
  assert.ok('sanitizeAgentEvidence' in automationStore);
  assert.ok('scoreGoldenCorpus' in golden);
});
```

- [ ] **Step 2: Freeze representative policy outputs and errors**

```ts
import {
  agentCanAct,
  canPromoteAutomation,
  safeToolRequest,
  validateModelCandidate,
  type AgentCandidate
} from './agent-policy.js';

const historical = {
  reviewed: 200, matched: 196, highRiskFalsePositive: 0,
  unauthorizedAction: 0, conflicts: 0, abstentions: 0, raceContextErrors: 0
};
const recent = {
  reviewed: 75, matched: 74, highRiskFalsePositive: 0,
  unauthorizedAction: 0, conflicts: 0, abstentions: 0, raceContextErrors: 0
};

test('v8 freezes promotion paths and reason codes', () => {
  const pass = canPromoteAutomation('SHADOW', 'ASSISTED', {
    ...historical,
    recent,
    window: { recentDays: 30, recentSince: '2026-08-16T00:00:00.000Z', metricSchemaVersion: 'v7' }
  });
  assert.equal(pass.allowed, true);
  assert.equal(pass.reason, 'SHADOW_GATE_PASSED');
  assert.equal(canPromoteAutomation('SHADOW', 'AUTOMATIC_LOW_RISK', historical).reason, 'INVALID_PROMOTION_PATH');
});

test('v8 freezes candidate/tool error codes and automatic eligibility', () => {
  assert.throws(() => validateModelCandidate({ intent: '', confidence: 2 }), /AGENT_CANDIDATE_SCHEMA_INVALID/);
  const candidate: AgentCandidate = {
    intent: 'query:NEXT_RACE', confidence: .995, tool: 'queryNextRace',
    arguments: { text: 'próxima carrera' }, risk: 'safe', source: 'deterministic', modelVersion: null
  };
  assert.equal(agentCanAct('AUTOMATIC_LOW_RISK', candidate), true);
  assert.deepEqual(safeToolRequest(candidate), { tool: 'queryNextRace', arguments: { text: 'próxima carrera' } });
  assert.throws(() => safeToolRequest({ ...candidate, arguments: { token: 'x' } }), /AGENT_TOOL_ARGUMENTS_REJECTED/);
});
```

- [ ] **Step 3: Run characterization suite**

```bash
npm --workspace backend run test:hipico
```

Expected: all existing and new characterization tests pass if execution is available. If the runner never executes a step, record `BLOCKED_INFRASTRUCTURE` instead of PASS.

- [ ] **Step 4: Commit characterization only**

```bash
git add backend/src/modules/hipico/v8-public-contracts.test.ts backend/src/modules/hipico/v8-agent-policy-equivalence.test.ts
git commit -m "test(hipico): freeze v8 public behavior contracts"
```

---

### Task 2: Extract promotion policy behind `agent-policy.ts`

**Files:**
- Create: `backend/src/modules/hipico/agent-promotion-policy.ts`
- Modify: `backend/src/modules/hipico/agent-policy.ts`
- Test: `backend/src/modules/hipico/agent-policy.test.ts`
- Test: `backend/src/modules/hipico/v8-agent-policy-equivalence.test.ts`

**Interfaces:**
- Consumes: existing `AutomationState`, `AutomationMetrics`, `AutomationMetricRates`, `PromotionDecision` types.
- Produces: internal `evaluateAutomationPromotion(current, target, metrics, ownerApproved)` used by the public `canPromoteAutomation(...)` façade.

- [ ] **Step 1: Add failing delegation contract**

```ts
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(new URL('./agent-policy.ts', import.meta.url), 'utf8');

test('public promotion function stays in façade and delegates internally', () => {
  assert.match(source, /export function canPromoteAutomation/);
  assert.match(source, /evaluateAutomationPromotion/);
});
```

- [ ] **Step 2: Create pure internal promotion implementation with v7 semantics unchanged**

```ts
import type {
  AutomationMetricRates,
  AutomationMetrics,
  AutomationMetricWindow,
  AutomationState,
  PromotionDecision
} from './agent-policy.js';

const RECENT_WINDOW_DAYS = 30;
const METRIC_SCHEMA_VERSION = 'v7';
const GATES = {
  ASSISTED: { historicalReviewed: 200, recentReviewed: 75, accuracy: .98, conflictRate: .02, abstentionRate: .05, raceContextErrorRate: .02, passReason: 'SHADOW_GATE_PASSED', historicalFailureReason: 'SHADOW_METRICS_INSUFFICIENT' },
  AUTOMATIC_LOW_RISK: { historicalReviewed: 500, recentReviewed: 200, accuracy: .99, conflictRate: .005, abstentionRate: .03, raceContextErrorRate: .005, passReason: 'LOW_RISK_GATE_PASSED', historicalFailureReason: 'LOW_RISK_METRICS_INSUFFICIENT' },
  AUTOMATIC: { historicalReviewed: 1000, recentReviewed: 400, accuracy: .995, conflictRate: .002, abstentionRate: .02, raceContextErrorRate: .002, passReason: 'AUTOMATIC_GATE_PASSED', historicalFailureReason: 'AUTOMATIC_METRICS_INSUFFICIENT' }
} as const;

const states = ['DISABLED', 'SHADOW', 'ASSISTED', 'AUTOMATIC_LOW_RISK', 'AUTOMATIC'] as const;
const nonNegative = (value: unknown) => Math.max(0, Number(value) || 0);

function rates(metrics: AutomationMetricWindow): AutomationMetricRates {
  const reviewed = nonNegative(metrics.reviewed);
  const matched = Math.min(reviewed, nonNegative(metrics.matched));
  return {
    accuracy: reviewed ? matched / reviewed : 0,
    conflictRate: reviewed ? nonNegative(metrics.conflicts) / reviewed : 1,
    abstentionRate: reviewed ? nonNegative(metrics.abstentions) / reviewed : 1,
    raceContextErrorRate: reviewed ? nonNegative(metrics.raceContextErrors) / reviewed : 1
  };
}

export function evaluateAutomationPromotion(
  current: AutomationState,
  target: AutomationState,
  metrics: AutomationMetrics,
  ownerApproved = false
): PromotionDecision {
  const historicalRates = rates(metrics);
  const calculated = metrics.recent ? { ...historicalRates, recent: rates(metrics.recent) } : historicalRates;
  const currentIndex = states.indexOf(current);
  const targetIndex = states.indexOf(target);
  if (currentIndex < 0 || targetIndex < 0) return { allowed: false, reason: 'INVALID_PROMOTION_PATH', metrics: calculated };
  if (targetIndex <= currentIndex) return { allowed: true, reason: 'DOWNGRADE_OR_SAME_STATE', metrics: calculated };
  if (targetIndex !== currentIndex + 1) return { allowed: false, reason: 'INVALID_PROMOTION_PATH', metrics: calculated };
  if (target === 'SHADOW') return { allowed: true, reason: 'SHADOW_SAFE_DEFAULT', metrics: calculated };
  if (target === 'AUTOMATIC' && !ownerApproved) return { allowed: false, reason: 'OWNER_APPROVAL_REQUIRED', metrics: calculated };
  const gate = GATES[target as keyof typeof GATES];
  const windowPasses = (window: AutomationMetricWindow, minimum: number) => {
    const value = rates(window);
    return nonNegative(window.reviewed) >= minimum
      && value.accuracy >= gate.accuracy
      && value.conflictRate <= gate.conflictRate
      && value.abstentionRate <= gate.abstentionRate
      && value.raceContextErrorRate <= gate.raceContextErrorRate
      && nonNegative(window.highRiskFalsePositive) === 0
      && nonNegative(window.unauthorizedAction) === 0;
  };
  if (!windowPasses(metrics, gate.historicalReviewed)) return { allowed: false, reason: gate.historicalFailureReason, metrics: calculated };
  const recentValid = Boolean(metrics.recent)
    && metrics.window?.recentDays === RECENT_WINDOW_DAYS
    && metrics.window?.metricSchemaVersion === METRIC_SCHEMA_VERSION;
  if (!recentValid || !windowPasses(metrics.recent!, gate.recentReviewed)) return { allowed: false, reason: 'RECENT_METRICS_INSUFFICIENT', metrics: calculated };
  return { allowed: true, reason: gate.passReason, metrics: calculated };
}
```

- [ ] **Step 3: Keep public signature and delegate**

```ts
export function canPromoteAutomation(
  current: AutomationState,
  target: AutomationState,
  metrics: AutomationMetrics,
  ownerApproved = false
): PromotionDecision {
  return evaluateAutomationPromotion(current, target, metrics, ownerApproved);
}
```

- [ ] **Step 4: Run tests/typecheck and commit**

```bash
npm --workspace backend run test:hipico
npm --workspace backend run typecheck
git add backend/src/modules/hipico/agent-promotion-policy.ts backend/src/modules/hipico/agent-policy.ts backend/src/modules/hipico/agent-policy.test.ts backend/src/modules/hipico/v8-agent-policy-equivalence.test.ts
git commit -m "refactor(hipico): isolate automation promotion policy"
```

---

### Task 3: Extract candidate and tool policy while preserving public exports

**Files:**
- Create: `backend/src/modules/hipico/agent-candidate-policy.ts`
- Create: `backend/src/modules/hipico/agent-tool-policy.ts`
- Modify: `backend/src/modules/hipico/agent-policy.ts`
- Test: `backend/src/modules/hipico/agent-policy.test.ts`
- Test: `backend/src/modules/hipico/v8-agent-policy-equivalence.test.ts`

**Interfaces:**
- Consumes: public `AgentCandidate`, `AgentTool`, `AutomationState` types.
- Produces: internal `normalizeModelCandidate`, `evaluateAgentCanAct`, `buildSafeToolRequest`; public names remain `validateModelCandidate`, `agentCanAct`, `safeToolRequest`.

- [ ] **Step 1: Extend characterization with existing error strings**

```ts
test('candidate/tool errors remain frozen', () => {
  assert.throws(() => validateModelCandidate({ intent: '', confidence: 2 }), /AGENT_CANDIDATE_SCHEMA_INVALID/);
  assert.throws(() => safeToolRequest({
    intent: 'query:NEXT_RACE', confidence: 1, tool: 'queryNextRace',
    arguments: { authorization: 'Bearer x' }, risk: 'safe', source: 'deterministic', modelVersion: null
  }), /AGENT_TOOL_ARGUMENTS_REJECTED/);
});
```

- [ ] **Step 2: Move candidate normalization into `agent-candidate-policy.ts`**

Preserve: intent bounded to 120, confidence `[0,1]`, exact risk enum, tool validation, argument default `{}`, source `model`, modelVersion bounded to 120, and `AGENT_CANDIDATE_SCHEMA_INVALID`.

- [ ] **Step 3: Move tool policy into `agent-tool-policy.ts`**

Preserve exactly:

```ts
export const AUTO_EXECUTABLE_TOOLS = ['queryRaceStatus', 'queryNextRace', 'queryLastResult', 'querySchedule', 'queryScratches'] as const;
export const MIN_AUTO_CONFIDENCE = .95;
```

Keep all current allowlists, dangerous-key regex, 8/24 key limits, 500/1000/4000 string bounds, numeric bound `1_000_000_000`, raceId/date regexes, proposable intents, and `AGENT_TOOL_ARGUMENTS_REJECTED`.

- [ ] **Step 4: Delegate from `agent-policy.ts` without changing signatures**

```ts
export const AUTO_EXECUTABLE_TOOLS = INTERNAL_AUTO_EXECUTABLE_TOOLS;
export const MIN_AUTO_CONFIDENCE = INTERNAL_MIN_AUTO_CONFIDENCE;
export function validateModelCandidate(value: unknown): AgentCandidate { return normalizeModelCandidate(value); }
export function agentCanAct(mode: AutomationState, candidate: AgentCandidate) { return evaluateAgentCanAct(mode, candidate); }
export function safeToolRequest(candidate: AgentCandidate) { return buildSafeToolRequest(candidate); }
```

- [ ] **Step 5: Run tests/typecheck and commit**

```bash
npm --workspace backend run test:hipico
npm --workspace backend run typecheck
git add backend/src/modules/hipico/agent-candidate-policy.ts backend/src/modules/hipico/agent-tool-policy.ts backend/src/modules/hipico/agent-policy.ts backend/src/modules/hipico/agent-policy.test.ts backend/src/modules/hipico/v8-agent-policy-equivalence.test.ts
git commit -m "refactor(hipico): isolate candidate and tool policy"
```

---

### Task 4: Extract automation scope and metrics reads without moving transaction boundaries

**Files:**
- Create: `backend/src/modules/hipico/automation-scope.ts`
- Create: `backend/src/modules/hipico/automation-metrics.repository.ts`
- Modify: `backend/src/modules/hipico/automation.store.ts`
- Test: `backend/src/modules/hipico/shadow-metrics-store.test.ts`
- Test: `backend/src/modules/hipico/promotion-snapshot.test.ts`
- PostgreSQL integration: `backend/src/modules/hipico/hipico-agent.integration.ts`

**Interfaces:**
- Consumes: Prisma/transaction client, `AutomationState`, `AutomationMetrics`.
- Produces: `assertAutomationScope`, `defaultAutomationMode`, `sourceMayTargetAutomation`, `lockAutomationScope`, `readAutomationMetricsSnapshot`.

- [ ] **Step 1: Characterize scope/default/metrics contracts**

Extend `shadow-metrics-store.test.ts` to assert the store still references `metric_schema_version = 'v7'`, `interval '30 days'`, `GROUP BY actual_intent`, and advisory locking. Extend `promotion-snapshot.test.ts` to assert SOURCE promotion still yields `SOURCE_SHADOW_ONLY` and transition replay returns persisted metrics/decision rather than recalculating them.

- [ ] **Step 2: Create `automation-scope.ts`**

```ts
export type AutomationScope = { ownerId: string; groupKey: string; groupId: string };
export function assertAutomationScope(ownerId: string, groupKey: string, groupId: string): void;
export function defaultAutomationMode(groupId: string): AutomationState;
export function sourceMayTargetAutomation(groupId: string, target: AutomationState): boolean;
export async function lockAutomationScope(db: DbClient, ownerId: string, groupKey: string, groupId: string): Promise<void>;
```

Move the current regexes and SOURCE lookup unchanged. Preserve the lock SQL exactly:

```sql
SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
```

- [ ] **Step 3: Create `automation-metrics.repository.ts` with current SELECTs unchanged**

```ts
export async function readAutomationMetricsSnapshot(
  db: DbClient,
  ownerId: string,
  groupKey: string,
  groupId: string
): Promise<AutomationMetrics>;
```

Move the historical, recent-v7/30-day, by-intent, and `recentSince` queries without changing filters, aliases, ordering, `Promise.all`, or `buildAutomationMetrics(...)` inputs.

- [ ] **Step 4: Preserve `AutomationStore.metrics()` transaction shape**

```ts
async metrics(ownerId: string, groupKey: string, groupId: string): Promise<AutomationMetrics> {
  assertAutomationScope(ownerId, groupKey, groupId);
  return prisma.$transaction(async (tx) => {
    await lockAutomationScope(tx, ownerId, groupKey, groupId);
    return readAutomationMetricsSnapshot(tx, ownerId, groupKey, groupId);
  });
}
```

- [ ] **Step 5: Run unit/integration/typecheck and commit**

```bash
npm --workspace backend run test:hipico
npm --workspace backend run test:hipico:agent
npm --workspace backend run typecheck
git add backend/src/modules/hipico/automation-scope.ts backend/src/modules/hipico/automation-metrics.repository.ts backend/src/modules/hipico/automation.store.ts backend/src/modules/hipico/shadow-metrics-store.test.ts backend/src/modules/hipico/promotion-snapshot.test.ts backend/src/modules/hipico/hipico-agent.integration.ts
git commit -m "refactor(hipico): isolate automation scope and metric reads"
```

---

### Task 5: Extract transition/evaluation persistence behind `AutomationStore`

**Files:**
- Create: `backend/src/modules/hipico/automation-transition.repository.ts`
- Create: `backend/src/modules/hipico/automation-evaluation.repository.ts`
- Modify: `backend/src/modules/hipico/automation.store.ts`
- Test: `backend/src/modules/hipico/promotion-snapshot.test.ts`
- Test: `backend/src/modules/hipico/shadow-metrics-store.test.ts`
- PostgreSQL integration: `backend/src/modules/hipico/hipico-agent.integration.ts`

**Interfaces:**
- Consumes: extracted scope/metrics helpers and current `AutomationStore` public methods.
- Produces: internal repository functions only; `AutomationStore.metrics/read/get/setMode/recordEvaluation/review/evaluations/transitionEvents` remain public with the same signatures.

- [ ] **Step 1: Characterize replay, mismatch, and immutable review**

Ensure the PostgreSQL integration covers:

```ts
await assert.rejects(secondReview, /HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED/);
await assert.rejects(mismatchedReplay, /HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH/);
assert.deepEqual(replay.metrics, first.metrics);
assert.deepEqual(replay.decision, first.decision);
```

- [ ] **Step 2: Create transition repository**

```ts
export async function readTransitionByIdempotency(
  db: DbClient,
  input: AutomationScope,
  idempotencyKey: string
): Promise<TransitionEventRow | null>;
export async function readCurrentAutomationModeForUpdate(db: DbClient, input: AutomationScope): Promise<AutomationState | null>;
export async function updateAutomationMode(db: DbClient, input: AutomationScope & { target: AutomationState; actorRef: string }): Promise<void>;
export async function insertAutomationTransition(db: DbClient, input: InsertTransitionEventInput): Promise<{ createdAt: Date | string }>;
```

Preserve SQL columns, JSON values, idempotency signature semantics, disposition values, and sort/limit behavior.

- [ ] **Step 3: Create evaluation repository**

Move only SQL persistence/list concerns. Preserve message SHA-256, evidence JSON, policy fields, v7 metric fields, review-once semantics, sort order, and bounds. `sanitizeAgentEvidence` stays exported from `automation.store.ts` as a façade even if its private implementation moves.

- [ ] **Step 4: Keep `setMode()` orchestration order explicit**

Inside one Prisma transaction, retain this exact logical order:

```ts
await lockAutomationScope(tx, input.ownerId, input.groupKey, input.groupId);
const prior = await readTransitionByIdempotency(tx, automationScope, input.idempotencyKey);
const current = await readCurrentAutomationModeForUpdate(tx, automationScope) ?? defaultAutomationMode(input.groupId);
const metrics = await readAutomationMetricsSnapshot(tx, input.ownerId, input.groupKey, input.groupId);
const policyDecision = canPromoteAutomation(current, input.target, metrics, input.ownerApproved);
// existing SOURCE_SHADOW_ONLY override remains here
// existing conditional mode update remains here
await insertAutomationTransition(tx, eventInput);
```

The replay/mismatch branch must still occur immediately after `readTransitionByIdempotency` and before reading current metrics.

- [ ] **Step 5: Run unit/PostgreSQL/typecheck and commit**

```bash
npm --workspace backend run test:hipico
npm --workspace backend run test:hipico:agent
npm --workspace backend run typecheck
git add backend/src/modules/hipico/automation-transition.repository.ts backend/src/modules/hipico/automation-evaluation.repository.ts backend/src/modules/hipico/automation.store.ts backend/src/modules/hipico/promotion-snapshot.test.ts backend/src/modules/hipico/shadow-metrics-store.test.ts backend/src/modules/hipico/hipico-agent.integration.ts
git commit -m "refactor(hipico): isolate automation persistence repositories"
```

---

### Task 6: Audit golden/metrics and avoid unnecessary churn

**Files:**
- Review: `backend/src/modules/hipico/agent-golden.ts`
- Review: `backend/src/modules/hipico/shadow-metrics.ts`
- Test: `backend/src/modules/hipico/agent-golden.test.ts`
- Test: `backend/src/modules/hipico/shadow-metrics.test.ts`

**Interfaces:**
- Consumes: current golden scorer and metric helpers.
- Produces: explicit regression coverage; production files change only if an identical helper extraction removes real duplication without changing the golden signature input.

- [ ] **Step 1: Strengthen signature-semantics test before any production edit**

```ts
const first = scoreGoldenCorpus(corpus, deterministicAgentParser);
const second = scoreGoldenCorpus(corpus, deterministicAgentParser);
assert.equal(second.signature, first.signature);
assert.deepEqual(second.cases, first.cases);
assert.deepEqual(second.byIntent, first.byIntent);
```

Retain existing SHA-256 format and zero high-risk/unauthorized automatic assertions.

- [ ] **Step 2: Keep signature input byte-semantics unchanged**

If an attempted deduplication would alter the following expression, do not refactor that path:

```ts
crypto.createHash('sha256').update(JSON.stringify({ version: corpus.version, cases })).digest('hex');
```

Only reuse `normalizeMetricWindow` for aggregations outside that signature input. If no safe duplication exists, leave both production files unchanged and commit only strengthened characterization.

- [ ] **Step 3: Run tests/typecheck and commit**

```bash
npm --workspace backend run test:hipico
npm --workspace backend run typecheck
git add backend/src/modules/hipico/agent-golden.test.ts backend/src/modules/hipico/shadow-metrics.test.ts
git commit -m "test(hipico): lock golden and metric equivalence for v8"
```

If a production file was safely changed, include only that file in the same commit.

---

### Task 7: Thin Agent route support without changing HTTP contracts

**Files:**
- Create: `backend/src/modules/hipico/agent-route-support.ts`
- Modify: `backend/src/modules/hipico/agent.routes.ts`
- Test: `backend/src/modules/hipico/agent-route-security.test.ts`
- Test: `backend/src/modules/hipico/shadow-metrics-routes.test.ts`
- Test: `backend/src/modules/hipico/v8-public-contracts.test.ts`

**Interfaces:**
- Consumes: existing operator-token utilities, environment values, Zod parsed values, and Hípico error mapping.
- Produces: internal request/config helpers; route paths, schemas, auth, headers, status mapping, and response JSON remain unchanged.

- [ ] **Step 1: Characterize route methods/paths and status mapping**

Freeze these exact routes:

```text
GET  /groups/:groupId/automation
POST /groups/:groupId/automation
GET  /groups/:groupId/automation/transitions
GET  /groups/:groupId/automation/evaluations
POST /groups/:groupId/automation/evaluate
POST /groups/:groupId/automation/evaluations/:id/review
```

Keep 401 for invalid operator token, 503 for missing operator/owner/actor configuration, 409 for replay mismatch/already-reviewed/metric gate failures, and `Cache-Control: no-store, max-age=0`.

- [ ] **Step 2: Create support helpers with existing semantics**

```ts
export function configuredHipicoOwnerId(): string;
export function resolveHipicoGroupKey(req: Request): string;
export function resolveAutomationGroupId(req: Request): string;
export function resolveAutomationIdempotencyKey(req: Request): string;
export function configuredAutomationActorRef(): string;
export function automaticOwnerApprovalConfigured(): boolean;
export function sourceReadOnly(groupId: string): boolean;
export function serverRiskContext(groupId: string): AgentRiskContext;
export function automationHttpStatus(code: string): number;
```

`serverRiskContext()` must preserve `evidenceState:'MISSING'`, `sourceAuthorized:false`, `systemHealthy:true`, `humanOwned:false`, `ambiguous:false`, and SOURCE read-only detection. Keep strict Zod schemas in `agent.routes.ts` so request acceptance semantics do not drift.

- [ ] **Step 3: Delegate from routes and run tests**

```bash
npm --workspace backend run test:hipico
npm --workspace backend run typecheck
git add backend/src/modules/hipico/agent-route-support.ts backend/src/modules/hipico/agent.routes.ts backend/src/modules/hipico/agent-route-security.test.ts backend/src/modules/hipico/shadow-metrics-routes.test.ts backend/src/modules/hipico/v8-public-contracts.test.ts
git commit -m "refactor(hipico): isolate agent route support helpers"
```

---

### Task 8: Protect untouched outbox/Command Center boundaries and add exact-SHA v8 workflow

**Files:**
- Create: `backend/src/modules/hipico/v8-boundary-regression.test.ts`
- Create: `.github/workflows/hipico-v8-refactor.yml`
- Do not modify production outbox or Command Center files unless a new characterization test first proves a behavior-identical extraction is necessary.

**Interfaces:**
- Consumes: canonical outbox and Command Center contracts.
- Produces: evidence that v8 did not alter unrelated runtime behavior and a dedicated exact-SHA workflow.

- [ ] **Step 1: Add boundary regression contracts**

Assert that the canonical outbox remains `public.hipico_outbox`, ambiguous delivery still maps to `reconciliation_required`, approval-required rows remain excluded from generic claims, the runner remains disabled by default, Command Center route/service contracts remain present, SOURCE automatic enablement is absent, and no financial-authority path is introduced.

- [ ] **Step 2: Add exact-SHA workflow**

```yaml
name: Hípico v8 Behavior-Preserving Refactor
on:
  pull_request:
  workflow_dispatch:
permissions: { contents: read }
env:
  HIPICO_CANDIDATE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}
jobs:
  equivalence:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres -d postgres"
          --health-interval 5s --health-timeout 5s --health-retries 20
    steps:
      - uses: actions/checkout@v7
        with: { ref: "${{ env.HIPICO_CANDIDATE_SHA }}", fetch-depth: 0 }
      - run: node scripts/hipico-exact-sha-gate.mjs
      - uses: actions/setup-node@v7
        with: { node-version: '22', cache: npm, cache-dependency-path: package-lock.json }
      - run: npm ci --no-audit --no-fund
      - run: npm --workspace backend run typecheck
      - run: npm --workspace backend run test:hipico
      - run: npm --workspace backend run test:hipico:agent
      - run: npm --workspace backend run build
```

Include isolated DB creation before `test:hipico:agent`, `git diff --check` against PR base, and `if: always()` database cleanup using the same safe pattern as v6/v7 workflows.

- [ ] **Step 3: Compare migration paths to v7 baseline**

```bash
git diff --name-only 5983efc0de1929ac674dbd96c756f960c380f703 HEAD -- supabase/sql backend/prisma/migrations
```

Expected: no output.

- [ ] **Step 4: Run available gates and commit**

```bash
npm --workspace backend run test:hipico
npm --workspace backend run typecheck
npm --workspace backend run build
git add backend/src/modules/hipico/v8-boundary-regression.test.ts .github/workflows/hipico-v8-refactor.yml
git commit -m "ci(hipico): add v8 behavior equivalence gate"
```

---

### Task 9: Final equivalence review and stacked PR

**Files:**
- Review every file changed from v7 baseline `5983efc0de1929ac674dbd96c756f960c380f703`.
- Modify only tests/docs/workflow if final review finds missing evidence; do not introduce new behavior.

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces: one reviewable stacked PR whose diff contains only behavior-preserving refactor, tests, docs, and CI.

- [ ] **Step 1: Review changed files and whitespace**

```bash
git diff --check 5983efc0de1929ac674dbd96c756f960c380f703 HEAD
git diff --name-status 5983efc0de1929ac674dbd96c756f960c380f703 HEAD
```

Reject any route rename, migration edit, new required env var, threshold/reason change, outbox semantic change, SOURCE promotion path, or financial-authority change.

- [ ] **Step 2: Run full gates**

```bash
npm --workspace backend run typecheck
npm --workspace backend run test:hipico
npm --workspace backend run test:hipico:agent
npm --workspace backend run build
```

Classify each as `VERIFIED`, `FAILED`, or `BLOCKED_INFRASTRUCTURE`; do not infer green from a workflow conclusion with zero executed steps.

- [ ] **Step 3: Open stacked PR**

Base the PR on `feat/hipico-shadow-metrics-v7` while PR #351 remains unmerged. Include baseline SHA, final candidate SHA, frozen contracts, changed files, verification evidence, parent blockers, and the explicit statement that v8 contains no intended product behavior changes.

- [ ] **Step 4: Inspect exact-SHA job evidence**

A valid verification requires a real runner and executed steps. `steps=[]`, `steps=null`, or `runner_id=0` means `BLOCKED_INFRASTRUCTURE` and the PR remains DRAFT.

- [ ] **Step 5: Final status**

Declare `DONE` only after exact-SHA typecheck/tests/PostgreSQL/build evidence is real and diff review shows no contract drift. Otherwise report `PARTIAL/BLOCKED` with the exact external blocker.
