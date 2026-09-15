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
- Preserve exact transaction ordering in `AutomationStore.setMode()`: lock scope → replay check → current state lock/read → metric snapshot → policy decision → optional state update → transition insert.
- Preserve current golden-corpus result fields and signature input semantics.
- Characterization tests must exist before each extraction.
- A GitHub Actions job with no executed steps or `runner_id=0` is `BLOCKED_INFRASTRUCTURE`, never PASS.

---

### Task 1: Freeze public contracts and characterization fixtures

**Files:**
- Create: `backend/src/modules/hipico/v8-public-contracts.test.ts`
- Create: `backend/src/modules/hipico/v8-agent-policy-equivalence.test.ts`
- Modify only if needed for testability: none in production code.

**Interfaces:**
- Consumes: current exports from `agent-policy.ts`, `automation.store.ts`, `agent-golden.ts`, `shadow-metrics.ts`, canonical outbox modules, and `agent.routes.ts` source contract.
- Produces: characterization tests that later extraction tasks must keep green.

- [ ] **Step 1: Write public symbol manifest characterization**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import * as agentPolicy from './agent-policy.js';
import * as automationStore from './automation.store.js';
import * as golden from './agent-golden.js';

const REQUIRED_AGENT_EXPORTS = [
  'AUTOMATION_STATES', 'AGENT_TOOLS', 'AUTO_EXECUTABLE_TOOLS', 'MIN_AUTO_CONFIDENCE',
  'canPromoteAutomation', 'validateModelCandidate', 'agentCanAct', 'safeToolRequest', 'HipicoAgentEngine'
] as const;

test('v8 preserves public Hípico façade exports', () => {
  for (const key of REQUIRED_AGENT_EXPORTS) assert.ok(key in agentPolicy, `missing export ${key}`);
  assert.ok('AutomationStore' in automationStore);
  assert.ok('sanitizeAgentEvidence' in automationStore);
  assert.ok('scoreGoldenCorpus' in golden);
});
```

- [ ] **Step 2: Add policy equivalence fixtures**

```ts
import { canPromoteAutomation, validateModelCandidate, safeToolRequest, agentCanAct } from './agent-policy.js';

const recentWindow = { reviewed: 75, matched: 74, highRiskFalsePositive: 0, unauthorizedAction: 0, conflicts: 0, abstentions: 0, raceContextErrors: 0 };
const historical = { reviewed: 200, matched: 196, highRiskFalsePositive: 0, unauthorizedAction: 0, conflicts: 0, abstentions: 0, raceContextErrors: 0 };

