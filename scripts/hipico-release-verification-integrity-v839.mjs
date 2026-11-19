/**
 * #839: verify the internal shape and aggregate of the verifier's report
 * before another process interprets its PASS values. This does not establish
 * provenance or replace the underlying executed gate artifacts.
 */
export const REQUIRED_HIPICO_EVIDENCE_IDS = Object.freeze([
  'secretScan', 'releaseGuard', 'staticGate', 'postgresRbac', 'postgresGate',
  'restart', 'performance', 'chromiumGate', 'securityGate', 'androidGate',
  'releaseManifest'
]);
export const OPTIONAL_HIPICO_EVIDENCE_IDS = Object.freeze([
  'runtimeBuild', 'apkMetadata', 'productionSchema', 'soak', 'physicalQa',
  'drRestore', 'authRecovery'
]);
const STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED']);
const SHA40 = /^[a-f0-9]{40}$/i;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

function validRows(rows, ids) {
  if (!Array.isArray(rows) || rows.length !== ids.length) return false;
  const expected = new Set(ids);
  const found = new Set();
  for (const row of rows) {
    if (!row || !expected.has(row.id) || found.has(row.id) ||
        !STATUSES.has(row.status) ||
        (row.status === 'PASS' &&
          (typeof row.file !== 'string' || !row.file.trim()))) return false;
    found.add(row.id);
  }
  return true;
}

function aggregateStatuses(statuses) {
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('BLOCKED')) return 'BLOCKED';
  if (statuses.includes('NOT_EXECUTED')) return 'NOT_EXECUTED';
  return 'PASS';
}

export function validHipicoVerificationReport(report, candidateSha) {
  if (!report || typeof report !== 'object' || Array.isArray(report) ||
      report.schema !== 'hipico-evidence-verification.v290-current' ||
      typeof report.sha !== 'string' || !SHA40.test(report.sha) ||
      typeof candidateSha !== 'string' || !SHA40.test(candidateSha) ||
      report.sha.toLowerCase() !== candidateSha.toLowerCase() ||
      !STATUSES.has(report.status) ||
      !validRows(report.required, REQUIRED_HIPICO_EVIDENCE_IDS) ||
      !validRows(report.optional, OPTIONAL_HIPICO_EVIDENCE_IDS)) return false;
  const checkedAt = report.checkedAt;
  if (typeof checkedAt !== 'string' || !UTC.test(checkedAt) ||
      !Number.isFinite(Date.parse(checkedAt)) ||
      new Date(checkedAt).toISOString() !== checkedAt ||
      Date.parse(checkedAt) > Date.now() + 60_000 ||
      aggregateStatuses(report.required.map(row => row.status)) !== report.status)
    return false;
  const chromium = report.required.find(row => row.id === 'chromiumGate');
  const browser = report.browser;
  return !!browser && browser.id === 'browserVisualEvidence' &&
    STATUSES.has(browser.status) &&
    Number.isSafeInteger(browser.screenshotCount) && browser.screenshotCount >= 0 &&
    (browser.status !== 'PASS' ||
      (chromium.status === 'PASS' && browser.screenshotCount > 0));
}
