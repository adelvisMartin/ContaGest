import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), 'utf8');
const exists = (relative) => fs.existsSync(new URL(relative, root));

test('v290 release hardening scripts exist and use exact candidate SHA semantics', () => {
  for (const file of [
    'scripts/hipico-secret-scan-v290.mjs',
    'scripts/hipico-release-guard-v290.mjs',
    'scripts/hipico-verify-evidence-v290.mjs',
    'scripts/hipico-release-report-v290.mjs'
  ]) assert.equal(exists(file), true, `${file} missing`);

  const secretScan = read('scripts/hipico-secret-scan-v290.mjs');
  const guard = read('scripts/hipico-release-guard-v290.mjs');
  const verifier = read('scripts/hipico-verify-evidence-v290.mjs');
  for (const source of [secretScan, guard, verifier]) {
    assert.match(source, /\^\[0-9a-f\]\{40\}\$/i);
  }
  assert.match(secretScan, /HIPICO_SECRET_SCAN_SHA_MISMATCH/);
  assert.match(guard, /hipico-exact-sha-gate\.mjs/);
  assert.match(guard, /hipico-secret-scan-v290\.mjs/);
  assert.match(guard, /hipico-release-v118\.mjs/);
});

test('release guard pins current canonical safety boundaries instead of historical route shapes', () => {
  const guard = read('scripts/hipico-release-guard-v290.mjs');
  for (const token of [
    "'/api/v1/hipico/system'",
    "'/api/v1/hipico/documents'",
    'hipicoAgentRoutes',
    'hipicoCommandCenterRoutes',
    'hipicoProviderRoutes',
    'hipicoRaceRoutes',
    'hipicoCanonicalRoutes',
    'financialAuthority: false',
    'directEffectsApplied: false',
    'sourceSendPossible: false',
    'hipico_v21_race_data_conflicts.sql',
    'hipico-apply-e2e-schema-v290.mjs',
    'hipico-restart-recovery-v290.ts'
  ]) assert.ok(guard.includes(token), `guard missing invariant ${token}`);
  assert.match(guard, /HIPICO_GROUP_BRIDGE_TOKEN/);
  assert.match(guard, /HIPICO_OPERATOR_CONTROL_TOKEN/);
  assert.match(guard, /cache:\s*'no-store'/);
});

test('secret scan covers high-risk credentials and never prints secret values', () => {
  const source = read('scripts/hipico-secret-scan-v290.mjs');
  for (const rule of [
    'PRIVATE_KEY', 'GITHUB_TOKEN', 'OPENAI_KEY', 'ANTHROPIC_KEY',
    'GOOGLE_API_KEY', 'SLACK_TOKEN', 'STRIPE_LIVE_KEY', 'NPM_TOKEN',
    'SUPABASE_SERVICE_ROLE_JWT', 'REMOTE_DATABASE_EMBEDDED_CREDENTIAL'
  ]) assert.ok(source.includes(rule), `secret scan missing ${rule}`);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*match\[0\]/);
});

test('evidence verifier and release report use only PASS/FAIL/BLOCKED/NOT_EXECUTED', () => {
  const verifier = read('scripts/hipico-verify-evidence-v290.mjs');
  const report = read('scripts/hipico-release-report-v290.mjs');
  for (const status of ['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED']) {
    assert.ok(verifier.includes(status), `verifier missing ${status}`);
    assert.ok(report.includes(status), `report missing ${status}`);
  }
  assert.doesNotMatch(report, /statuses\[name\]\s*!==\s*['"]success['"]/);
  assert.match(report, /BLOCKED_INFRASTRUCTURE/);
});

test('root scripts expose the guarded release path and never bypass the exact-SHA guard', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts?.hipico, 'node tools/hipico-cli/hipico.mjs');
  assert.equal(pkg.scripts?.['release:hipico:v290'], 'node scripts/hipico-release-guard-v290.mjs');
  assert.equal(pkg.scripts?.['verify:hipico:evidence:v290'], 'node scripts/hipico-verify-evidence-v290.mjs');
  assert.equal(pkg.scripts?.['report:hipico:v290'], 'node scripts/hipico-release-report-v290.mjs');
});
