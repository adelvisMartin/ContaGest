import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildErpE2EMatrixV155,
  caseIdentityV155,
  ERP_E2E_REQUIRED_ASSERTIONS_V155,
  ERP_E2E_VIEWPORTS_V155,
  validateEvidenceMatrixV155
} from '../qa/support/erp-e2e-matrix-v155.mjs';

const VALID = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED']);
const sha = String(process.env.CANDIDATE_SHA || process.argv.find((arg) => arg.startsWith('--sha='))?.split('=')[1] || '').trim();
const command = process.argv[2] || 'status';
if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');

const root = path.resolve('artifacts/qa/release-v74', sha);
const evidenceFile = path.join(root, 'evidence.json');
const summaryFile = path.join(root, 'summary.json');
const matrix = buildErpE2EMatrixV155();

const releaseModes = [
  'zoom-200', 'keyboard-only', 'screen-reader-semantics', 'theme-light', 'theme-dark', 'theme-system',
  'reduced-motion', 'long-unicode-content', 'slow-api', 'optimistic-rollback', 'offline-reconnect', 'multi-session'
];
const longitudinalJourneys = [
  { id: 'odontologia-longitudinal', routes: ['odontologia'], flow: 'patient-agenda-encounter-plan-review-media-finance-refresh' },
  { id: 'veterinaria-longitudinal', routes: ['veterinaria'], flow: 'guardian-patient-consult-vaccine-diagnosis-prescription-files-payment-refresh' },
  { id: 'fitness-nutrition-longitudinal', routes: ['gimnasio', 'rutinas', 'nutricion'], flow: 'membership-booking-workout-periodization-nutrition-adherence-refresh' },
  { id: 'hipico-longitudinal', routes: ['login', 'hipico-control'], flow: 'login-bridge-lab-autonomy-outbox-reconciliation-reconnect-refresh' }
];
const antiOverlapAssertions = [
  'no-horizontal-overflow', 'no-component-overlap', 'sticky-header-does-not-occlude', 'dialog-within-viewport',
  'popover-not-clipped', 'controls-not-covered', 'table-chart-contained', 'long-text-wraps', 'touch-targets-usable',
  'focus-not-trapped-or-lost', 'contrast-acceptable', 'theme-state-consistent'
];
const performanceMetrics = [
  'route-load-ms', 'render-long-task-ms', 'route-chunk-bytes', 'api-p95-ms', 'db-p95-ms',
  'export-duration-ms', 'representative-session-memory-mb'
];

function blank(status = 'NOT_EXECUTED') { return { status, evidence: [], findings: [], notes: '' }; }
function template() {
  return {
    schemaVersion: 1,
    issue: 547,
    sourceMatrixIssue: 155,
    candidateSha: sha,
    generatedAt: new Date().toISOString(),
    truthState: 'NOT_EXECUTED',
    viewports: ERP_E2E_VIEWPORTS_V155,
    inheritedAssertions: ERP_E2E_REQUIRED_ASSERTIONS_V155,
    antiOverlapAssertions,
    baseCases: matrix.map((item) => ({ ...item, ...blank() })),
    releaseModes: releaseModes.map((mode) => ({ mode, ...blank() })),
    journeys: longitudinalJourneys.map((journey) => ({ ...journey, persistenceRefreshEvidence: [], ...blank() })),
    performance: {
      status: 'NOT_EXECUTED',
      baselineSha: null,
      measurements: performanceMetrics.map((metric) => ({ metric, value: null, unit: null, route: null, evidence: [] })),
      findings: []
    },
    accessibility: { issue: 99, automation: 'NOT_EXECUTED', keyboardManual: 'NOT_EXECUTED', semanticsManual: 'NOT_EXECUTED', evidence: [] }
  };
}

function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function requireStatus(value, label) { if (!VALID.has(value)) throw new Error(`INVALID_STATUS:${label}:${value}`); }
function requirePassEvidence(item, label) {
  if (item.status === 'PASS' && (!Array.isArray(item.evidence) || item.evidence.length === 0)) throw new Error(`PASS_WITHOUT_EVIDENCE:${label}`);
}

if (command === 'init') {
  fs.mkdirSync(root, { recursive: true });
  if (!fs.existsSync(evidenceFile)) fs.writeFileSync(evidenceFile, JSON.stringify(template(), null, 2) + '\n');
  console.log(evidenceFile);
  process.exit(0);
}
if (!fs.existsSync(evidenceFile)) throw new Error(`EVIDENCE_NOT_FOUND:${evidenceFile}`);
const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
if (evidence.schemaVersion !== 1 || evidence.issue !== 547 || evidence.sourceMatrixIssue !== 155) throw new Error('RELEASE_V74_SCHEMA_INVALID');
if (evidence.candidateSha !== sha) throw new Error('EVIDENCE_SHA_MISMATCH');
const matrixValidation = validateEvidenceMatrixV155(evidence.baseCases || []);
if (!matrixValidation.valid) throw new Error(`SOURCE_MATRIX_INVALID:${matrixValidation.errors.slice(0, 10).join(',')}`);

for (const item of evidence.baseCases || []) { requireStatus(item.status, caseIdentityV155(item)); requirePassEvidence(item, caseIdentityV155(item)); }
for (const item of evidence.releaseModes || []) { requireStatus(item.status, item.mode); requirePassEvidence(item, item.mode); }
for (const journey of evidence.journeys || []) {
  requireStatus(journey.status, journey.id);
  requirePassEvidence(journey, journey.id);
  if (journey.status === 'PASS' && (!Array.isArray(journey.persistenceRefreshEvidence) || journey.persistenceRefreshEvidence.length === 0)) {
    throw new Error(`JOURNEY_PASS_WITHOUT_PERSISTENCE_REFRESH:${journey.id}`);
  }
}
requireStatus(evidence.performance?.status, 'performance');
requireStatus(evidence.accessibility?.automation, 'a11y-automation');
requireStatus(evidence.accessibility?.keyboardManual, 'a11y-keyboard');
requireStatus(evidence.accessibility?.semanticsManual, 'a11y-semantics');

const allStatuses = [
  ...(evidence.baseCases || []).map((item) => item.status),
  ...(evidence.releaseModes || []).map((item) => item.status),
  ...(evidence.journeys || []).map((item) => item.status),
  evidence.performance?.status,
  evidence.accessibility?.automation,
  evidence.accessibility?.keyboardManual,
  evidence.accessibility?.semanticsManual
];
const counts = Object.fromEntries([...VALID].map((status) => [status, allStatuses.filter((value) => value === status).length]));
let verdict = 'PASS';
if (counts.FAIL) verdict = 'FAIL';
else if (counts.BLOCKED) verdict = 'BLOCKED';
else if (counts.NOT_EXECUTED) verdict = 'NOT_EXECUTED';
const summary = {
  issue: 547,
  candidateSha: sha,
  sourceMatrixIssue: 155,
  verdict,
  counts,
  matrixCases: evidence.baseCases.length,
  matrixIdentityHash: digest(evidence.baseCases.map((item) => caseIdentityV155(item))),
  releaseModes: evidence.releaseModes.length,
  journeys: evidence.journeys.length,
  checkedAt: new Date().toISOString()
};
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
if (command === 'check' && verdict !== 'PASS') process.exitCode = 2;
