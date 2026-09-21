import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const SHA40 = /^[0-9a-f]{40}$/i;
const STATUSES = Object.freeze(['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED']);
const evidenceRoot = path.resolve(process.env.HIPICO_EVIDENCE_ROOT || 'artifacts/qa');
const outputRoot = path.resolve('artifacts/qa/hipico-v290');

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim().toLowerCase();
  } catch {
    return '';
  }
}

const sha = String(
  process.env.HIPICO_RELEASE_SHA
    || process.env.HIPICO_CANDIDATE_SHA
    || process.env.GITHUB_SHA
    || gitHead()
).trim().toLowerCase();
if (!SHA40.test(sha)) throw new Error('HIPICO_EVIDENCE_SHA_REQUIRED');
const head = gitHead();
if (head && head !== sha) throw new Error(`HIPICO_EVIDENCE_SHA_MISMATCH:${head}:${sha}`);

async function walk(directory, output = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute, output);
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

function evidenceSha(data) {
  return String(data?.sha || data?.candidateSha || data?.buildCommit || '').trim().toLowerCase();
}

function evidenceStatus(data) {
  const explicit = String(data?.status || '').trim().toUpperCase();
  if (STATUSES.includes(explicit)) return explicit;
  return 'NOT_EXECUTED';
}

function migrationsInclude(data, suffix) {
  const migrations = Array.isArray(data?.migrations) ? data.migrations : [];
  return migrations.some((entry) => String(entry).endsWith(suffix));
}

const files = await walk(evidenceRoot).catch(() => []);
const jsonFiles = files.filter((file) => file.endsWith('.json'));
const parsed = [];
for (const file of jsonFiles) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    parsed.push({ file, name: path.basename(file), data });
  } catch {
    // Corrupt/non-JSON evidence cannot prove a gate and is ignored.
  }
}

const requiredDescriptors = [
  { id: 'secretScan', name: 'secret-scan.json', schemas: ['hipico-secret-scan.v290', 'hipico-secret-scan.v290-current'] },
  {
    id: 'releaseGuard',
    name: 'release-guard.json',
    schemas: ['hipico-release-guard.v290-current'],
    validate: (data) => data?.invariants?.currentPostgresChain === 'v12-v27'
      && data?.invariants?.riskPolicyDeterministic === true
      && data?.invariants?.modelAdvisoryOnly === true
      && data?.invariants?.dualWindowPromotion === true
      && data?.invariants?.canonicalOutboxAuthority === true
  },
  { id: 'staticGate', name: 'static-gate.json', schemas: ['hipico-static-gate.v290-current'] },
  {
    id: 'postgresRbac',
    name: 'postgres-rbac.json',
    schemas: ['hipico-rbac.v290', 'hipico-rbac.v290-current'],
    validate: (data) => migrationsInclude(data, 'hipico_v23_risk_policy.sql')
      && migrationsInclude(data, 'hipico_v24_shadow_metrics.sql')
      && migrationsInclude(data, 'hipico_v25_observability.sql')
      && migrationsInclude(data, 'hipico_v26_audit_rpc_integrity.sql')
      && migrationsInclude(data, 'hipico_v27_outbox_authority.sql')
      && migrationsInclude(data, 'hipico_v21_production_outbox.sql')
      && migrationsInclude(data, 'hipico_v21_outbox_reconciliation_audit.sql')
      && data?.assertions?.agentPolicyColumnsNotNull === true
      && data?.assertions?.agentMetricColumnsNotNull === true
      && data?.assertions?.agentPolicyConstraintsPresent === true
      && data?.assertions?.observabilityTablePresent === true
      && data?.assertions?.observabilityAppendOnlyTrigger === true
      && data?.assertions?.authenticatedObservabilityWriteDenied === true
      && data?.assertions?.authenticatedOutboxWriteDenied === true
      && data?.assertions?.authenticatedOutboxReceiptWriteDenied === true
      && data?.assertions?.outboxReceiptsAppendOnlyTrigger === true
      && data?.assertions?.auditProvenanceColumnsPresent === true
      && data?.assertions?.auditProvenanceColumnsNotNull === true
      && data?.assertions?.auditRpcSecurityDefiner === true
      && data?.assertions?.auditRpcAnonExecute === false
      && data?.assertions?.auditRpcAuthenticatedExecute === true
      && data?.assertions?.auditRpcServiceRoleExecute === true
  },
  {
    id: 'postgresGate',
    name: 'postgres-gate.json',
    schemas: ['hipico-postgres-gate.v290-current'],
    validate: (data) => data?.migrations === 'v12-v27'
      && data?.testChannelReplay === 'PASS'
      && data?.agentPolicyMetrics === 'PASS'
      && data?.restartRecovery === 'PASS'
      && data?.loadProfile === 'PASS'
  },
  { id: 'restart', name: 'restart-state.json', schemas: ['hipico-restart.v290', 'hipico-restart.v290-current'] },
  { id: 'performance', name: 'postgres-performance.json', schemas: ['hipico-performance.v290', 'hipico-performance.v290-current'] },
  { id: 'chromiumGate', name: 'chromium-gate.json', schemas: ['hipico-browser-gate.v290-current'] },
  { id: 'securityGate', name: 'security-gate.json', schemas: ['hipico-security-gate.v290-current'] },
  { id: 'androidGate', name: 'android-gate.json', schemas: ['hipico-android-gate.v290-current'] },
  { id: 'releaseManifest', name: 'release-manifest.json', schemas: ['hipico-release-evidence.v1'], requireClean: true }
];

