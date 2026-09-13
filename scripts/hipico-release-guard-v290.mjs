import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA40 = /^[0-9a-f]{40}$/i;
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const exists = (relative) => fs.existsSync(path.join(root, relative));
const assert = (condition, message) => {
  if (!condition) throw new Error(`HIPICO_V290_RELEASE_BLOCKED:${message}`);
};

function gitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  }).trim().toLowerCase();
}

const candidateSha = String(
  process.env.HIPICO_CANDIDATE_SHA
    || process.env.HIPICO_QA_SHA
    || process.env.HIPICO_RELEASE_SHA
    || process.env.GITHUB_SHA
    || gitHead()
).trim().toLowerCase();
assert(SHA40.test(candidateSha), 'candidate SHA missing or invalid');
assert(candidateSha === gitHead(), `candidate SHA ${candidateSha} does not match checked out HEAD ${gitHead()}`);

for (const script of [
  'scripts/hipico-exact-sha-gate.mjs',
  'scripts/hipico-secret-scan-v290.mjs',
  'scripts/hipico-release-v118.mjs'
]) assert(exists(script), `${script} missing`);

execFileSync(process.execPath, ['scripts/hipico-exact-sha-gate.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, HIPICO_CANDIDATE_SHA: candidateSha }
});
execFileSync(process.execPath, ['scripts/hipico-secret-scan-v290.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, HIPICO_CANDIDATE_SHA: candidateSha }
});
execFileSync(process.execPath, ['scripts/hipico-release-v118.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, HIPICO_RELEASE_SHA: candidateSha }
});

const requiredFiles = [
  'backend/src/app.ts',
  'backend/src/modules/hipico/agent.routes.ts',
  'backend/src/modules/hipico/agent-policy.ts',
  'backend/src/modules/hipico/command-center.service.ts',
  'backend/src/modules/hipico/command-center.routes.ts',
  'backend/src/modules/hipico/document.routes.ts',
  'backend/src/modules/hipico/provider.routes.ts',
  'backend/src/modules/hipico/race.routes.ts',
  'backend/src/modules/hipico-bot/hipico-test-channel.ts',
  'backend/src/modules/hipico-bot/production-e2e-v290.ts',
  'backend/scripts/hipico-restart-recovery-v290.ts',
  'backend/scripts/hipico-load-profile-v290.ts',
  'frontend/api/hipico/command-center.js',
  'frontend/api/hipico/canonical-backend.js',
  'frontend/public/hipico-control/assets/js/command-center.js',
  'frontend/public/hipico-control/assets/js/command-center-shell.js',
  'frontend/public/hipico-control/sw.js',
  'scripts/hipico-apply-e2e-schema-v290.mjs',
  'scripts/hipico-ephemeral-db-v290.mjs',
  'scripts/hipico-verify-evidence-v290.mjs',
  'scripts/hipico-release-report-v290.mjs',
  'supabase/sql/hipico_v21_race_data_conflicts.sql',
  '.github/workflows/hipico-data-engines.yml',
  '.github/workflows/hipico-production-gates-v290.yml',
  '.github/workflows/hipico-browser-matrix.yml',
  '.github/workflows/hipico-android-rc.yml'
];
for (const relative of requiredFiles) assert(exists(relative), `${relative} missing`);

const app = read('backend/src/app.ts');
assert(app.includes("app.use('/api/v1/hipico/system', authRateLimit, hipicoSystemRoutes)"), "'/api/v1/hipico/system' canonical system boundary missing");
assert(app.includes("app.use('/api/v1/hipico/documents', authRateLimit, mutationRateLimit, hipicoDocumentRoutes)"), "'/api/v1/hipico/documents' document boundary missing");
for (const router of [
  'hipicoAgentRoutes',
  'hipicoCommandCenterRoutes',
  'hipicoProviderRoutes',
  'hipicoRaceRoutes',
  'hipicoCanonicalRoutes'
]) assert(app.includes(router), `canonical router missing: ${router}`);
assert(app.includes("app.use('/api/v1/hipico-bot', hipicoWebhookRoutes)"), 'integration adapter boundary /api/v1/hipico-bot missing');

