import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA40 = /^[0-9a-f]{40}$/i;
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const assert = (condition, message) => {
  if (!condition) throw new Error(`HIPICO_V290_RELEASE_BLOCKED:${message}`);
};
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim().toLowerCase();

const candidateSha = String(
  process.env.HIPICO_CANDIDATE_SHA || process.env.HIPICO_QA_SHA || process.env.HIPICO_RELEASE_SHA || process.env.GITHUB_SHA || git('rev-parse', 'HEAD')
).trim().toLowerCase();
assert(SHA40.test(candidateSha), 'candidate SHA missing or invalid');
assert(candidateSha === git('rev-parse', 'HEAD'), 'candidate SHA does not match checked out HEAD');

for (const relative of [
  'scripts/hipico-exact-sha-gate.mjs',
  'scripts/hipico-secret-scan-v290.mjs',
  'scripts/hipico-apply-e2e-schema-v290.mjs',
  'scripts/hipico-ephemeral-db-v290.mjs',
  'scripts/hipico-verify-evidence-v290.mjs',
  'scripts/hipico-release-report-v290.mjs',
  'backend/src/modules/hipico/operator-read.routes.ts',
  'backend/src/modules/hipico/risk-policy.ts',
  'backend/src/modules/hipico/promotion-policy.ts',
  'backend/src/modules/hipico/agent-policy.ts',
  'backend/src/modules/hipico-bot/hipico-outbox.store.ts',
  'backend/src/modules/hipico-bot/hipico-test-channel.ts',
  'backend/src/modules/hipico-bot/production-e2e-v290.ts',
  'backend/scripts/hipico-restart-recovery-v290.ts',
  'backend/scripts/hipico-load-profile-v290.ts',
  'supabase/sql/hipico_v18_documents.sql',
  'supabase/sql/hipico_v22_agent_shadow.sql',
  'supabase/sql/hipico_v23_risk_policy.sql',
  'supabase/sql/hipico_v24_shadow_metrics.sql',
  'supabase/sql/hipico_v25_observability.sql',
  'supabase/sql/hipico_v26_audit_rpc_integrity.sql',
  'supabase/sql/hipico_v27_outbox_authority.sql',
  '.github/workflows/hipico-production-gates-v290.yml'
]) assert(exists(relative), `${relative} missing`);

execFileSync(process.execPath, ['scripts/hipico-exact-sha-gate.mjs'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, HIPICO_CANDIDATE_SHA: candidateSha }
});
execFileSync(process.execPath, ['scripts/hipico-secret-scan-v290.mjs'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, HIPICO_CANDIDATE_SHA: candidateSha }
});

const app = read('backend/src/app.ts');
for (const router of [
  'hipicoAgentRoutes', 'hipicoCommandCenterRoutes', 'hipicoOperatorReadRoutes',
  'hipicoProviderRoutes', 'hipicoRaceRoutes', 'hipicoCanonicalRoutes'
]) assert(app.includes(router), `canonical router missing: ${router}`);
assert(app.includes("app.use('/api/v1/hipico/system', authRateLimit, hipicoSystemRoutes)"), 'canonical system boundary missing');
assert(app.includes("app.use('/api/v1/hipico-bot', hipicoWebhookRoutes)"), 'compatibility adapter boundary missing');

const operatorRead = read('backend/src/modules/hipico/operator-read.routes.ts');
for (const route of ["'/groups'", "'/messages'", "'/events'", "'/events/stream'", "'/trace/:correlationId'"]) {
  assert(operatorRead.includes(route), `canonical operator route missing: ${route}`);
}
assert(operatorRead.includes('operatorTokenValid'), 'operator read facade must require operator token');
assert(operatorRead.includes('owner_id=${ownerId}::uuid'), 'operator reads must be owner scoped');
assert(/group_key=\$\{groupKey\}|channel_key=\$\{groupKey\}/.test(operatorRead), 'operator reads must be group scoped');

const cli = read('tools/hipico-cli/hipico.mjs');
for (const pathName of ['/api/v1/hipico/groups', '/api/v1/hipico/messages', '/api/v1/hipico/events', '/api/v1/hipico/trace/']) {
  assert(cli.includes(pathName), `CLI canonical route missing: ${pathName}`);
}
assert(!cli.includes('/api/v1/hipico-bot/events'), 'CLI must not use compatibility events as operational authority');
assert(cli.includes('HIPICO_CLI_REMOTE_HTTP_FORBIDDEN'), 'CLI must reject insecure remote HTTP');
assert(cli.includes('x-hipico-group-key'), 'CLI must bind group scope explicitly');

