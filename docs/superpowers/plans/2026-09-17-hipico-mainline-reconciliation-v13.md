# Control Hípico Mainline Reconciliation v13 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the missing v9→v12 Control Hípico capabilities into current `main` without overwriting newer mainline behavior, while preserving exact-SHA evidence and all SOURCE/LAB/financial authority safety invariants.

**Architecture:** Treat current `main@ab02c550f24c3347121d8c74c636b450245036ac` as the authority for every existing file. Reconcile historical v9→v12 behavior semantically: additive files may be ported after compatibility checks, while files changed on both lines require a characterization test first and the smallest current-architecture edit. The final branch must produce one draft PR to `main` and may report only checks actually executed for its exact candidate SHA.

**Tech Stack:** Node.js, TypeScript, native Node test runner, PostgreSQL/Supabase SQL, GitHub Actions, existing Control Hípico backend/frontend/QA scripts.

**Spec:** `docs/superpowers/specs/2026-09-17-hipico-mainline-reconciliation-v13-design.md`

## Global Constraints

- `SOURCE = READ_ONLY`.
- During QA, LAB is the only permitted write destination.
- `financialAuthority = false`.
- LLMs do not write directly to the database or settle money.
- PostgreSQL server remains authoritative; IndexedDB is projection/offline/outbox only.
- Multi-group state remains scoped by `ownerId + groupKey + groupId` plus race/meeting scope where applicable.
- Dedupe, idempotency, replay protection, leases, receipts, reconciliation and canonical send authority cannot regress.
- No skipped/disabled suites, `continue-on-error`, `|| true`, arbitrary sleeps or forced browser actions may manufacture a pass.
- `runner_id=0` + `steps=[]` + no runner logs is `BLOCKED_INFRASTRUCTURE`, not PASS.
- Every PASS must belong to the exact 40-hex candidate SHA.
- Current `main` wins when a historical implementation is superseded by a newer compatible implementation.

---

### Task 1: Build the v13 reconciliation contract and inventory

**Files:**
- Create: `tests/hipico_v13_mainline_reconciliation.test.mjs`
- Create: `ops/roadmap/hipico-v13-mainline-reconciliation.json`

**Interfaces:**
- Consumes: repository files and historical v9/v10/v11/v12 contract names from the approved spec.
- Produces: a versioned inventory with `PRESENT | MISSING | SUPERSEDED | CONFLICT` classifications and a root contract that fails while required v10/v11/v12 assets are absent.

- [ ] **Step 1: Write the failing root reconciliation test**

Create a Node test that reads the inventory plus the required current-branch artifacts and asserts at minimum:

```js
assert.equal(inventory.baseline, 'ab02c550f24c3347121d8c74c636b450245036ac');
assert.equal(inventory.invariants.sourceReadOnly, true);
assert.equal(inventory.invariants.labWriteOnlyDuringQa, true);
assert.equal(inventory.invariants.financialAuthority, false);
assert.ok(fs.existsSync('backend/src/modules/hipico/agent-adversarial-golden.ts'));
assert.ok(fs.existsSync('backend/src/modules/hipico-bot/hipico-observability.ts'));
assert.ok(fs.existsSync('scripts/hipico-release-manifest-v12.mjs'));
```