const agentRoutes = read('backend/src/modules/hipico/agent.routes.ts');
assert(agentRoutes.includes('actions: []'), 'agent evaluation must return no direct actions');
assert(agentRoutes.includes('financialAuthority: false'), 'agent must keep financialAuthority: false');
assert(agentRoutes.includes('directEffectsApplied: false'), 'agent must keep directEffectsApplied: false');
assert(!agentRoutes.includes('ownerApproved: body.ownerApproved'), 'client body must not grant owner approval');

const commandCenter = read('backend/src/modules/hipico/command-center.service.ts');
assert(commandCenter.includes('sourceSendPossible: false'), 'Command Center must keep SOURCE send disabled');
assert(commandCenter.includes("state: 'unavailable'"), 'Command Center must represent unavailable reads explicitly');
assert(commandCenter.includes('pending: queuePending'), 'Command Center queue state must remain observable');
assert(commandCenter.includes('failed: queueFailed'), 'Command Center queue failures must remain observable');

const bff = read('frontend/api/hipico/command-center.js');
assert(bff.includes('/api/v1/hipico/command-center'), 'Command Center BFF must delegate to canonical API');
assert(bff.includes('/auth/v1/user'), 'Command Center BFF must validate browser session server-side');
assert(bff.includes('x-hipico-operator-token'), 'operator authority must be injected server-side');

const publicRoot = path.join(root, 'frontend/public/hipico-control');
function filesUnder(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...filesUnder(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}
const forbiddenClientTokens = ['HIPICO_GROUP_BRIDGE_TOKEN', 'HIPICO_OPERATOR_CONTROL_TOKEN'];
for (const file of filesUnder(publicRoot)) {
  if (fs.statSync(file).size > 2 * 1024 * 1024) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const token of forbiddenClientTokens) {
    assert(!source.includes(token), `browser asset exposes server secret name ${token}: ${path.relative(root, file)}`);
  }
}

