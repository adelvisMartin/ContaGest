# Control Hípico Wave 0 — Behavior Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the observable behavior of Control Hípico in tests and deterministic inventories before any production refactor begins.

**Architecture:** Wave 0 changes tests, QA tooling and documentation only. It builds a deterministic contract inventory from the then-current `main`, adds characterization tests for public exports/routes/serverless/PWA/database boundaries, and records an immutable migration baseline so later waves can prove equivalence without relying on source layout.

**Tech Stack:** Node.js 22.x, ESM, Node `node:test`, TypeScript/tsx Hípico suites, Express route mounting, Vite/PWA source contracts, PostgreSQL/Supabase migration files, existing exact-SHA Hípico release tooling.

**Spec:** `docs/superpowers/specs/2026-09-15-control-hipico-behavior-preserving-refactor-design.md`

## Global Constraints

- Production/runtime source is not modified in Wave 0.
- No public function, endpoint, request/response field, error code or environment variable is renamed.
- No historical Supabase or Prisma migration is edited.
- Existing tests are not weakened or skipped.
- Characterization records current supported behavior; if an existing bug is discovered, document it and open a separate fix rather than silently correcting it here.
- Wave 0 implementation starts from the then-current `main`, not from the documentation branch.
- PR #348 and PR #350 must be merged, explicitly abandoned, or their exact intended baseline behavior must be incorporated before the freeze is declared authoritative.
- Node version remains `22.x`, matching root/backend package engines.
- Exact final SHA evidence is required; infrastructure non-execution is reported as `BLOCKED_INFRASTRUCTURE`.

---

### Task 0: Resolve the behavior-freeze baseline

**Files:**
- Create on implementation branch: `docs/hipico/refactor/BASELINE_DECISIONS.md`

**Interfaces:**
- Consumes: current `main` SHA, PR #348 status/head, PR #350 status/head.
- Produces: one immutable baseline decision record consumed by every later Wave 0 task.

- [ ] **Step 1: Read current baseline and prerequisite PRs**

Run through GitHub/API or local git:

```bash
git fetch origin main
git rev-parse origin/main
# Inspect PR #348 and #350 state/head/base before branching.
```

Record exact SHAs. Do not infer merge state from old conversation history.

- [ ] **Step 2: Decide baseline disposition without silently merging feature work**

Use exactly one disposition per prerequisite in `BASELINE_DECISIONS.md`:

```markdown
| PR | disposition | exact SHA | behavior included in Wave 0? |
|---|---|---|---|
| #348 | MERGED / ABANDONED / INCORPORATED_EXPLICITLY | `<sha>` | yes/no |
| #350 | MERGED / ABANDONED / INCORPORATED_EXPLICITLY | `<sha>` | yes/no |
```

If a PR is still open and neither merge nor abandonment is authorized, stop Wave 0 and ask the repository owner. Do not hide the dependency by freezing an obsolete baseline.

- [ ] **Step 3: Create the implementation branch from exact `main`**

```bash
git switch --detach origin/main
git switch -c refactor/hipico-wave0-behavior-freeze
```

- [ ] **Step 4: Commit only the baseline decision record**

```bash
git add docs/hipico/refactor/BASELINE_DECISIONS.md
git commit -m "docs(hipico): record refactor behavior-freeze baseline"
```

### Task 1: Build a deterministic Hípico contract inventory

**Files:**
- Create: `scripts/hipico-refactor-behavior-inventory.mjs`
- Create: `tests/hipico_refactor_behavior_inventory.test.mjs`
- Create: `docs/hipico/refactor/behavior-baseline-v0.json`
- Modify: `package.json`

**Interfaces:**
- Produces command `npm run test:hipico:refactor-baseline`.
- Produces deterministic JSON keys: `backendPublicModules`, `backendRouteMounts`, `serverlessEndpoints`, `environmentVariables`, `databaseObjects`, `pwaFiles`, `migrationFiles`.

- [ ] **Step 1: Write the failing inventory contract test**