const agentRoutes = read('backend/src/modules/hipico/agent.routes.ts');
assert(agentRoutes.includes('actions: []'), 'agent evaluation must return no direct actions');
assert(agentRoutes.includes('financialAuthority: false'), 'agent must keep financialAuthority false');
assert(agentRoutes.includes('directEffectsApplied: false'), 'agent must keep directEffectsApplied false');
assert(!agentRoutes.includes('ownerApproved: body.ownerApproved'), 'client body must not grant owner approval');
assert(agentRoutes.includes('HIPICO_AUTOMATIC_OWNER_APPROVED'), 'owner approval must be server controlled');

const riskPolicy = read('backend/src/modules/hipico/risk-policy.ts');
for (const marker of [
  "RISK_DISPOSITIONS = ['AUTO', 'SUGGEST', 'HUMAN_REQUIRED', 'DENY']",
  'MODEL_CANDIDATE_REQUIRES_REVIEW',
  'FINANCIAL_AUTHORITY_DENIED',
  'SOURCE_READ_ONLY',
  'financialAuthority: false'
]) assert(riskPolicy.includes(marker), `risk policy boundary missing: ${marker}`);
assert(riskPolicy.includes("candidate.source === 'model'"), 'model candidate must remain advisory-only');

const promotionPolicy = read('backend/src/modules/hipico/promotion-policy.ts');
for (const marker of [
  'RECENT_WINDOW_DAYS = 30',
  "METRIC_SCHEMA_VERSION = 'v7'",
  'historicalReviewed',
  'recentReviewed',
  'RECENT_METRICS_INSUFFICIENT'
]) assert(promotionPolicy.includes(marker), `promotion boundary missing: ${marker}`);

const outboxStore = read('backend/src/modules/hipico-bot/hipico-outbox.store.ts');
for (const marker of [
  'FOR UPDATE SKIP LOCKED',
  "status IN ('queued', 'retry')",
  'reconciliation_required',
  'hipico_outbox_receipts',
  'monotonicReceiptStatus'
]) assert(outboxStore.includes(marker), `canonical outbox boundary missing: ${marker}`);

const schema = read('scripts/hipico-apply-e2e-schema-v290.mjs');
for (const migration of [
  'hipico_v17_provider_evidence.sql',
  'hipico_v18_documents.sql',
  'hipico_v20_document_audit.sql',
  'hipico_v21_race_data_conflicts.sql',
  'hipico_v21_production_outbox.sql',
  'hipico_v21_outbox_reconciliation_audit.sql',
  'hipico_v22_agent_shadow.sql',
  'hipico_v23_risk_policy.sql',
  'hipico_v24_shadow_metrics.sql',
  'hipico_v25_observability.sql',
  'hipico_v26_audit_rpc_integrity.sql',
  'hipico_v27_outbox_authority.sql'
]) assert(schema.includes(migration), `current PostgreSQL chain missing ${migration}`);
assert(!schema.includes('hipico_v16_agent_shadow.sql'), 'obsolete v16 agent migration must not be restored');
assert(schema.includes('SET LOCAL ROLE'), 'PostgreSQL E2E must execute least-privilege role checks');
assert(schema.includes('authenticatedAgentAutomationWriteDenied'), 'PostgreSQL E2E must deny browser agent writes');
assert(schema.includes('authenticatedProviderEvidenceWriteDenied'), 'PostgreSQL E2E must deny browser provider writes');
assert(schema.includes('agentPolicyColumnsNotNull'), 'PostgreSQL E2E must prove v23 policy columns');
assert(schema.includes('agentMetricColumnsNotNull'), 'PostgreSQL E2E must prove v24 metric columns');
assert(schema.includes('agentPolicyConstraintsPresent'), 'PostgreSQL E2E must prove v23/v24 constraints');
assert(schema.includes('outboxReceiptAppendOnlyTrigger'), 'PostgreSQL E2E must prove v21 receipt append-only evidence');
assert(schema.includes('outboxAuthorityPoliciesRemoved'), 'PostgreSQL E2E must prove v27 client write policies are removed');
assert(schema.includes('authenticatedOutboxPrivilegesDenied'), 'PostgreSQL E2E must prove v27 client outbox privileges are denied');
assert(schema.includes('authenticatedOutboxReceiptWriteDenied'), 'PostgreSQL E2E must deny browser receipt writes');
assert(schema.includes('outboxRequiredNotNull'), 'PostgreSQL E2E must prove canonical outbox required columns');
assert(schema.includes('observabilityAppendOnlyTrigger'), 'PostgreSQL E2E must prove v25 append-only observability');
assert(schema.includes('auditProvenanceColumnsPresent'), 'PostgreSQL E2E must prove v26 audit provenance columns');
assert(schema.includes('auditProvenanceColumnsNotNull'), 'PostgreSQL E2E must prove v26 provenance NOT NULL');
assert(schema.includes('auditRpcSecurityDefiner'), 'PostgreSQL E2E must prove v26 RPC security mode');
assert(schema.includes('auditRpcAnonExecute'), 'PostgreSQL E2E must prove v26 anon grant state');
assert(schema.includes('auditRpcAuthenticatedExecute'), 'PostgreSQL E2E must prove v26 authenticated grant state');
assert(schema.includes('auditRpcServiceRoleExecute'), 'PostgreSQL E2E must prove v26 service role grant state');

