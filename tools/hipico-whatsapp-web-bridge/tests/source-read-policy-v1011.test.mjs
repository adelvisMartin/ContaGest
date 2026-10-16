import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  SOURCE_AUTO_READ_POLICY_NO_GO,
  sourceReadPolicyStatus,
  assertSourceAutoReadDenied
} from '../src/source-read-policy-gate.mjs';

const source = name => readFileSync(new URL('../src/' + name, import.meta.url), 'utf8');
const ENTRYPOINTS = [
  'index.mjs', 'history-v130.mjs', 'live-v130.mjs',
  'capture-group-ids.mjs', 'preflight.mjs', 'server-runner.mjs'
];
const guard = /^assertSourceAutoReadDenied\(\);$/m;

test('#1011: independent read policy remains NO_GO even if source sending is disabled', () => {
  assert.equal(sourceReadPolicyStatus().eligible, false);
  assert.equal(sourceReadPolicyStatus().status, 'NO_GO');
  assert.equal(sourceReadPolicyStatus().policyCode, SOURCE_AUTO_READ_POLICY_NO_GO);
  assert.equal(sourceReadPolicyStatus().environmentOverrideAllowed, false);
  assert.equal(Object.isFrozen(sourceReadPolicyStatus()), true);
});

test('#1011: read-policy status is deterministic without user identity, secrets or group data', () => {
  assert.deepEqual(sourceReadPolicyStatus(), sourceReadPolicyStatus());
  const serialized = JSON.stringify(sourceReadPolicyStatus());
  assert.doesNotMatch(serialized, /phone|token|session|@g.us|customer|tenantId/i);
});

test('#1011: denial never silently turns into a success response', () => {
  assert.throws(() => assertSourceAutoReadDenied(), error =>
    error.code === SOURCE_AUTO_READ_POLICY_NO_GO &&
    error.message === SOURCE_AUTO_READ_POLICY_NO_GO
  );
});

test('#1011: hostile environment flags, shadow mode and synthetic LAB switches cannot override read gate', () => {
  const flags = [
    { HIPICO_SOURCE_AUTO_REPLY_ENABLED: 'true' },
    { HIPICO_BACKEND_SYNC_ENABLED: 'false' },
    { HIPICO_RUNTIME_MODE: 'shadow-local' },
    { HIPICO_LAB_TEST_INPUT_ENABLED: 'true' },
    { HIPICO_POLICY_REVIEW_ID: 'fake-permission' },
    { HIPICO_SOURCE_READ_ALLOWED: 'true' }
  ];
  for (const env of flags) {
    assert.throws(() => assertSourceAutoReadDenied(env), {code: SOURCE_AUTO_READ_POLICY_NO_GO});
  }
});

for (const entrypoint of ENTRYPOINTS) {
  test('#1011: ' + entrypoint + ' evaluates independent read denial at top-level', () => {
    const data = source(entrypoint);
    assert.ok(data.startsWith("import './source-read-startup-denial.mjs';\n"), 'must deny before evaluating any other ESM dependency');
    assert.match(data, /import \{ assertSourceAutoReadDenied \} from '\.\/source-read-policy-gate\.mjs';/);
    const guardedAt = data.search(guard);
    assert.ok(guardedAt >= 0, 'must call read guard, not merely import it');
    const operations = [
      /await fs\.mkdir\(/g,
      /\bfs\.mkdirSync\(/g,
      /\bspawn\(process\.execPath/g,
      /\bchromium\.launchPersistentContext\(/g,
      /\bpage\.goto\(/g,
      /\bfetch\(/g,
      /\bmain\(\)\.catch\(/g
    ];
    for (const operation of operations) {
      const first = operation.exec(data)?.index ?? -1;
      assert.ok(first < 0 || guardedAt < first,
        'read guard must execute before ' + operation + ' in ' + entrypoint);
    }
  });
}

test('#1011: guard survives legacy backfill paths even if source group settings are present', () => {
  for (const script of ['history-v130.mjs', 'live-v130.mjs']) {
    const data = source(script);
    assert.ok(data.search(guard) < data.indexOf('const DATA_DIR'));
    assert.ok(data.search(guard) < data.indexOf('const INGEST_URL'));
  }
});

test('#1011: group discovery cannot read group metadata before gate', () => {
  const data = source('capture-group-ids.mjs');
  assert.ok(data.search(guard) < data.indexOf('const config = loadRuntimeConfig()'));
  assert.ok(data.search(guard) < data.indexOf('const rl = readline.createInterface'));
});

test('#1011: policy CLI reports independently forbidden SOURCE reading', () => {
  const data = source('source-policy-status.mjs');
  assert.match(data, /sourceReadPolicy: sourceReadPolicyStatus\(\)/);
  assert.match(data, /process\.exitCode = 2;/);
  assert.doesNotMatch(data, /sourceReadPolicy\.eligible\s*=\s*true/);
});

test('#1011: package check validates the read-policy source syntax', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.match(pkg.scripts.check, /node --check src\/source-read-policy-gate\.mjs/);
  assert.match(pkg.scripts.test, /tests\/\*\.test\.mjs/);
});

test('#1011: a bypass regression removing the guard is detectable', () => {
  const original = source('index.mjs');
  const mutated = original.replace(guard, '// intentionally disabled for regression');
  assert.notEqual(original, mutated);
  assert.ok(original.search(guard) >= 0);
  assert.equal(mutated.search(guard), -1);
});

test('#1011: no remote IO or service credential is in the read-gate implementation', () => {
  const code = source('source-read-policy-gate.mjs');
  assert.doesNotMatch(code, /\bfetch\s*\(|launchPersistentContext|process\.env\s*\[/);
  assert.doesNotMatch(code, /service_role|SUPABASE_SERVICE_ROLE_KEY|HIPICO_GROUP_BRIDGE_TOKEN/);
});