Create `tests/hipico_refactor_behavior_inventory.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildHipicoBehaviorInventory } from '../scripts/hipico-refactor-behavior-inventory.mjs';

const expected = JSON.parse(readFileSync(
  new URL('../docs/hipico/refactor/behavior-baseline-v0.json', import.meta.url),
  'utf8'
));

test('Control Hípico public behavior inventory matches the frozen baseline', () => {
  const actual = buildHipicoBehaviorInventory();
  assert.deepEqual(actual, expected);
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
node --test tests/hipico_refactor_behavior_inventory.test.mjs
```

Expected: failure because the inventory module/baseline file does not exist.

- [ ] **Step 3: Implement deterministic inventory extraction**

`scripts/hipico-refactor-behavior-inventory.mjs` must:

```js
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const normalize = (path) => path.split('\\').join('/');
const uniqueSorted = (values) => [...new Set(values)].sort();

function filesUnder(relativeDir, predicate = () => true) {
  const base = join(ROOT, relativeDir);
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (predicate(full)) out.push(normalize(relative(ROOT, full)));
    }
  };
  walk(base);
  return out.sort();
}

function text(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function matches(source, regex, pick = (match) => match[1]) {
  return uniqueSorted([...source.matchAll(regex)].map(pick).filter(Boolean));
}

export function buildHipicoBehaviorInventory() {
  const backendModules = [
    ...filesUnder('backend/src/modules/hipico', (p) => p.endsWith('.ts') && !p.endsWith('.test.ts')),
    ...filesUnder('backend/src/modules/hipico-bot', (p) => p.endsWith('.ts') && !p.endsWith('.test.ts'))
  ].sort();
  const serverlessEndpoints = filesUnder('frontend/api/hipico', (p) => p.endsWith('.js'));
  const pwaFiles = filesUnder('frontend/public/hipico-control', (p) => /\.(?:js|css|html|webmanifest|json)$/.test(p));
  const migrationFiles = [
    ...filesUnder('supabase/sql', (p) => /hipico/i.test(p) && p.endsWith('.sql')),
    ...filesUnder('backend/prisma/migrations', (p) => /hipico/i.test(p) && p.endsWith('migration.sql'))
  ].sort();
  const sourceFiles = [...backendModules, ...serverlessEndpoints, ...pwaFiles];
  const sources = sourceFiles.map((path) => text(path));
  const appSource = text('backend/src/app.ts');

  return {
    backendPublicModules: backendModules,
    backendRouteMounts: matches(appSource, /app\.use\(\s*['"]([^'"]*hipico[^'"]*)['"]/g),
    serverlessEndpoints,
    environmentVariables: uniqueSorted(sources.flatMap((source) => matches(source, /(?:process\.env\.|process\.env\[['"])(HIPICO_[A-Z0-9_]+|WHATSAPP_[A-Z0-9_]+)(?:['"]\])?/g))),
    databaseObjects: uniqueSorted(sources.flatMap((source) => matches(source, /public\.([a-z0-9_]*hipico[a-z0-9_]*)/gi, (m) => `public.${m[1]}`))),
    pwaFiles,
    migrationFiles
  };
}

if (process.argv.includes('--write')) {
  const output = join(ROOT, 'docs/hipico/refactor/behavior-baseline-v0.json');
  writeFileSync(output, `${JSON.stringify(buildHipicoBehaviorInventory(), null, 2)}\n`);
}
```

If extraction misses known bracket-style env access or a route mounting style in the actual baseline, extend the extractor in this task and cover the syntax with a unit fixture. Do not manually omit inconvenient contracts.

- [ ] **Step 4: Generate the frozen JSON from the selected baseline**

```bash
node scripts/hipico-refactor-behavior-inventory.mjs --write
```

Review every section manually before accepting it.

- [ ] **Step 5: Add the root script**

Add to root `package.json`:

```json
"test:hipico:refactor-baseline": "node --test tests/hipico_refactor_*.test.mjs"
```