The test must also validate that every inventory entry uses one of the four allowed classifications and that each `CONFLICT` entry names its current-main authority file.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test tests/hipico_v13_mainline_reconciliation.test.mjs
```

Expected result on the baseline branch: FAIL because v10/v11/v12 assets are absent.

- [ ] **Step 3: Add the initial inventory**

Record v9/v10/v11/v12 files from the approved spec. Mark additive files absent from main as `MISSING`; mark `agent-engine.ts`, `agent.routes.ts`, `hipico-webhook-outbound.ts`, `hipico-outbound-worker.ts`, release/CI scripts changed on both lines as `CONFLICT`; use `PRESENT` or `SUPERSEDED` only after reading the current-main implementation.

- [ ] **Step 4: Keep the test RED for product behavior**

Re-run the root contract. The inventory schema should now validate, while missing implementation assets must continue to fail.

- [ ] **Step 5: Commit**

```bash
git add tests/hipico_v13_mainline_reconciliation.test.mjs ops/roadmap/hipico-v13-mainline-reconciliation.json
git commit -m "test(hipico): characterize v13 reconciliation gaps"
```

### Task 2: Reconcile v10 golden/adversarial behavior

**Files:**
- Create: `.github/workflows/hipico-golden-adversarial-v10.yml`
- Create: `backend/scripts/hipico-agent-golden-v10.ts`
- Create: `backend/src/modules/hipico/agent-adversarial-golden.ts`
- Create: `backend/src/modules/hipico/agent-adversarial-golden.test.ts`
- Create: `backend/src/modules/hipico/agent-adversarial-integration.test.ts`
- Create: `backend/src/modules/hipico/corpus/hipico-agent-adversarial.v10.json`
- Create: `tests/hipico_v10_golden_contract.test.mjs`
- Modify only if needed: `backend/src/modules/hipico/agent-engine.ts`
- Modify: `ops/roadmap/hipico-v13-mainline-reconciliation.json`

**Interfaces:**
- Consumes: current `evaluateHipicoAgent`/agent-engine interfaces and current risk-policy contracts.
- Produces: deterministic golden/adversarial cases and exact-SHA CI evidence with no new financial authority.

- [ ] **Step 1: Port the v10 tests/corpus first**

Add the historical tests and corpus, adapting imports only to current module paths. The integration test must assert that unsafe/high-risk cases cannot produce automatic external-send/financial authority.

- [ ] **Step 2: Run focused v10 tests and verify RED**

```bash
cd backend && npm test -- src/modules/hipico/agent-adversarial-golden.test.ts src/modules/hipico/agent-adversarial-integration.test.ts
cd .. && node --test tests/hipico_v10_golden_contract.test.mjs
```

Expected: FAIL because the golden implementation/script/workflow is absent.

- [ ] **Step 3: Implement the additive golden evaluator and script**

Port the v10 implementation against current agent/risk types. Preserve deterministic case IDs, parser/policy version checks, corpus duplicate detection and sanitized evidence. Do not replace current `agent-engine.ts`; add only the smallest adapter/export required by the tests.

- [ ] **Step 4: Add the v10 workflow**

The workflow must install from the repository lockfile, run the exact golden test/script contract and emit candidate SHA evidence. It must not auto-deploy or use failure suppression.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the commands from Step 2 plus backend typecheck. Expected: PASS where dependencies are available.

- [ ] **Step 6: Update inventory and commit**

Classify additive v10 files as `PRESENT`; classify the engine integration as `SUPERSEDED` if current-main engine behavior was preserved with only an adapter.

```bash
git add .github/workflows/hipico-golden-adversarial-v10.yml backend/scripts backend/src/modules/hipico tests/hipico_v10_golden_contract.test.mjs ops/roadmap/hipico-v13-mainline-reconciliation.json
git commit -m "feat(hipico): reconcile v10 golden adversarial coverage"
```

### Task 3: Reconcile v11 observability without changing business authority

**Files:**
- Create: `.github/workflows/hipico-observability-v11.yml`
- Create: `backend/src/modules/hipico-bot/hipico-observability.ts`
- Create: `backend/src/modules/hipico-bot/hipico-observability.store.ts`
- Create: `backend/src/modules/hipico-bot/hipico-observability.test.ts`
- Create: `scripts/hipico-observability-v11-pg.mjs`
- Create or supersede after migration audit: `supabase/sql/hipico_v25_observability.sql`
- Modify semantically: `backend/src/modules/hipico/agent.routes.ts`
- Modify semantically: `backend/src/modules/hipico-bot/hipico-webhook-outbound.ts`
- Modify semantically: `backend/src/modules/hipico-bot/hipico-outbound-worker.ts`
- Modify: `ops/roadmap/hipico-v13-mainline-reconciliation.json`

**Interfaces:**
- Produces: sanitized `recordHipicoObservabilityEvent(...)`/store behavior and append-only scoped persistence; instrumentation is a side effect and never a business decision source.

- [ ] **Step 1: Add v11 observability tests before implementation**

Tests must verify metadata sanitization of auth/token/cookie/phone/JID/body/text/destination-like keys, deterministic correlation identifiers, owner/group scoping and append-only event persistence contract.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
cd backend && npm test -- src/modules/hipico-bot/hipico-observability.test.ts
```

