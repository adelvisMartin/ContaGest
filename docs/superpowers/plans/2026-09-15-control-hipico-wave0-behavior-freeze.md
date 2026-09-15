# Control Hípico Wave 0 — Behavior Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the observable behavior of Control Hípico in tests and deterministic inventories before any production refactor begins.

**Architecture:** Wave 0 changes tests, QA tooling and documentation only. It builds a deterministic contract inventory from the then-current `main`, proves that the existing backend/WhatsApp/serverless/PWA suites cover the required behavioral boundaries, and records immutable migration hashes so later waves can prove equivalence without relying on file layout.

**Tech Stack:** Node.js 22.x, ESM, Node `node:test`, TypeScript/tsx Hípico suites, Express 5 route mounting, Vite/PWA source contracts, PostgreSQL/Supabase migrations, existing exact-SHA Hípico release tooling.

**Spec:** `docs/superpowers/specs/2026-09-15-control-hipico-behavior-preserving-refactor-design.md`

## Global Constraints

- Production/runtime source is not modified in Wave 0.
- No public function, endpoint, request/response field, error code or environment variable is renamed.
- No historical Supabase or Prisma migration is edited.
- Existing tests are not weakened, skipped or deleted.
- Characterization records current supported behavior; if an existing bug is discovered, document it and handle it in a separate fix.
- Wave 0 implementation starts from the then-current `main`, not from the documentation branch.
- PR #348 and PR #350 must be merged, explicitly abandoned, or their intended behavior explicitly incorporated before the freeze is declared authoritative.
- Node remains `22.x`.
- Exact final SHA evidence is required; infrastructure non-execution is `BLOCKED_INFRASTRUCTURE`, never PASS.

---

### Task 0: Resolve the behavior-freeze baseline

**Files:**
- Create: `docs/hipico/refactor/BASELINE_DECISIONS.md`

**Interfaces:**
- Consumes: current `main` SHA, PR #348 status/head, PR #350 status/head.
- Produces: a baseline decision record consumed by every later Wave 0 task.

- [ ] **Step 1: Read current baseline and prerequisite PRs**

```bash
git fetch origin main
git rev-parse origin/main
```

Inspect PR #348 and PR #350 state, base SHA and head SHA with GitHub. Record the exact values returned by those commands/API calls.

- [ ] **Step 2: Write `BASELINE_DECISIONS.md` from observed values**

The file must contain:

```markdown
# Control Hípico Refactor Baseline Decisions

## Main baseline
Record the exact `origin/main` SHA observed immediately before creating the Wave 0 branch.

## PR #348
Record its observed state, base SHA, head SHA and exactly one disposition from: MERGED, ABANDONED, INCORPORATED_EXPLICITLY.

## PR #350
Record its observed state, base SHA, head SHA and exactly one disposition from: MERGED, ABANDONED, INCORPORATED_EXPLICITLY.

## Baseline rule
Wave 0 freezes only behavior explicitly included by the dispositions above. Open unapproved feature work is not silently absorbed.
```

If either open PR has no authorized disposition, stop Wave 0 and ask the repository owner instead of freezing an obsolete or ambiguous baseline.

- [ ] **Step 3: Create the implementation branch from exact `main`**

```bash
git switch --detach origin/main
git switch -c refactor/hipico-wave0-behavior-freeze
```

- [ ] **Step 4: Commit the decision record**

```bash
git add docs/hipico/refactor/BASELINE_DECISIONS.md
git commit -m "docs(hipico): record refactor behavior-freeze baseline"
```

### Task 1: Build the deterministic Hípico contract inventory

**Files:**
- Create: `scripts/hipico-refactor-behavior-inventory.mjs`
- Create: `tests/hipico_refactor_behavior_inventory.test.mjs`
- Create: `docs/hipico/refactor/behavior-baseline-v0.json`
- Modify: `package.json`