Do not alter existing scripts.

- [ ] **Step 6: Run GREEN**

```bash
npm run test:hipico:refactor-baseline
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/hipico-refactor-behavior-inventory.mjs tests/hipico_refactor_behavior_inventory.test.mjs docs/hipico/refactor/behavior-baseline-v0.json package.json
git commit -m "test(hipico): freeze behavior inventory"
```

### Task 2: Freeze backend public exports and canonical route surface

**Files:**
- Create: `tests/hipico_refactor_public_exports.test.mjs`
- Create: `tests/hipico_refactor_route_surface.test.mjs`
- Read: `backend/src/app.ts`
- Read all non-test TypeScript files under `backend/src/modules/hipico/` and `backend/src/modules/hipico-bot/`.

**Interfaces:**
- Produces a source-layout-independent list of public exported symbol names per current public facade.
- Produces the exact canonical/compatibility mount prefixes and raw-body webhook boundary.

- [ ] **Step 1: Write route-surface characterization test**

The test must assert these exact mount prefixes currently present in `backend/src/app.ts`:

```js
const REQUIRED_MOUNTS = [
  '/api/v1/hipico/system',
  '/api/v1/hipico-bot',
  '/api/v1/hipico/documents',
  '/api/v1/hipico'
];
```

It must also assert that raw webhook body capture remains scoped to:

```js
'/api/v1/hipico-bot/webhook'
```

and that canonical `/api/v1/hipico` is mounted with `authRateLimit` and `mutationRateLimit` before its routers.

- [ ] **Step 2: Write public-export characterization test**

For modules that are imported by another Hípico module or by `backend/src/app.ts`, collect explicit `export function`, `export class`, `export const`, `export default` and named export symbols into an inline frozen object. Example shape:

```js
const EXPECTED = {
  'backend/src/modules/hipico/agent-policy.ts': [
    'AGENT_TOOLS',
    'AUTOMATION_STATES',
    'HipicoAgentEngine',
    'agentCanAct',
    'canPromoteAutomation',
    'safeToolRequest',
    'validateModelCandidate'
  ]
};
```

Populate the complete object from the selected baseline. Sort each symbol array; do not include test-only `__test__` exports unless another production module imports them.

- [ ] **Step 3: Verify tests pass without production changes**

```bash
node --test tests/hipico_refactor_public_exports.test.mjs tests/hipico_refactor_route_surface.test.mjs
```

Expected: PASS on the frozen baseline.

- [ ] **Step 4: Commit**

```bash
git add tests/hipico_refactor_public_exports.test.mjs tests/hipico_refactor_route_surface.test.mjs
git commit -m "test(hipico): freeze backend public contracts"
```

### Task 3: Freeze WhatsApp, Bridge, webhook and outbox semantics

**Files:**
- Add characterization tests under `backend/src/modules/hipico-bot/` only where current suites do not already cover the behavior.
- Prefer extending existing focused test files over creating duplicate test families.

**Interfaces:**
- Preserves signature verification ordering, replay/duplicate semantics, Bridge SOURCE/LAB isolation, outbox lease/idempotency/reconciliation and public error codes.

- [ ] **Step 1: Inventory existing behavior tests before adding any test**

Run:

```bash
npm --workspace backend run test:hipico
```

List existing test names covering:

```text
webhook signature invalid
webhook replay duplicate
webhook replay mismatch
SOURCE bridge write/send rejection
LAB allowed simulation path
outbox idempotent enqueue
outbox lease ownership
ambiguous provider acceptance -> reconciliation_required
Meta receipt sent/delivered/read/failed
operator authentication failure
```

- [ ] **Step 2: Add only missing characterization cases**

Use current public functions/routes and assert exact existing error/status values. A representative missing-case test should follow this pattern:

```ts
test('ambiguous provider acceptance remains reconciliation_required and not retry', async () => {
  const result = classifyOutboundFailure({ code: 'HIPICO_CLOUD_SEND_TIMEOUT' });
  assert.equal(result.action, 'reconciliation_required');
});
```

