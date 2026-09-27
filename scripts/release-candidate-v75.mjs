import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const VALID = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED']);
const ACTIONS_POLICY = 'NOT_VERIFIED_NON_BLOCKING';
const candidateSha = String(process.env.CANDIDATE_SHA || process.argv.find((arg) => arg.startsWith('--sha='))?.split('=')[1] || '').trim();
const baselineSha = String(process.env.BASELINE_SHA || process.argv.find((arg) => arg.startsWith('--baseline='))?.split('=')[1] || '').trim() || null;
const command = process.argv[2] || 'status';
if (!/^[a-f0-9]{40}$/i.test(candidateSha)) throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
if (baselineSha && !/^[a-f0-9]{40}$/i.test(baselineSha)) throw new Error('BASELINE_SHA_INVALID');

const root = path.resolve('artifacts/release/v75', candidateSha);
const evidenceFile = path.join(root, 'evidence.json');
const summaryFile = path.join(root, 'summary.json');

const GATES = Object.freeze([
  ['source', 'clean-checkout'],
  ['source', 'lockfile-install'],
  ['source', 'lint'],
  ['source', 'typecheck'],
  ['source', 'prisma-validate-generate'],
  ['source', 'technical-baseline'],
  ['source', 'architecture-boundaries'],
  ['source', 'database-authority'],
  ['source', 'raw-sql-security'],
  ['source', 'design-system-assets'],
  ['source', 'contract-characterization'],
  ['database-backend', 'postgres-fresh-migrations'],
  ['database-backend', 'postgres-upgrade'],
  ['database-backend', 'unit-integration'],
  ['database-backend', 'tenant-isolation-negative'],
  ['database-backend', 'financial-idempotency-transactions'],
  ['database-backend', 'backend-build'],
  ['database-backend', 'api-smoke'],
  ['frontend-browser', 'frontend-build'],
  ['frontend-browser', 'bundle-baseline'],
  ['frontend-browser', 'chromium'],
  ['frontend-browser', 'firefox'],
  ['frontend-browser', 'webkit'],
  ['frontend-browser', 'wcag'],
  ['frontend-browser', 'visual-functional-catalog'],
  ['frontend-browser', 'theme-responsive-reduced-motion'],
  ['pwa-hipico', 'pwa-install-update-cache'],
  ['pwa-hipico', 'offline-reconnect'],
  ['pwa-hipico', 'indexeddb-projection-recovery'],
  ['pwa-hipico', 'whatsapp-lab-autonomous'],
  ['pwa-hipico', 'bridge-restart-reconnect'],
  ['pwa-hipico', 'no-duplicate-no-double-money'],
  ['pwa-hipico', 'receipts-reconciliation'],
  ['operations-security', 'security-baseline'],
  ['operations-security', 'dependency-secret-audit'],
  ['operations-security', 'observability-correlation'],
  ['operations-security', 'backup-restore-drill'],
  ['operations-security', 'migration-rollback-recovery'],
  ['operations-security', 'production-like-smoke'],
  ['operations-security', 'artifact-log-sanitization']
]);

function blankGate([group, id]) {
  return {
    id,
    group,
    required: true,
    status: 'NOT_EXECUTED',
    blockerKind: null,
    evidence: [],
    notes: ''
  };
}
function template() {
  return {
    schemaVersion: 1,
    issue: 548,
    baselineSha,
    candidateSha,
    generatedAt: new Date().toISOString(),
    actionsPolicy: ACTIONS_POLICY,
    githubActions: {
      requiredChecks: {
        status: 'NOT_EXECUTED',
        verification: 'NOT VERIFIED',
        blocking: false,
        runIds: [],
        evidence: [],
        notes: 'Temporarily non-blocking by explicit operational instruction; never inferred PASS.'
      }
    },
    releaseScope: {
      branchProtection: { status: 'NOT_EXECUTED', issue: 97, evidence: [], notes: '' },
      legalExternal: { status: 'NOT_EXECUTED', issue: 29, evidence: [], notes: '' },
      physicalQa: { status: 'NOT_EXECUTED', issue: 119, evidence: [], notes: '' },
      soak: { status: 'NOT_EXECUTED', issue: 120, evidence: [], notes: '' }
    },
    gates: GATES.map(blankGate),
    finalDiffReview: { status: 'NOT_EXECUTED', evidence: [], notes: '' },
    secretReview: { status: 'NOT_EXECUTED', evidence: [], notes: '' },
    decision: 'NOT_EXECUTED'
  };
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function validateStatus(value, label) {
  if (!VALID.has(value)) throw new Error(`INVALID_STATUS:${label}:${value}`);
}
function requireEvidenceWhenPass(item, label) {
  if (item.status === 'PASS' && (!Array.isArray(item.evidence) || item.evidence.length === 0)) {
    throw new Error(`PASS_WITHOUT_EVIDENCE:${label}`);
  }
}
function statusVerdict(statuses) {
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('BLOCKED')) return 'BLOCKED';
  if (statuses.includes('NOT_EXECUTED')) return 'NOT_EXECUTED';
  return 'PASS';
}