**Interfaces:**
- Produces `buildHipicoBehaviorInventory(): object`.
- Produces `listHipicoMigrationFiles(): string[]`.
- Produces command `npm run test:hipico:refactor-baseline`.
- Frozen JSON keys: `backendPublicModules`, `backendPublicExports`, `backendRouteMounts`, `serverlessEndpoints`, `environmentVariables`, `databaseObjects`, `pwaFiles`, `migrationFiles`.

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

test('Control Hípico behavior inventory matches the frozen baseline', () => {
  assert.deepEqual(buildHipicoBehaviorInventory(), expected);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/hipico_refactor_behavior_inventory.test.mjs
```

Expected: module/file-not-found failure because the inventory implementation and JSON baseline do not exist yet.

- [ ] **Step 3: Implement the inventory script**

Create `scripts/hipico-refactor-behavior-inventory.mjs` with these exact responsibilities:

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

function exportedSymbols(source) {
  const direct = matches(
    source,
    /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g
  );
  const named = matches(source, /export\s*\{([^}]+)\}/g, (match) => match[1])
    .flatMap((group) => group.split(',').map((entry) => entry.trim().split(/\s+as\s+/)[1] || entry.trim().split(/\s+as\s+/)[0]))
    .filter(Boolean);
  if (/export\s+default\b/.test(source)) direct.push('default');
  return uniqueSorted([...direct, ...named]);
}

export function listHipicoMigrationFiles() {
  return [
    ...filesUnder('supabase/sql', (path) => /hipico/i.test(path) && path.endsWith('.sql')),
    ...filesUnder('backend/prisma/migrations', (path) => /hipico/i.test(path) && path.endsWith('migration.sql'))
  ].sort();
}

export function buildHipicoBehaviorInventory() {
  const backendModules = [
    ...filesUnder('backend/src/modules/hipico', (path) => path.endsWith('.ts') && !path.endsWith('.test.ts')),
    ...filesUnder('backend/src/modules/hipico-bot', (path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
  ].sort();
  const serverlessEndpoints = filesUnder('frontend/api/hipico', (path) => path.endsWith('.js'));
  const pwaFiles = filesUnder('frontend/public/hipico-control', (path) => /\.(?:js|css|html|webmanifest|json)$/.test(path));
  const sourceFiles = [...backendModules, ...serverlessEndpoints, ...pwaFiles];
  const sources = sourceFiles.map((path) => text(path));
  const appSource = text('backend/src/app.ts');

  return {
    backendPublicModules: backendModules,
    backendPublicExports: Object.fromEntries(backendModules.map((path) => [path, exportedSymbols(text(path))])),
    backendRouteMounts: matches(appSource, /app\.use\(\s*['"]([^'"]*hipico[^'"]*)['"]/g),
    serverlessEndpoints,
    environmentVariables: uniqueSorted(sources.flatMap((source) => matches(
      source,
      /(?:process\.env\.|process\.env\[['"])(HIPICO_[A-Z0-9_]+|WHATSAPP_[A-Z0-9_]+)(?:['"]\])?/g
    ))),
    databaseObjects: uniqueSorted(sources.flatMap((source) => matches(
      source,
      /public\.([a-z0-9_]*hipico[a-z0-9_]*)/gi,
      (match) => `public.${match[1]}`
    ))),
    pwaFiles,
    migrationFiles: listHipicoMigrationFiles()
  };
}

if (process.argv.includes('--write')) {
  writeFileSync(
    join(ROOT, 'docs/hipico/refactor/behavior-baseline-v0.json'),
    `${JSON.stringify(buildHipicoBehaviorInventory(), null, 2)}\n`
  );
}
```

- [ ] **Step 4: Generate and review the baseline JSON**

```bash
node scripts/hipico-refactor-behavior-inventory.mjs --write
```

Review the generated JSON against `backend/src/app.ts`, the two backend Hípico module directories, `frontend/api/hipico/`, `frontend/public/hipico-control/`, Supabase SQL and Prisma migrations. If the extractor misses a syntax form used by the selected baseline, fix the extractor before accepting the JSON.

- [ ] **Step 5: Add the root test script without changing existing scripts**

Add exactly this entry to root `package.json`:

```json
"test:hipico:refactor-baseline": "node --test tests/hipico_refactor_*.test.mjs"
```

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

### Task 2: Freeze backend route mounting and raw-body boundary

**Files:**
- Create: `tests/hipico_refactor_route_surface.test.mjs`
- Read: `backend/src/app.ts`

**Interfaces:**
- Preserves canonical and compatibility mount prefixes, middleware order and webhook raw-body capture path.

- [ ] **Step 1: Write the characterization test**

Create `tests/hipico_refactor_route_surface.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../backend/src/app.ts', import.meta.url), 'utf8');

for (const route of [
  '/api/v1/hipico/system',
  '/api/v1/hipico-bot',
  '/api/v1/hipico/documents',
  '/api/v1/hipico'
]) {
  test(`backend keeps Hípico mount ${route}`, () => assert.match(app, new RegExp(route.replaceAll('/', '\\/'))));
}

test('Meta webhook keeps raw-body capture boundary', () => {
  assert.match(app, /startsWith\('\/api\/v1\/hipico-bot\/webhook'\)/);
});

test('canonical Hípico mount keeps auth and mutation limiters before routers', () => {
  assert.match(app, /app\.use\(\s*['"]\/api\/v1\/hipico['"],[\s\S]*?authRateLimit,[\s\S]*?mutationRateLimit,[\s\S]*?hipicoProviderRoutes/);
});
```

- [ ] **Step 2: Run the test**

```bash
node --test tests/hipico_refactor_route_surface.test.mjs
```

Expected: PASS on the selected baseline.

- [ ] **Step 3: Commit**

```bash
git add tests/hipico_refactor_route_surface.test.mjs
git commit -m "test(hipico): freeze backend route surface"
```

### Task 3: Audit and freeze backend behavioral coverage

**Files:**
- Create: `docs/hipico/refactor/BACKEND_BEHAVIOR_COVERAGE.md`
- Modify tests only if the audit proves one of the required behaviors has no executable characterization.

**Interfaces:**
- Consumes the existing `backend/src/modules/hipico-bot/*.test.ts` and `backend/src/modules/hipico/*.test.ts` suites.
- Produces a traceability matrix from required behavior to exact test file and test name.

- [ ] **Step 1: Execute the complete Hípico backend suite**

```bash
npm --workspace backend run test:hipico
```

Record total tests, failures and exact command output. A runner that does not execute the command is not evidence.

- [ ] **Step 2: Build the coverage matrix from actual test names**

`BACKEND_BEHAVIOR_COVERAGE.md` must contain one row for each of these behaviors:

```text
webhook signature invalid
webhook replay duplicate
webhook replay mismatch
SOURCE Bridge write/send rejection
LAB simulation path remains separate
outbox idempotent enqueue
outbox lease ownership
ambiguous provider acceptance -> reconciliation_required
Meta receipt sent
Meta receipt delivered
Meta receipt read
Meta receipt failed
operator authentication failure
DISABLED -> SHADOW adjacent promotion
skipped automation promotion rejected
SOURCE cannot exceed SHADOW
SHADOW/ASSISTED never directly act
operator transition idempotency mismatch rejected
cross-group evaluation/review isolation
Command Center QUEUE_READ_UNAVAILABLE
Command Center DOCUMENT_READ_UNAVAILABLE
Command Center PROVIDER_READ_UNAVAILABLE
Command Center missing Agent identity fails closed
Command Center ambiguous Agent identity fails closed
```

Each row contains: behavior, exact test file, exact test name, PASS/FAIL/BLOCKED from Step 1.

- [ ] **Step 3: Handle a genuine coverage gap deterministically**

If every row maps to an existing executable test, do not add duplicate tests. If any row has no executable test, stop this task and amend this Wave 0 plan with the exact public function/route and expected baseline behavior before adding the missing characterization. Do not invent an expectation from memory.

- [ ] **Step 4: Commit the coverage matrix**

```bash
git add docs/hipico/refactor/BACKEND_BEHAVIOR_COVERAGE.md
git commit -m "docs(hipico): map backend behavior coverage"
```

### Task 4: Freeze serverless adapter contracts

**Files:**
- Create: `tests/hipico_refactor_serverless_contracts.test.mjs`
- Read: `frontend/api/hipico/*.js`

**Interfaces:**
- Preserves the current endpoint file surface and prevents accidental browser exposure of server-only secrets.

- [ ] **Step 1: Write the endpoint-surface test**

Create `tests/hipico_refactor_serverless_contracts.test.mjs`:

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

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

for (const file of REQUIRED_ENDPOINTS) {
  test(`serverless Hípico endpoint remains present: ${file}`, () => {
    assert.equal(existsSync(new URL(`../frontend/api/hipico/${file}`, import.meta.url)), true);
  });
}

test('serverless adapters never reference browser storage for server secrets', () => {
  for (const file of REQUIRED_ENDPOINTS) {
    const source = readFileSync(new URL(`../frontend/api/hipico/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
  }
});
```

- [ ] **Step 2: Run the serverless contract test**

```bash
node --test tests/hipico_refactor_serverless_contracts.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/hipico_refactor_serverless_contracts.test.mjs
git commit -m "test(hipico): freeze serverless adapter surface"
```

### Task 5: Freeze PWA, Command Center and Android-visible contracts

**Files:**
- Create: `tests/hipico_refactor_pwa_contracts.test.mjs`
- Read: `frontend/public/hipico-control/sw.js`
- Read current Command Center shell/renderer files and `android/hipico-control-v1130/scripts/sync-web.mjs`.

**Interfaces:**
- Preserves explicit UI-state vocabulary where present, live API cache exclusions, SOURCE/LAB safety and Android parity inputs.

- [ ] **Step 1: Write PWA source characterization**

Create a test that reads the current Command Center shell/renderer and service worker, then asserts:

```js
for (const state of ['loading', 'empty', 'error', 'success', 'disabled', 'offline', 'stale']) {
  assert.match(commandCenterSource, new RegExp(state));
}
assert.match(serviceWorkerSource, /\/api\/v1\/hipico\//);
assert.match(serviceWorkerSource, /cache:\s*['"]no-store['"]/);
assert.match(commandCenterSource, /SOURCE/);
assert.match(commandCenterSource, /LAB/);
```

Only add `unavailable`, `not_configured` or `degraded` to the assertion list if those states are present in the selected baseline source. The test freezes existing states; it does not create new ones.

- [ ] **Step 2: Assert Android sync inputs remain tied to the PWA**

Read `android/hipico-control-v1130/scripts/sync-web.mjs` and assert it references the current Command Center/theme/service-worker assets and retains `--check-only` parity handling.

- [ ] **Step 3: Run existing source/visual contracts**

```bash
npm run test:hipico:root-contracts
npm run test:hipico:visual-contract
node --test tests/hipico_refactor_pwa_contracts.test.mjs
```

Record each result independently.

- [ ] **Step 4: Commit**

```bash
git add tests/hipico_refactor_pwa_contracts.test.mjs
git commit -m "test(hipico): freeze pwa and android contracts"
```

### Task 6: Freeze historical migration bytes

**Files:**
- Create: `tests/hipico_refactor_migration_immutability.test.mjs`
- Create: `docs/hipico/refactor/migration-hashes-v0.json`
- Modify: `scripts/hipico-refactor-behavior-inventory.mjs`

**Interfaces:**
- Produces SHA-256 hashes for every existing Hípico Supabase SQL file and Hípico Prisma migration in the selected baseline.

- [ ] **Step 1: Write the failing immutability test**

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

Expected: file-not-found failure for `migration-hashes-v0.json`.

- [ ] **Step 3: Add deterministic hash generation to the inventory script**

Add:

```js
import crypto from 'node:crypto';

function migrationHashes() {
  return Object.fromEntries(listHipicoMigrationFiles().map((path) => [
    path,
    crypto.createHash('sha256').update(readFileSync(join(ROOT, path))).digest('hex')
  ]));
}

if (process.argv.includes('--write-migration-hashes')) {
  writeFileSync(
    join(ROOT, 'docs/hipico/refactor/migration-hashes-v0.json'),
    `${JSON.stringify(migrationHashes(), null, 2)}\n`
  );
}
```

- [ ] **Step 4: Generate hashes and run GREEN**

```bash
node scripts/hipico-refactor-behavior-inventory.mjs --write-migration-hashes
node --test tests/hipico_refactor_migration_immutability.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/hipico-refactor-behavior-inventory.mjs tests/hipico_refactor_migration_immutability.test.mjs docs/hipico/refactor/migration-hashes-v0.json
git commit -m "test(hipico): freeze historical migration hashes"
```

### Task 7: Publish the Behavior Freeze report and exact-SHA evidence

**Files:**
- Create: `docs/hipico/refactor/BEHAVIOR_FREEZE.md`

**Interfaces:**
- Consumes all Wave 0 inventories/tests and the exact candidate SHA.
- Produces the authoritative equivalence checklist for Waves 1-7.

- [ ] **Step 1: Run the complete static/source characterization set**

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

- [ ] **Step 3: Run the existing Hípico release guard**

```bash
npm run release:hipico:v290
```

Keep the script's own classification. External prerequisites are not converted to PASS.

- [ ] **Step 4: Run browser and Android parity when supported by the environment**

```bash
npm run test:browser:hipico
node android/hipico-control-v1130/scripts/sync-web.mjs
node android/hipico-control-v1130/scripts/sync-web.mjs --check-only
```

Record unavailable Chromium/device/runtime separately as BLOCKED.

- [ ] **Step 5: Write `BEHAVIOR_FREEZE.md` using observed evidence only**

The report must state the exact baseline main SHA and exact Wave 0 candidate SHA returned by git/GitHub. It must include a table with these rows and the actual result/evidence from Steps 1-4:

```text
Refactor baseline contracts
Root Hípico contracts
Visual contract
Backend typecheck
Backend Hípico suite
Backend build
Hípico release guard
Browser Hípico QA
Android/PWA parity
```

It must also list the route prefixes, public facades, serverless endpoints, environment variable names, database objects and migration-hash manifest from the generated inventory. A `Known baseline defects` section records pre-existing defects without fixing them in this PR.

- [ ] **Step 6: Run final diff scope review**

```bash
git diff --check origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected changed scope only:

```text
docs/hipico/refactor/*
scripts/hipico-refactor-behavior-inventory.mjs
tests/hipico_refactor_*.test.mjs
package.json
backend/src/modules/hipico/*.test.ts only if a separately planned characterization gap was approved
backend/src/modules/hipico-bot/*.test.ts only if a separately planned characterization gap was approved
```

No production runtime file or historical migration may appear.

- [ ] **Step 7: Commit the report**

```bash
git add docs/hipico/refactor/BEHAVIOR_FREEZE.md
git commit -m "docs(hipico): publish behavior freeze evidence"
```

- [ ] **Step 8: Open the Wave 0 PR and inspect exact-SHA CI**

Use title:

```text
test(hipico): freeze behavior before refactor campaign
```

The PR body must explicitly say Wave 0 changes no runtime behavior. Fetch workflow runs/jobs for the exact head and merge-candidate SHA. `steps=[]`, `runner_id=0`, missing runner assignment or Vercel rate-limit is `BLOCKED_INFRASTRUCTURE`, not PASS.

## Wave 0 completion criteria

Wave 0 is complete only when the deterministic behavior inventory and migration-hash baseline are checked in, the backend behavior coverage matrix maps every required safety/behavior boundary to an executable test, serverless/PWA/route contracts are frozen, no production source changed, and every available gate is tied to the exact final candidate SHA.