Do not change implementation to satisfy a new expectation; the expected value must come from current supported behavior or an already-approved prerequisite PR.

- [ ] **Step 3: Run focused Hípico adapter tests**

```bash
npm --workspace backend exec -- tsx --test src/modules/hipico-bot/*.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit characterization-only changes**

```bash
git add backend/src/modules/hipico-bot/*.test.ts
git commit -m "test(hipico): characterize whatsapp bridge and outbox behavior"
```

### Task 4: Freeze canonical Agent/Automation/Command Center behavior

**Files:**
- Add characterization tests under `backend/src/modules/hipico/` only where absent.
- Read existing `agent-policy.test.ts`, `agent-route-security.test.ts`, Command Center service/route tests and automation store tests first.

**Interfaces:**
- Preserves automation state adjacency, SOURCE restrictions, idempotent transitions, Agent tool allowlist, Command Center exact alerts/states and owner/group isolation.

- [ ] **Step 1: Confirm current coverage for automation promotion and security**

Run:

```bash
npm --workspace backend exec -- tsx --test src/modules/hipico/agent-policy.test.ts src/modules/hipico/agent-route-security.test.ts
```

- [ ] **Step 2: Add missing characterization cases**

Required behaviors to be represented by at least one executable test:

```text
DISABLED -> SHADOW adjacent promotion
skipped promotion rejected
SOURCE cannot exceed SHADOW
SHADOW/ASSISTED never directly act
model candidate cannot bypass authority gates
operator transition idempotency mismatch rejected
cross-group evaluation/review isolation
Command Center QUEUE_READ_UNAVAILABLE
Command Center DOCUMENT_READ_UNAVAILABLE
Command Center PROVIDER_READ_UNAVAILABLE
Command Center missing/ambiguous Agent identity fails closed
```

If PR #348 is part of the selected baseline, include its four policy dispositions and model-never-AUTO invariants. If it is not part of the selected baseline, do not invent them in Wave 0.

- [ ] **Step 3: Run canonical backend tests**

```bash
npm --workspace backend exec -- tsx --test src/modules/hipico/*.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/hipico/*.test.ts
git commit -m "test(hipico): characterize canonical automation behavior"
```

### Task 5: Freeze serverless adapter contracts

**Files:**
- Create: `tests/hipico_refactor_serverless_contracts.test.mjs`
- Read: `frontend/api/hipico/*.js`

**Interfaces:**
- Preserves endpoint files, HTTP method guards, backend delegation headers, no browser secret exposure, no independent domain authority.

- [ ] **Step 1: Write serverless contract test**

The test must assert that these current endpoint files still exist:

```js
const REQUIRED_ENDPOINTS = [
  '_shared.js',
  'bridge-identity.js',
  'canonical-backend.js',
  'command-center.js',
  'group-bridge-ingest.js',
  'meta-runtime.js',
  'meta-timestamp-policy.js',
  'status.js',
  'whatsapp-send.js',
  'whatsapp-webhook.js'
];
```

For each endpoint that delegates to the backend, characterize the current header names and method handling from the selected baseline. Assert that `SUPABASE_SERVICE_ROLE_KEY`, operator/internal tokens or Meta Cloud tokens are never emitted in response-building/browser-facing code.

- [ ] **Step 2: Run the characterization test**

```bash
node --test tests/hipico_refactor_serverless_contracts.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/hipico_refactor_serverless_contracts.test.mjs
git commit -m "test(hipico): freeze serverless adapter contracts"
```

### Task 6: Freeze PWA/Command Center/offline/Android-visible behavior

**Files:**
- Create: `tests/hipico_refactor_pwa_contracts.test.mjs`
- Read existing Hípico browser/source-contract tests before adding overlap.
- Read: `frontend/public/hipico-control/sw.js`, Command Center shell/renderer/theme assets, Android sync script.

**Interfaces:**
- Preserves state vocabulary, no-store live API behavior, SOURCE/LAB copy/safety, responsive/accessibility contracts and Android/PWA parity inputs.

- [ ] **Step 1: Characterize explicit UI state vocabulary**

Assert the selected baseline retains these states where currently applicable:

```js
const REQUIRED_STATES = [
  'loading', 'empty', 'error', 'success', 'disabled',
  'offline', 'stale', 'unavailable', 'not_configured', 'degraded'
];
```

If a term is not part of the actual baseline component, record that fact in the baseline doc rather than forcing a new state into production code.

- [ ] **Step 2: Characterize live-data cache exclusions**

Assert the service worker keeps canonical Hípico API/live Command Center requests network-only/no-store and does not persist operational read models indefinitely.

- [ ] **Step 3: Characterize existing accessibility/responsive invariants by reusing current tests**

Run existing root/source/browser contract commands applicable without external services:

```bash
npm run test:hipico:root-contracts
npm run test:hipico:visual-contract
```

Record if browser execution is unavailable; do not replace runtime evidence with source assertions.

- [ ] **Step 4: Characterize Android parity inputs**

Assert the Android sync script still includes Command Center/theme/service-worker assets required by the current baseline and that `--check-only` remains the parity verifier after generation.

- [ ] **Step 5: Run Wave 0 PWA contracts**

```bash
node --test tests/hipico_refactor_pwa_contracts.test.mjs
```

- [ ] **Step 6: Commit**

```bash
git add tests/hipico_refactor_pwa_contracts.test.mjs
git commit -m "test(hipico): freeze pwa and android behavior contracts"
```

### Task 7: Freeze database-touch and migration immutability baseline

**Files:**
- Create: `tests/hipico_refactor_migration_immutability.test.mjs`
- Create: `docs/hipico/refactor/migration-hashes-v0.json`
- Extend: `scripts/hipico-refactor-behavior-inventory.mjs`

**Interfaces:**
- Produces SHA-256 hashes for every existing Hípico Supabase SQL file and every existing Hípico Prisma migration at the selected baseline.
- Later refactor waves consume this file to prove historical migration immutability.

- [ ] **Step 1: Write failing hash-baseline test**

```js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { listHipicoMigrationFiles } from '../scripts/hipico-refactor-behavior-inventory.mjs';

const expected = JSON.parse(readFileSync(
  new URL('../docs/hipico/refactor/migration-hashes-v0.json', import.meta.url),
  'utf8'
));

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

test('historical Hípico migration files remain byte-identical', () => {
  const actual = Object.fromEntries(listHipicoMigrationFiles().map((path) => [
    path,
    sha256(readFileSync(new URL(`../${path}`, import.meta.url)))
  ]));
  assert.deepEqual(actual, expected);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/hipico_refactor_migration_immutability.test.mjs
```

Expected: FAIL because the exported helper/hash baseline does not yet exist.

- [ ] **Step 3: Export the migration-file helper and generate hash baseline**

Add this public QA-only export to the inventory script:

```js
export function listHipicoMigrationFiles() {
  return [
    ...filesUnder('supabase/sql', (p) => /hipico/i.test(p) && p.endsWith('.sql')),
    ...filesUnder('backend/prisma/migrations', (p) => /hipico/i.test(p) && p.endsWith('migration.sql'))
  ].sort();
}
```

Generate `migration-hashes-v0.json` with sorted path keys and SHA-256 values using a one-shot Node command or a `--write-migration-hashes` mode added to the same script.

- [ ] **Step 4: Run GREEN**

```bash
node --test tests/hipico_refactor_migration_immutability.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/hipico-refactor-behavior-inventory.mjs tests/hipico_refactor_migration_immutability.test.mjs docs/hipico/refactor/migration-hashes-v0.json
git commit -m "test(hipico): freeze historical migration hashes"
```

### Task 8: Produce the Behavior Freeze report and exact-SHA verification

**Files:**
- Create: `docs/hipico/refactor/BEHAVIOR_FREEZE.md`

**Interfaces:**
- Consumes all Wave 0 tests/inventories and exact final SHA.
- Produces the authoritative checklist that Waves 1-7 must rerun.

- [ ] **Step 1: Run static/source characterization suite**

```bash
npm run test:hipico:refactor-baseline
npm run test:hipico:root-contracts
npm run test:hipico:visual-contract
```

- [ ] **Step 2: Run backend verification**

```bash
npm --workspace backend run typecheck
npm --workspace backend run test:hipico
npm --workspace backend run build
```

- [ ] **Step 3: Run broader Hípico release guards that do not require unavailable credentials**

```bash
npm run release:hipico:v290
```

If the script reports external prerequisites, copy its classification exactly. Do not convert BLOCKED/NOT_RUN to PASS.

- [ ] **Step 4: Run browser/PWA/Android verification when the environment supports it**

```bash
npm run test:browser:hipico
node android/hipico-control-v1130/scripts/sync-web.mjs
node android/hipico-control-v1130/scripts/sync-web.mjs --check-only
```

If Chromium/device/runtime is unavailable, record the blocker and preserve source-contract results separately.

- [ ] **Step 5: Write `BEHAVIOR_FREEZE.md` with exact evidence**

Use this structure and fill every line with actual evidence:

```markdown
# Control Hípico Behavior Freeze v0

- Baseline main SHA: `<exact>`
- Wave 0 final SHA: `<exact>`
- PR #348 disposition: `<recorded value>`
- PR #350 disposition: `<recorded value>`

| Gate | Command | Result | Evidence |
|---|---|---|---|
| Refactor baseline contracts | `npm run test:hipico:refactor-baseline` | PASS/FAIL/BLOCKED | exact output/run |
| Backend typecheck | `npm --workspace backend run typecheck` | PASS/FAIL/BLOCKED | exact output/run |
| Backend Hípico suite | `npm --workspace backend run test:hipico` | PASS/FAIL/BLOCKED | exact output/run |
| Backend build | `npm --workspace backend run build` | PASS/FAIL/BLOCKED | exact output/run |
| Browser | `npm run test:browser:hipico` | PASS/FAIL/BLOCKED | exact output/run |
| Android parity | sync + `--check-only` | PASS/FAIL/BLOCKED | exact output/run |

## Frozen public surfaces
- Route prefixes: ...
- Public facades: ...
- Serverless endpoints: ...
- Environment-variable names: ...
- Database objects touched: ...
- Historical migration hash manifest: `migration-hashes-v0.json`

## Known baseline defects
List observed pre-existing behavior defects without fixing them in this PR.
```

- [ ] **Step 6: Run final diff review**

```bash
git diff --check origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected scope: tests, `scripts/hipico-refactor-behavior-inventory.mjs`, root `package.json`, and `docs/hipico/refactor/*`. No runtime source or historical migration file may appear.

- [ ] **Step 7: Commit report**

```bash
git add docs/hipico/refactor/BEHAVIOR_FREEZE.md
git commit -m "docs(hipico): publish behavior freeze evidence"
```

- [ ] **Step 8: Open Wave 0 PR and inspect exact-SHA CI**

PR title:

```text
test(hipico): freeze behavior before refactor campaign
```

The PR body must state that Wave 0 intentionally changes no runtime code. Fetch workflow runs/jobs for the exact head/merge candidate SHA. `steps=[]`, `runner_id=0`, missing runner or Vercel rate-limit is `BLOCKED_INFRASTRUCTURE`, not PASS.

## Wave 0 completion criteria

Wave 0 is complete only when the public inventory and migration-hash manifests are checked in, characterization coverage exists for backend/WhatsApp/serverless/PWA boundaries, no production source changed, and every available gate is tied to the exact final candidate SHA. If a characterization test exposes a real baseline defect, record it and handle it in a separate fix PR before starting the affected refactor wave.