const optionalDescriptors = [
  { id: 'runtimeBuild', name: 'build-info.json', schemas: [] },
  { id: 'apkMetadata', name: 'QA_APK_METADATA.json', schemas: [] },
  { id: 'productionSchema', name: 'schema-postdeploy.json', schemas: ['hipico-schema-postdeploy.v18'] },
  {
    id: 'physicalQa',
    name: 'physical-qa-evidence.json',
    schemas: ['hipico-physical-qa-evidence.v119'],
    validate: (data) => {
      const requiredModes = ['pwa-browser', 'pwa-standalone', 'android-apk'];
      const declaredModes = Array.isArray(data?.requiredModes) ? data.requiredModes : [];
      const environments = Array.isArray(data?.environments) ? data.environments : [];
      const evidenceFiles = Array.isArray(data?.evidenceFiles) ? data.evidenceFiles : [];
      const completedAt = String(data?.completedAt || '').trim();
      const operator = String(data?.operator || '').trim();
      const invariants = data?.invariants || {};
      return data?.summary?.releasePhysicalGate === 'PASS'
        && data?.summary?.materialEvidenceComplete === true
        && Boolean(completedAt)
        && Number.isFinite(Date.parse(completedAt))
        && operator.length >= 2
        && requiredModes.every((mode) => declaredModes.includes(mode))
        && requiredModes.every((mode) => environments.some((env) => env?.mode === mode))
        && invariants.sourceReadOnly === 'PASS'
        && invariants.labOnlyWriteDestination === 'PASS'
        && invariants.sessionFallbackSafe === 'PASS'
        && evidenceFiles.length > 0
        && evidenceFiles.every((item) => typeof item?.path === 'string'
          && item.path.length > 0
          && /^[a-f0-9]{64}$/i.test(String(item?.sha256 || '')))
    }
  },
  {
    id: 'authRecovery',
    name: 'auth-recovery-evidence.json',
    schemas: ['hipico-auth-recovery-e2e.v28'],
    validate: (data) => data?.phase === 'COMPLETE' && data?.status === 'PASS' && data?.e2eComplete === true
  }
];

function findDescriptor(descriptor) {
  const candidates = parsed.filter((item) => item.name === descriptor.name);
  const sameSha = candidates.filter((item) => evidenceSha(item.data) === sha);
  const schemaMatch = descriptor.schemas.length
    ? sameSha.filter((item) => descriptor.schemas.includes(String(item.data?.schema || '')))
    : sameSha;
  const pass = schemaMatch.find((item) => evidenceStatus(item.data) === 'PASS');
  const selected = pass || schemaMatch[0] || sameSha[0] || candidates[0] || null;
  if (!selected) return { id: descriptor.id, status: 'NOT_EXECUTED', file: null, reason: 'EVIDENCE_MISSING' };
  if (evidenceSha(selected.data) !== sha) {
    return { id: descriptor.id, status: 'FAIL', file: path.relative(evidenceRoot, selected.file), reason: 'SHA_MISMATCH' };
  }
  if (descriptor.schemas.length && !descriptor.schemas.includes(String(selected.data?.schema || ''))) {
    return { id: descriptor.id, status: 'FAIL', file: path.relative(evidenceRoot, selected.file), reason: 'SCHEMA_MISMATCH' };
  }
  if (descriptor.requireClean && selected.data?.dirty !== false) {
    return { id: descriptor.id, status: 'FAIL', file: path.relative(evidenceRoot, selected.file), reason: 'WORKTREE_DIRTY_OR_UNKNOWN' };
  }
  if (typeof descriptor.validate === 'function' && descriptor.validate(selected.data) !== true) {
    return { id: descriptor.id, status: 'FAIL', file: path.relative(evidenceRoot, selected.file), reason: 'EVIDENCE_CONTRACT_MISMATCH' };
  }
  const status = evidenceStatus(selected.data);
  return {
    id: descriptor.id,
    status,
    file: path.relative(evidenceRoot, selected.file),
    schema: selected.data?.schema || null,
    reason: status === 'PASS' ? null : String(selected.data?.reason || 'EVIDENCE_NOT_PASS')
  };
}

const required = requiredDescriptors.map(findDescriptor);
const optional = optionalDescriptors.map(findDescriptor);
const screenshots = files.filter((file) => file.endsWith('.png') && file.includes(`${path.sep}hipico-v105${path.sep}${sha}${path.sep}`));
const browserStatus = screenshots.length ? 'PASS' : 'NOT_EXECUTED';
const browser = {
  id: 'browserVisualEvidence',
  status: browserStatus,
  screenshotCount: screenshots.length,
  reason: screenshots.length ? null : 'BROWSER_EVIDENCE_MISSING'
};

const requiredStatuses = required.map((item) => item.status);
let aggregateStatus = 'PASS';
if (requiredStatuses.includes('FAIL')) aggregateStatus = 'FAIL';
else if (requiredStatuses.includes('BLOCKED')) aggregateStatus = 'BLOCKED';
else if (requiredStatuses.includes('NOT_EXECUTED')) aggregateStatus = 'NOT_EXECUTED';

await fs.mkdir(outputRoot, { recursive: true });
const result = {
  schema: 'hipico-evidence-verification.v290-current',
  sha,
  status: aggregateStatus,
  allowedStatuses: STATUSES,
  checkedAt: new Date().toISOString(),
  evidenceRoot,
  postgresChain: 'v12-v27',
  required,
  optional,
  browser
};
await fs.writeFile(path.join(outputRoot, 'evidence-verification.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');

if (aggregateStatus !== 'PASS') {
  const detail = required.filter((item) => item.status !== 'PASS').map((item) => `${item.id}:${item.status}`).join(',');
  console.error(`[hipico-v290] evidence ${aggregateStatus} sha=${sha} ${detail}`);
  process.exitCode = 1;
} else {
  console.log(`[hipico-v290] evidence PASS sha=${sha} required=${required.length} browser=${browser.status}`);
}