const sw = read('frontend/public/hipico-control/sw.js');
assert(/function isSensitive\(/.test(sw), 'service worker sensitive-request classifier missing');
assert(/cache:\s*'no-store'/.test(sw), "cache: 'no-store' network-only contract missing");

const schema = read('scripts/hipico-apply-e2e-schema-v290.mjs');
for (const migration of [
  'hipico_v16_agent_shadow.sql',
  'hipico_v17_provider_evidence.sql',
  'hipico_v18_documents.sql',
  'hipico_v18_race_result_stages.sql',
  'hipico_v19_race_idempotency.sql',
  'hipico_v20_document_audit.sql',
  'hipico_v21_race_data_conflicts.sql'
]) assert(schema.includes(migration), `current PostgreSQL chain missing ${migration}`);
assert(schema.includes('SET LOCAL ROLE'), 'PostgreSQL E2E must execute least-privilege role checks');
assert(schema.includes('authenticatedAgentAutomationWriteDenied'), 'PostgreSQL E2E must deny browser agent writes');
assert(schema.includes('authenticatedProviderEvidenceWriteDenied'), 'PostgreSQL E2E must deny browser provider writes');

const testChannel = read('backend/src/modules/hipico-bot/hipico-test-channel.ts');
assert(testChannel.includes('TEST_CHANNEL_NOT_CONNECTED'), 'TestChannel must fail closed while disconnected');
assert(testChannel.includes('TEST_CHANNEL_IDENTITY_MISMATCH'), 'TestChannel must reject wrong channel identity');
const productionE2E = read('backend/src/modules/hipico-bot/production-e2e-v290.ts');
assert(productionE2E.includes('HipicoBotStore.dbReady(true)'), 'production E2E must require persistent bot DB');
assert(productionE2E.includes('result?.duplicate, true'), 'production E2E must prove replay does not duplicate effects');
const loadProfile = read('backend/scripts/hipico-load-profile-v290.ts');
assert(loadProfile.includes('[100, 500, 2000]'), 'production profile must measure 100/500/2000');
assert(loadProfile.includes('financialAuthority: false'), 'provider performance evidence must retain zero financial authority');
assert(loadProfile.includes("acceptance: 'NOT_EXECUTED'"), 'physical target acceptance must remain separate from CI timing');

const dataWorkflow = read('.github/workflows/hipico-data-engines.yml');
for (const required of [
  'npm --workspace backend run prisma:deploy',
  'hipico-apply-e2e-schema-v290.mjs',
  'production-e2e-v290.ts',
  'hipico-restart-recovery-v290.ts prepare',
  'hipico-restart-recovery-v290.ts verify',
  'hipico-load-profile-v290.ts'
]) assert(dataWorkflow.includes(required), `data workflow missing ${required}`);
assert(dataWorkflow.includes('if: always()'), 'data workflow must retain cleanup/evidence on failure');

const productionWorkflow = read('.github/workflows/hipico-production-gates-v290.yml');
assert(productionWorkflow.includes('github.event.pull_request.head.sha || github.sha'), 'production workflow must bind PR evidence to exact head SHA');
assert(productionWorkflow.includes('hipico-apply-e2e-schema-v290.mjs'), 'production workflow must rebuild current schema');
assert(productionWorkflow.includes('production-e2e-v290.ts'), 'production workflow must run TestChannel E2E');
assert(productionWorkflow.includes('hipico-load-profile-v290.ts'), 'production workflow must run 100/500/2000 profile');
assert(productionWorkflow.includes('verify:hipico:evidence:v290'), 'production workflow must verify collected evidence');
assert(productionWorkflow.includes('report:hipico:v290'), 'production workflow must write release report');

const browserWorkflow = read('.github/workflows/hipico-browser-matrix.yml');
for (const browser of ['chromium', 'firefox', 'webkit']) {
  assert(browserWorkflow.includes(`browser: ${browser}`), `browser matrix missing ${browser}`);
}
const androidWorkflow = read('.github/workflows/hipico-android-rc.yml');
assert(androidWorkflow.includes('npm run sync:web'), 'Android must sync canonical PWA');
assert(androidWorkflow.includes('npm run verify:web'), 'Android must verify PWA parity');
assert(androidWorkflow.includes('hipico-release-v118.mjs --require-apk'), 'Android artifact must bind APK to release evidence');

const releasePolicy = json('products/hipico-control/release-policy.json');
assert(releasePolicy.promotion?.requiresP0Green === true, 'P0 green must remain required');
assert(releasePolicy.promotion?.requiresPhysicalQa === true, 'physical QA must remain required');
assert(releasePolicy.promotion?.requiresExplicitApproval === true, 'explicit owner approval must remain required');
assert(releasePolicy.signing?.release === 'external-secret-only', 'release signing must remain external-secret-only');

const bypassRules = [
  { pattern: /\btest\.(?:skip|only)\s*\(/, label: 'test.skip/test.only' },
  { pattern: /\b(?:describe|it)\.(?:skip|only)\s*\(/, label: 'suite skip/only' },
  { pattern: /\b(?:test|describe|it)\.fixme\s*\(/, label: 'fixme bypass' },
  { pattern: /waitForTimeout\s*\(/, label: 'waitForTimeout' },
  { pattern: /\bforce\s*:\s*true\b/, label: 'forced browser action' },
  { pattern: /continue-on-error\s*:\s*true/, label: 'continue-on-error' }
];
for (const relative of [
  'backend/src/modules/hipico/agent-policy.test.ts',
  'backend/src/modules/hipico/agent-route-security.test.ts',
  'backend/src/modules/hipico/command-center.service.test.ts',
  'backend/src/modules/hipico/hipico-data.integration.ts',
  'backend/src/modules/hipico-bot/production-e2e-v290.ts',
  'qa/hipico-visual-functional-v105.spec.mjs',
  'tests/hipico_postgres_e2e_chain_290.test.mjs',
  'tests/hipico_release_hardening_290_contract.test.mjs',
  '.github/workflows/hipico-data-engines.yml',
  '.github/workflows/hipico-production-gates-v290.yml'
]) {
  const source = read(relative);
  for (const rule of bypassRules) {
    assert(!rule.pattern.test(source), `${relative} contains forbidden ${rule.label}`);
  }
}

const artifactDir = path.join(root, 'artifacts', 'qa', 'hipico-v290');
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, 'release-guard.json'), `${JSON.stringify({
  schema: 'hipico-release-guard.v290-current',
  sha: candidateSha,
  status: 'PASS',
  checkedAt: new Date().toISOString(),
  invariants: {
    canonicalApi: true,
    sourceReadOnly: true,
    financialAuthority: false,
    directEffectsApplied: false,
    currentPostgresChain: 'v12-v21',
    testChannelReplay: true,
    loadProfileVolumes: [100, 500, 2000],
    clientSecretsAbsent: true,
    exactSha: true
  }
}, null, 2)}\n`, 'utf8');

console.log(`[hipico-v290] release guard PASS sha=${candidateSha}`);