if (command === 'init') {
  fs.mkdirSync(root, { recursive: true });
  if (!fs.existsSync(evidenceFile)) fs.writeFileSync(evidenceFile, JSON.stringify(template(), null, 2) + '\n');
  console.log(evidenceFile);
  process.exit(0);
}
if (!fs.existsSync(evidenceFile)) throw new Error(`EVIDENCE_NOT_FOUND:${evidenceFile}`);
const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
if (evidence.schemaVersion !== 1 || evidence.issue !== 548) throw new Error('RELEASE_V75_SCHEMA_INVALID');
if (evidence.candidateSha !== candidateSha) throw new Error('EVIDENCE_SHA_MISMATCH');
if ((evidence.baselineSha || null) !== baselineSha) throw new Error('BASELINE_SHA_MISMATCH');
if (evidence.actionsPolicy !== ACTIONS_POLICY) throw new Error('ACTIONS_POLICY_MISMATCH');

const expected = new Set(GATES.map(([, id]) => id));
const observed = new Set();
for (const gate of evidence.gates || []) {
  if (!expected.has(gate.id)) throw new Error(`UNKNOWN_RELEASE_GATE:${gate.id}`);
  if (observed.has(gate.id)) throw new Error(`DUPLICATE_RELEASE_GATE:${gate.id}`);
  observed.add(gate.id);
  validateStatus(gate.status, gate.id);
  requireEvidenceWhenPass(gate, gate.id);
  if (gate.blockerKind && gate.status !== 'BLOCKED') throw new Error(`BLOCKER_KIND_WITHOUT_BLOCKED:${gate.id}`);
}
for (const id of expected) if (!observed.has(id)) throw new Error(`MISSING_RELEASE_GATE:${id}`);

for (const [label, item] of Object.entries(evidence.releaseScope || {})) {
  validateStatus(item.status, `scope:${label}`);
  requireEvidenceWhenPass(item, `scope:${label}`);
}
for (const [label, item] of [['final-diff-review', evidence.finalDiffReview], ['secret-review', evidence.secretReview]]) {
  validateStatus(item?.status, label);
  requireEvidenceWhenPass(item, label);
}

const actions = evidence.githubActions?.requiredChecks;
validateStatus(actions?.status, 'github-actions-required-checks');
if (actions?.verification !== 'NOT VERIFIED' || actions?.blocking !== false) {
  throw new Error('GITHUB_ACTIONS_MUST_REMAIN_NOT_VERIFIED_NON_BLOCKING');
}
if (actions.status === 'PASS') throw new Error('GITHUB_ACTIONS_PASS_FORBIDDEN_UNDER_CURRENT_POLICY');

const gateStatuses = evidence.gates.map((gate) => gate.status);
const evidenceVerdict = statusVerdict([
  ...gateStatuses,
  evidence.finalDiffReview.status,
  evidence.secretReview.status
]);
const scopeStatuses = Object.values(evidence.releaseScope || {}).map((item) => item.status);
const scopeVerdict = statusVerdict(scopeStatuses);
const integrationVerdict = statusVerdict([
  ...gateStatuses,
  evidence.finalDiffReview.status,
  evidence.secretReview.status
]);
const releaseReady = evidenceVerdict === 'PASS' && scopeVerdict === 'PASS';
const decision = releaseReady ? 'RELEASE_READY' : evidenceVerdict === 'FAIL' ? 'FAIL' : evidenceVerdict === 'BLOCKED' || scopeVerdict === 'BLOCKED' ? 'BLOCKED' : 'NOT_EXECUTED';

const counts = Object.fromEntries([...VALID].map((status) => [status, gateStatuses.filter((value) => value === status).length]));
const summary = {
  issue: 548,
  baselineSha,
  candidateSha,
  actionsPolicy: ACTIONS_POLICY,
  actionsStatus: 'NOT VERIFIED / NON-BLOCKING',
  evidenceVerdict,
  scopeVerdict,
  integrationVerdict,
  releaseReady,
  decision,
  counts,
  requiredGateCount: GATES.length,
  manifestHash: digest(evidence.gates.map(({ id, group, required, status, blockerKind }) => ({ id, group, required, status, blockerKind }))),
  checkedAt: new Date().toISOString()
};
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
if (command === 'check' && !releaseReady) process.exitCode = 2;