const testChannel = read('backend/src/modules/hipico-bot/hipico-test-channel.ts');
assert(testChannel.includes('TEST_CHANNEL_NOT_CONNECTED'), 'TestChannel must fail closed while disconnected');
assert(testChannel.includes('TEST_CHANNEL_IDENTITY_MISMATCH'), 'TestChannel must reject wrong identity');
const productionE2E = read('backend/src/modules/hipico-bot/production-e2e-v290.ts');
assert(productionE2E.includes('HipicoBotStore.dbReady(true)'), 'production E2E must require persistent PostgreSQL');
assert(productionE2E.includes('result?.duplicate, true'), 'production E2E must prove replay idempotency');
const loadProfile = read('backend/scripts/hipico-load-profile-v290.ts');
assert(loadProfile.includes('[100, 500, 2000]'), 'load profile must measure 100/500/2000');
assert(loadProfile.includes("acceptance: 'NOT_EXECUTED'"), 'physical acceptance must remain separate evidence');
assert(loadProfile.includes('memorySnapshot()'), 'load profile must capture process memory');
assert(loadProfile.includes('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)'), 'load profile must capture PostgreSQL query plan');

const workflow = read('.github/workflows/hipico-production-gates-v290.yml');
for (const marker of [
  'github.event.pull_request.head.sha || github.sha',
  'tesseract-ocr-eng',
  'hipico-ephemeral-db-v290.mjs create',
  'hipico-apply-e2e-schema-v290.mjs',
  'production-e2e-v290.ts',
  'hipico-restart-recovery-v290.ts prepare',
  'hipico-restart-recovery-v290.ts verify',
  'npm --workspace backend run test:hipico:agent',
  'hipico-load-profile-v290.ts',
  'browser: [chromium, firefox, webkit]',
  'v12-v27'
]) assert(workflow.includes(marker), `production workflow missing ${marker}`);
assert(!/pull_request:\s*\n\s*branches:\s*\[main\]/.test(workflow), 'stacked PRs must be able to execute the exact-SHA production gate');

const bypassRules = [
  [/\btest\.(?:skip|only)\s*\(/, 'test.skip/test.only'],
  [/\b(?:describe|it)\.(?:skip|only)\s*\(/, 'suite skip/only'],
  [/waitForTimeout\s*\(/, 'waitForTimeout'],
  [/\bforce\s*:\s*true\b/, 'forced browser action'],
  [/continue-on-error\s*:\s*true/, 'continue-on-error'],
  [/\|\|\s*true/, 'shell bypass']
];
for (const relative of [
  'backend/src/modules/hipico-bot/production-e2e-v290.ts',
  'tests/hipico_operator_read_facade_290.test.mjs',
  'tests/hipico_postgres_e2e_chain_290.test.mjs',
  'tests/hipico_release_hardening_290_contract.test.mjs',
  'tests/hipico_v9_release_boundaries.test.mjs',
  '.github/workflows/hipico-production-gates-v290.yml'
]) {
  const source = read(relative);
  for (const [pattern, label] of bypassRules) assert(!pattern.test(source), `${relative} contains forbidden ${label}`);
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
    canonicalOperatorReadFacade: true,
    sourceReadOnly: true,
    financialAuthority: false,
    directEffectsApplied: false,
    ownerApprovalServerControlled: true,
    riskPolicyDeterministic: true,
    modelAdvisoryOnly: true,
    dualWindowPromotion: true,
    canonicalOutboxAuthority: true,
    currentPostgresChain: 'v12-v27',
    testChannelReplay: true,
    loadProfileVolumes: [100, 500, 2000],
    exactSha: true
  }
}, null, 2)}\n`, 'utf8');
console.log(`[hipico-v290] release guard PASS sha=${candidateSha}`);