Expected: FAIL because v11 observability modules are absent.

- [ ] **Step 3: Implement v11 observability core/store**

Port the module/store against current database helpers. Sanitize before persistence. A telemetry write failure must never convert a failed business operation into success and must never grant authority.

- [ ] **Step 4: Audit migration order and add v25 only when non-conflicting**

Inspect `supabase/sql/hipico_v*.sql` on current main. If no newer equivalent schema exists, add the append-only `hipico_v25_observability.sql`; otherwise leave the authoritative newer schema untouched and adapt the PG probe to it.

- [ ] **Step 5: Add characterization tests for each conflicted current-main module**

Before changing `agent.routes.ts`, `hipico-webhook-outbound.ts` or `hipico-outbound-worker.ts`, add focused tests that demonstrate the current business path remains unchanged while emitting the required observability stage.

- [ ] **Step 6: Instrument the three current-main modules minimally**

Add observability calls at agent-decision/risk, outbox/delivery and reconciliation-handoff boundaries. Do not replace historical whole-file versions.

- [ ] **Step 7: Add PG probe/workflow and verify**

Run the backend test, typecheck, isolated PostgreSQL probe where available, and the v13 root contract.

- [ ] **Step 8: Update inventory and commit**

```bash
git add .github/workflows/hipico-observability-v11.yml backend/src/modules/hipico-bot backend/src/modules/hipico/agent.routes.ts scripts/hipico-observability-v11-pg.mjs supabase/sql ops/roadmap/hipico-v13-mainline-reconciliation.json
git commit -m "feat(hipico): reconcile v11 observability"
```

### Task 4: Reconcile v9 production hardening against the current release pipeline

**Files:**
- Review/modify: `.github/workflows/hipico-production-gates-v290.yml`
- Review/modify: `scripts/hipico-apply-e2e-schema-v290.mjs`
- Review/modify: `scripts/hipico-ci-verdict-v290.mjs`
- Review/modify: `scripts/hipico-release-guard-v290.mjs`
- Create if absent: `scripts/hipico-release-readiness-v9.mjs`
- Review/modify: `scripts/hipico-release-report-v290.mjs`
- Review/modify: `scripts/hipico-verify-evidence-v290.mjs`
- Create if absent: `tests/hipico_v9_ci_verdict_readiness.test.mjs`
- Create if absent: `tests/hipico_v9_evidence_readiness.test.mjs`
- Create if absent: `tests/hipico_v9_release_boundaries.test.mjs`
- Create if absent: `tests/hipico_v9_security_browser_performance.test.mjs`
- Create if absent: `tests/hipico_v9_workflow_pwa_contract.test.mjs`
- Modify: `tests/hipico_postgres_e2e_chain_290.test.mjs`
- Modify: `tests/hipico_release_hardening_290_contract.test.mjs`
- Modify: `ops/roadmap/hipico-v13-mainline-reconciliation.json`

**Interfaces:**
- Produces: fail-closed exact-SHA readiness, runner-aware CI verdict and a schema chain including current authoritative risk/shadow/observability migrations.

- [ ] **Step 1: Read every current-main file before editing and classify behavior**

Mark an item `PRESENT`/`SUPERSEDED` if main already enforces equal or stronger behavior. Do not restore old text merely to match v9.

- [ ] **Step 2: Add only missing v9 contract tests first and verify RED**

Root tests must cover exact SHA, blocked infrastructure semantics, release evidence completeness, security/performance evidence and PostgreSQL migration-chain coverage.

- [ ] **Step 3: Implement the smallest current-main changes**

Update schema enumeration through the authoritative observability migration, fail closed on missing/mismatched SHA evidence and keep browser/security/Android evidence non-substitutable.

- [ ] **Step 4: Run focused root tests**

```bash
node --test tests/hipico_v9_*.test.mjs tests/hipico_postgres_e2e_chain_290.test.mjs tests/hipico_release_hardening_290_contract.test.mjs
```

Expected: PASS where local dependencies are available.