test('v8 freezes representative promotion reasons', () => {
  const allowed = canPromoteAutomation('SHADOW', 'ASSISTED', {
    ...historical,
    recent: recentWindow,
    window: { recentDays: 30, metricSchemaVersion: 'v7', recentSince: '2026-08-16T00:00:00.000Z' }
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.reason, 'SHADOW_GATE_PASSED');
  assert.equal(canPromoteAutomation('SHADOW', 'AUTOMATIC_LOW_RISK', historical).reason, 'INVALID_PROMOTION_PATH');
});
```

Also include fixtures for model-candidate validation, tool-argument rejection, automatic low-risk eligibility, SOURCE guard source contract, and golden signature stability using the existing fixed corpus fixture.

- [ ] **Step 3: Run characterization suite and record actual result**

Run:

```bash
npm --workspace backend run test:hipico
```

Expected: existing behavior passes. If execution is unavailable because GitHub runner never starts, record `BLOCKED_INFRASTRUCTURE` and do not describe it as PASS.

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
- Consumes: existing `AutomationState`, `AutomationMetrics`, `AutomationMetricRates`, `PromotionDecision` public types.
- Produces: internal `evaluateAutomationPromotion(current, target, metrics, ownerApproved)` used by public `canPromoteAutomation(...)`.

- [ ] **Step 1: Add a failing delegation/source contract test**

```ts
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(new URL('./agent-policy.ts', import.meta.url), 'utf8');

test('public canPromoteAutomation remains in agent-policy façade and delegates internally', () => {
  assert.match(source, /export function canPromoteAutomation/);
  assert.match(source, /evaluateAutomationPromotion/);
});
```

- [ ] **Step 2: Create internal promotion module with copied semantics**

`agent-promotion-policy.ts` must contain the current v7 constants and calculations unchanged:

```ts
export const RECENT_WINDOW_DAYS = 30;
export const METRIC_SCHEMA_VERSION = 'v7';

export function evaluateAutomationPromotion(
  current: AutomationState,
  target: AutomationState,
  metrics: AutomationMetrics,
  ownerApproved = false
): PromotionDecision {
  // Move the existing implementation byte-for-behavior, not threshold-by-threshold redesign.
}
```

Keep `PROMOTION_GATES` values exactly as v7: ASSISTED `200/75/.98/.02/.05/.02`; AUTOMATIC_LOW_RISK `500/200/.99/.005/.03/.005`; AUTOMATIC `1000/400/.995/.002/.02/.002`.

- [ ] **Step 3: Make `agent-policy.ts` façade delegate without changing signature**

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

- [ ] **Step 4: Run policy and Hípico tests**

```bash
npm --workspace backend run test:hipico
npm --workspace backend run typecheck
```

Expected: no behavior change.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/hipico/agent-promotion-policy.ts backend/src/modules/hipico/agent-policy.ts backend/src/modules/hipico/agent-policy.test.ts backend/src/modules/hipico/v8-agent-policy-equivalence.test.ts
git commit -m "refactor(hipico): isolate automation promotion policy"
```

---

### Task 3: Extract model-candidate and tool policy while preserving façade exports

**Files:**
- Create: `backend/src/modules/hipico/agent-candidate-policy.ts`
- Create: `backend/src/modules/hipico/agent-tool-policy.ts`
- Modify: `backend/src/modules/hipico/agent-policy.ts`
- Test: `backend/src/modules/hipico/agent-policy.test.ts`
- Test: `backend/src/modules/hipico/v8-agent-policy-equivalence.test.ts`

**Interfaces:**
- Consumes: public `AgentCandidate`, `AgentTool`, `AutomationState` types.
- Produces: internal `normalizeModelCandidate(value)`, `evaluateAgentCanAct(mode, candidate)`, and `buildSafeToolRequest(candidate)` while public functions retain the names `validateModelCandidate`, `agentCanAct`, and `safeToolRequest`.

- [ ] **Step 1: Add exact error-code characterization**

```ts
test('candidate and tool policy preserves existing public error codes', () => {
  assert.throws(() => validateModelCandidate({ intent: '', confidence: 2 }), /AGENT_CANDIDATE_SCHEMA_INVALID/);
  assert.throws(() => safeToolRequest({
    intent: 'x', confidence: 1, tool: 'queryNextRace', arguments: { token: 'x' },
    risk: 'safe', source: 'deterministic', modelVersion: null
  }), /AGENT_TOOL_ARGUMENTS_REJECTED/);
});
```

- [ ] **Step 2: Move candidate normalization unchanged**

`agent-candidate-policy.ts` owns bounded model candidate parsing. It must preserve `intent` length 120, confidence `[0,1]`, exact risk enum, tool validation, argument default `{}`, source `model`, and modelVersion length 120.

- [ ] **Step 3: Move tool allowlist/sanitization unchanged**

`agent-tool-policy.ts` owns `AUTO_EXECUTABLE_TOOLS`, `MIN_AUTO_CONFIDENCE`, dangerous-key rejection, `ALLOWED_KEYS`, `PROPOSABLE_INTENTS`, safe scalar/entity handling, and automatic eligibility. Do not alter max lengths, regexes, numeric bounds, or error strings.

- [ ] **Step 4: Delegate from public façade**

`agent-policy.ts` must continue exporting:

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

### Task 4: Extract automation scope and metrics repository without moving transaction boundaries

**Files:**
- Create: `backend/src/modules/hipico/automation-scope.ts`
- Create: `backend/src/modules/hipico/automation-metrics.repository.ts`
- Modify: `backend/src/modules/hipico/automation.store.ts`
- Test: `backend/src/modules/hipico/automation-store.test.ts`
- Test: `backend/src/modules/hipico/agent-shadow-postgres.e2e.test.ts`

**Interfaces:**
- Consumes: Prisma/transaction client, `AutomationState`, `AutomationMetrics`.
- Produces: `assertAutomationScope`, `defaultAutomationMode`, `sourceMayTargetAutomation`, `lockAutomationScope`, `readAutomationMetricsSnapshot`.

- [ ] **Step 1: Characterize scope defaults and SOURCE restriction**

Add tests proving invalid owner/group/groupId produce the same codes, SOURCE defaults to `SHADOW`, non-SOURCE defaults to `DISABLED`, and SOURCE cannot target above `SHADOW`.

- [ ] **Step 2: Move pure scope helpers**

`automation-scope.ts` owns current regexes, SOURCE env lookup, default mode, target guard, advisory lock key, and `lockAutomationScope(db, ownerId, groupKey, groupId)`. Preserve the lock SQL exactly:

```sql
SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
```

- [ ] **Step 3: Move metric SELECTs unchanged**

`automation-metrics.repository.ts` owns historical, recent-v7/30-day, by-intent, recentSince reads and returns `buildAutomationMetrics(...)`. Keep the same SQL filters, aliases, `Promise.all` structure, and normalization.

- [ ] **Step 4: Keep `AutomationStore.metrics()` transaction shape unchanged**

```ts
async metrics(ownerId: string, groupKey: string, groupId: string): Promise<AutomationMetrics> {
  assertAutomationScope(ownerId, groupKey, groupId);
  return prisma.$transaction(async (tx) => {
    await lockAutomationScope(tx, ownerId, groupKey, groupId);
    return readAutomationMetricsSnapshot(tx, ownerId, groupKey, groupId);
  });
}
```

- [ ] **Step 5: Run Hípico + PostgreSQL Agent suite and commit**

```bash
npm --workspace backend run test:hipico
npm --workspace backend run test:hipico:agent
npm --workspace backend run typecheck
git add backend/src/modules/hipico/automation-scope.ts backend/src/modules/hipico/automation-metrics.repository.ts backend/src/modules/hipico/automation.store.ts backend/src/modules/hipico/automation-store.test.ts backend/src/modules/hipico/agent-shadow-postgres.e2e.test.ts
git commit -m "refactor(hipico): isolate automation scope and metric reads"
```

---

### Task 5: Extract evaluation and transition persistence behind `AutomationStore`

**Files:**
- Create: `backend/src/modules/hipico/automation-evaluation.repository.ts`
- Create: `backend/src/modules/hipico/automation-transition.repository.ts`
- Modify: `backend/src/modules/hipico/automation.store.ts`
- Test: `backend/src/modules/hipico/automation-store.test.ts`
- Test: `backend/src/modules/hipico/agent-shadow-postgres.e2e.test.ts`

**Interfaces:**
- Consumes: already-extracted scope/metrics helpers and existing `AutomationStore` public methods.
- Produces: internal repository functions only; `AutomationStore` public method names and arguments remain unchanged.

- [ ] **Step 1: Characterize replay snapshot and review immutability**

Add tests proving that replay of the same idempotency key returns the original persisted metrics/decision snapshot, mismatched replay throws `HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH`, and second review throws `HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED`.

- [ ] **Step 2: Move transition read/insert SQL**

Create helpers:

```ts
export async function readTransitionByIdempotency(db: DbClient, scope: Scope, idempotencyKey: string): Promise<TransitionEventRow | null>;
export async function insertTransitionEvent(db: DbClient, input: InsertTransitionEventInput): Promise<{ createdAt: Date | string }>;
```

Do not change stored JSON payloads, idempotency signature calculation, or event disposition values.

- [ ] **Step 3: Move evaluation insert/review/list SQL**

Create repository functions for evaluation insert, one-time review, evaluation list, and transition list. Preserve all column names, sort order, limits, evidence fields, policy fields, and v7 metric fields.

- [ ] **Step 4: Keep `setMode()` orchestration order explicit in `AutomationStore`**

The façade must still perform, inside one Prisma transaction:

```ts
await lockAutomationScope(...);
const prior = await readTransitionByIdempotency(...);
// replay/mismatch branch
const current = await readCurrentModeForUpdate(...);
const metrics = await readAutomationMetricsSnapshot(...);
const policyDecision = canPromoteAutomation(...);
// SOURCE restriction
// optional state update
await insertTransitionEvent(...);
```

Do not move any of these steps outside the transaction.

- [ ] **Step 5: Run tests/typecheck and commit**

```bash
npm --workspace backend run test:hipico
npm --workspace backend run test:hipico:agent
npm --workspace backend run typecheck
git add backend/src/modules/hipico/automation-evaluation.repository.ts backend/src/modules/hipico/automation-transition.repository.ts backend/src/modules/hipico/automation.store.ts backend/src/modules/hipico/automation-store.test.ts backend/src/modules/hipico/agent-shadow-postgres.e2e.test.ts
git commit -m "refactor(hipico): isolate automation persistence repositories"
```

---

### Task 6: Deduplicate golden/metric helpers without changing signatures

**Files:**
- Modify: `backend/src/modules/hipico/agent-golden.ts`
- Modify if needed: `backend/src/modules/hipico/shadow-metrics.ts`
- Test: `backend/src/modules/hipico/agent-golden.test.ts`
- Test: `backend/src/modules/hipico/shadow-metrics.test.ts`

**Interfaces:**
- Consumes: `normalizeMetricWindow`, existing case scoring, existing signature behavior.
- Produces: same `scoreGoldenCorpus(value, parser)` result fields and same SHA-256 signature for the fixed corpus.

- [ ] **Step 1: Freeze a fixed-corpus signature**

Add a fixture whose expected signature is generated from the pre-refactor v7 implementation and assert exact equality, together with the existing fields `version`, `total`, `matched`, `accuracy`, `highRiskFalsePositive`, `unauthorizedAutomaticAction`, `signature`, and `cases`.

- [ ] **Step 2: Reuse only semantically identical metric normalization**

Golden aggregation may call existing pure helpers, but the signature input remains exactly:

```ts
crypto.createHash('sha256').update(JSON.stringify({ version: corpus.version, cases })).digest('hex');
```

Do not sort/rewrite the `cases` array or add new signature inputs.

- [ ] **Step 3: Run golden/shadow/Hípico tests and commit**

```bash
npm --workspace backend run test:hipico
npm --workspace backend run typecheck
git add backend/src/modules/hipico/agent-golden.ts backend/src/modules/hipico/shadow-metrics.ts backend/src/modules/hipico/agent-golden.test.ts backend/src/modules/hipico/shadow-metrics.test.ts
git commit -m "refactor(hipico): reuse metric helpers without scoring drift"
```

---

### Task 7: Thin Agent route support without changing HTTP contracts

**Files:**
- Create: `backend/src/modules/hipico/agent-route-support.ts`
- Modify: `backend/src/modules/hipico/agent.routes.ts`
- Test: `backend/src/modules/hipico/agent-route-security.test.ts`
- Test: `backend/src/modules/hipico/v8-public-contracts.test.ts`

**Interfaces:**
- Consumes: existing operator token utilities, env vars, Zod input values, and Hípico error mapping.
- Produces: internal helpers for owner/group parsing, actor/idempotency resolution, SOURCE read-only context, and status-code mapping. Routes and response bodies remain unchanged.

- [ ] **Step 1: Characterize route method/path/status contract**

Assert the source still exposes:

```text
GET  /groups/:groupId/automation
POST /groups/:groupId/automation
GET  /groups/:groupId/automation/transitions
GET  /groups/:groupId/automation/evaluations
POST /groups/:groupId/automation/evaluate
POST /groups/:groupId/automation/evaluations/:id/review
```

Also freeze 401 for bad operator token, 503 for missing operator token/owner/actor configuration, 409 for replay mismatch/already-reviewed/metric gate failures, and `Cache-Control: no-store, max-age=0`.

- [ ] **Step 2: Extract private support helpers**

Move only pure/request-resolution helpers; keep Zod schemas and router declarations in `agent.routes.ts` unless extraction would alter inference or strictness. `serverRiskContext(gid)` must continue returning fail-closed `evidenceState:'MISSING'`, `sourceAuthorized:false`, `systemHealthy:true`, `humanOwned:false`, `ambiguous:false`, plus SOURCE read-only state.

- [ ] **Step 3: Run route/security tests and commit**

```bash
npm --workspace backend run test:hipico
npm --workspace backend run typecheck
git add backend/src/modules/hipico/agent-route-support.ts backend/src/modules/hipico/agent.routes.ts backend/src/modules/hipico/agent-route-security.test.ts backend/src/modules/hipico/v8-public-contracts.test.ts
git commit -m "refactor(hipico): isolate agent route support helpers"
```

---

### Task 8: Audit untouched outbox/Command Center boundaries and add exact-SHA v8 gate

**Files:**
- Create: `backend/src/modules/hipico/v8-boundary-regression.test.ts`
- Create: `.github/workflows/hipico-v8-refactor.yml`
- Modify production outbox/Command Center files only if a characterization test proves a behavior-identical extraction is necessary; otherwise leave them untouched.

**Interfaces:**
- Consumes: existing canonical outbox and Command Center contracts.
- Produces: explicit evidence that v8 did not alter unrelated behavior and a dedicated exact-SHA workflow.

- [ ] **Step 1: Add boundary regression assertions**

Cover at minimum: canonical outbox authority remains `public.hipico_outbox`; ambiguous delivery still resolves to `reconciliation_required`; approval-required rows are excluded from generic worker claims; runner default remains disabled; Command Center route/read-model source contracts remain present; SOURCE automatic enablement is absent; no financial-authority path is added.

- [ ] **Step 2: Add exact-SHA workflow**

Workflow `Hípico v8 Behavior-Preserving Refactor` must:

```yaml
- checkout exact PR head SHA
- run scripts/hipico-exact-sha-gate.mjs
- setup Node 22
- npm ci --no-audit --no-fund
- start PostgreSQL 16 service and isolated DB
- npm --workspace backend run typecheck
- npm --workspace backend run test:hipico
- npm --workspace backend run test:hipico:agent
- npm --workspace backend run build
- git diff --check against PR base
- always drop isolated DB
```

- [ ] **Step 3: Verify no migration drift**

Use compare/diff inspection to ensure no file under `supabase/sql/` or `backend/prisma/migrations/` changed from v7 baseline `5983efc0de1929ac674dbd96c756f960c380f703`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/hipico/v8-boundary-regression.test.ts .github/workflows/hipico-v8-refactor.yml
git commit -m "ci(hipico): add v8 behavior equivalence gate"
```

---

### Task 9: Final equivalence review and PR publication

**Files:**
- Review all v8 changed files.
- Modify only tests/docs/workflow if final review finds missing evidence; do not introduce new feature behavior.

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces: one reviewable stacked PR whose diff contains only behavior-preserving refactor, tests, docs, and CI.

- [ ] **Step 1: Compare v7 baseline to v8 candidate**

```bash
git diff --check 5983efc0de1929ac674dbd96c756f960c380f703 HEAD
git diff --name-status 5983efc0de1929ac674dbd96c756f960c380f703 HEAD
```

Reject any route rename, migration edit, new env var requirement, threshold/reason change, outbox semantic change, SOURCE promotion path, or financial authority change.

- [ ] **Step 2: Run full local/CI-capable gates**

```bash
npm --workspace backend run typecheck
npm --workspace backend run test:hipico
npm --workspace backend run test:hipico:agent
npm --workspace backend run build
```

Record each as `VERIFIED`, `FAILED`, or `BLOCKED_INFRASTRUCTURE`; never infer green from a workflow conclusion with zero executed steps.

- [ ] **Step 3: Open stacked PR**

Base the PR on `feat/hipico-shadow-metrics-v7` while PR #351 remains unmerged. Describe the baseline SHA, final candidate SHA, frozen contracts, files changed, verification evidence, parent blockers, and explicit statement that v8 contains no product behavior changes.

- [ ] **Step 4: Inspect exact-SHA workflow jobs**

A valid verification requires at least the checkout step to have executed and the job to have a real runner. `steps=[]`, `steps=null`, or `runner_id=0` means `BLOCKED_INFRASTRUCTURE` and the PR stays DRAFT.

- [ ] **Step 5: Final status**

Declare `DONE` only after exact-SHA tests/build/PostgreSQL evidence are real and the diff review shows no contract drift. Otherwise report `PARTIAL/BLOCKED` with the exact external blocker.