- [ ] **Step 5: Update inventory and commit**

```bash
git add .github/workflows/hipico-production-gates-v290.yml scripts tests ops/roadmap/hipico-v13-mainline-reconciliation.json
git commit -m "fix(hipico): reconcile v9 production hardening"
```

### Task 5: Reconcile v12 strict release manifest and progressive rollout

**Files:**
- Create: `.github/workflows/hipico-production-release-v12.yml`
- Create: `scripts/hipico-release-manifest-v12.mjs`
- Create: `tests/hipico_release_v12_contract.test.mjs`
- Create: `docs/hipico/production-release-v12.md`
- Modify: `ops/roadmap/hipico-v13-mainline-reconciliation.json`

**Interfaces:**
- Consumes: current v9/current-main release guard/readiness/report evidence.
- Produces: deterministic release manifest with `SHADOW → ASSISTED → AUTOMATIC_LOW_RISK → AUTOMATIC`, sequential promotion and unconditional reasoned rollback to SHADOW.

- [ ] **Step 1: Add the v12 contract test first**

Test exact 40-hex SHA validation, order-independent signature, all-required-gates PASS requirement, rejection of BLOCKED/NOT_EXECUTED/FAIL/missing/SHA-mismatch evidence, sequential promotion and rollback semantics.

- [ ] **Step 2: Run contract and verify RED**

```bash
node --test tests/hipico_release_v12_contract.test.mjs
```

Expected: FAIL because the manifest script is absent.

- [ ] **Step 3: Implement the release manifest**

Use only current release evidence inputs. Keep invariant output fields explicitly `sourceReadOnly: true`, `labWriteOnlyDuringQa: true`, `financialAuthority: false`, `llmDirectDbWrites: false`, `llmSettlementAuthority: false`.

- [ ] **Step 4: Add workflow/docs without auto-deploy**

The workflow validates the exact candidate SHA and generates evidence/manifest only; it must not promote or deploy production automatically.

- [ ] **Step 5: Verify GREEN and update inventory**

Run v12 plus v13 root contracts. Mark v12 artifacts `PRESENT`.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/hipico-production-release-v12.yml scripts/hipico-release-manifest-v12.mjs tests/hipico_release_v12_contract.test.mjs docs/hipico/production-release-v12.md ops/roadmap/hipico-v13-mainline-reconciliation.json
git commit -m "feat(hipico): reconcile v12 production release contract"
```

### Task 6: Final verification, exact-SHA evidence and draft PR

**Files:**
- Modify if findings require: `ops/roadmap/hipico-v13-mainline-reconciliation.json`
- No unrelated product files.

**Interfaces:**
- Produces: final v13 candidate SHA, truthful verification matrix and one draft PR targeting `main`.

- [ ] **Step 1: Run final code-level validation**

Attempt, in order, only commands supported by the repository/environment:

```bash
npm ci
npm run test:hipico
node --test tests/hipico_v9_*.test.mjs tests/hipico_v10_golden_contract.test.mjs tests/hipico_release_v12_contract.test.mjs tests/hipico_v13_mainline_reconciliation.test.mjs
npm run build
```

Also run backend/frontend typecheck/build and isolated PostgreSQL 16 probes using existing repository commands when present.

- [ ] **Step 2: Review the complete branch diff against current main**

Reject unrelated changes, secrets, raw WhatsApp identifiers, source-write paths, disabled tests and historical whole-file replacements that lost current behavior.

- [ ] **Step 3: Record truthful status**

Use `VERIFIED` only for checks executed on the exact final SHA. Use `BLOCKED_INFRASTRUCTURE` for GitHub Actions jobs with no runner/steps/logs. Keep #119 physical QA and #120 >=24h soak `BLOCKED` until real evidence exists.

- [ ] **Step 4: Create one DRAFT PR to `main`**

PR body must summarize v9→v12 reconciliation by classification, exact candidate SHA, executed checks, blocked checks, data-safety invariants and explicit non-closure of #119/#120/#134 unless their real evidence changed.

- [ ] **Step 5: Inspect PR diff/checks one final time**

No merge is performed by this implementation. Report PR number, final SHA and verification matrix.