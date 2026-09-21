import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  computeReadinessScore,
  deriveAutomationReadiness,
  deriveProductionReadinessState
} from './hipico-release-readiness-v9.mjs';
import { combineProductionSchemaGate } from './hipico-production-schema-gate-v20.mjs';
import { combineAuthRecoveryGate } from './hipico-auth-recovery-gate-v29.mjs';

const SHA40 = /^[0-9a-f]{40}$/i;
const STATUSES = Object.freeze(['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED']);
const outputRoot = path.resolve('artifacts/qa/hipico-v290');

function gitHead() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim().toLowerCase(); }
  catch { return ''; }
}
function status(value, fallback = 'NOT_EXECUTED') {
  const normalized = String(value || fallback).trim().toUpperCase();
  return STATUSES.includes(normalized) ? normalized : 'FAIL';
}
function aggregate(values) {
  if (values.includes('FAIL')) return 'FAIL';
  if (values.includes('BLOCKED')) return 'BLOCKED';
  if (values.includes('NOT_EXECUTED')) return 'NOT_EXECUTED';
  return 'PASS';
}
function booleanEvidence(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', 'yes', '1', 'open', 'critical'].includes(normalized)) return true;
  if (['false', 'no', '0', 'clear', 'none'].includes(normalized)) return false;
  return null;
}
async function readJson(relative) {
  try { return JSON.parse(await fs.readFile(path.join(outputRoot, relative), 'utf8')); }
  catch { return null; }
}

const sha = String(process.env.HIPICO_RELEASE_SHA || process.env.HIPICO_CANDIDATE_SHA || process.env.GITHUB_SHA || gitHead()).trim().toLowerCase();
if (!SHA40.test(sha)) throw new Error('HIPICO_RELEASE_REPORT_SHA_REQUIRED');
const head = gitHead();
if (head && head !== sha) throw new Error(`HIPICO_RELEASE_REPORT_SHA_MISMATCH:${head}:${sha}`);

const verified = await readJson('evidence-verification.json');
const evidence = verified && String(verified.sha || '').toLowerCase() === sha ? status(verified.status) : 'NOT_EXECUTED';
const optionalEvidence = Array.isArray(verified?.optional) ? verified.optional : [];
const productionSchemaArtifact = status(optionalEvidence.find((item) => item?.id === 'productionSchema')?.status);
const productionSchemaJob = status(process.env.HIPICO_GATE_PRODUCTION_SCHEMA);
const productionSchemaStatus = combineProductionSchemaGate(productionSchemaJob, productionSchemaArtifact);
const physicalQaArtifact = status(optionalEvidence.find((item) => item?.id === 'physicalQa')?.status);
const soakArtifact = status(optionalEvidence.find((item) => item?.id === 'soak')?.status);
const authRecoveryArtifact = status(optionalEvidence.find((item) => item?.id === 'authRecovery')?.status);
const authRecoveryJob = status(process.env.HIPICO_GATE_AUTH_RECOVERY);
const authRecoveryStatus = combineAuthRecoveryGate(authRecoveryJob, authRecoveryArtifact);
const gates = {
  static: status(process.env.HIPICO_GATE_STATIC),
  postgres: status(process.env.HIPICO_GATE_POSTGRES),
  restartRecovery: status(process.env.HIPICO_GATE_RESTART),
  browserChromium: status(process.env.HIPICO_GATE_CHROMIUM),
  security: status(process.env.HIPICO_GATE_SECURITY),
  android: status(process.env.HIPICO_GATE_ANDROID),
  evidence,
  browserMatrix: status(process.env.HIPICO_GATE_MATRIX),
  physicalQa: physicalQaArtifact,
  soak: soakArtifact,
  productionSchema: productionSchemaStatus,
  authRecovery: authRecoveryStatus
};
const codeReviewRequired = ['static', 'postgres', 'restartRecovery', 'browserChromium', 'security', 'android', 'evidence'];
const stableRequired = [...codeReviewRequired, 'browserMatrix', 'physicalQa', 'soak', 'productionSchema', 'authRecovery'];
const codeReviewStatus = aggregate(codeReviewRequired.map((key) => gates[key]));
const stablePromotionStatus = aggregate(stableRequired.map((key) => gates[key]));
const agentShadowStatus = status(process.env.HIPICO_GATE_AGENT_SHADOW);
const raceContextStatus = status(process.env.HIPICO_GATE_RACE_CONTEXT);
const automationReadiness = deriveAutomationReadiness({
  evidenceStatus: evidence,
  agentShadowStatus,
  raceContextStatus
});
const p0Open = booleanEvidence(process.env.HIPICO_P0_OPEN);
const securityCritical = booleanEvidence(process.env.HIPICO_SECURITY_CRITICAL);
const readinessScore = computeReadinessScore({
  statuses: stableRequired.map((key) => gates[key]),
  p0Open,
  codeReviewStatus,
  securityCritical,
  raceContextVerified: raceContextStatus === 'PASS'
});
const readinessState = deriveProductionReadinessState({
  stablePromotionStatus,
  p0Open,
  securityCritical,
  automationReadiness
});
const blockedInfrastructure = String(process.env.HIPICO_BLOCKER_REASON || '') === 'BLOCKED_INFRASTRUCTURE';
const blockers = stableRequired.filter((key) => gates[key] !== 'PASS').map((key) => ({ gate: key, status: gates[key] }));
if (blockedInfrastructure) blockers.push({ gate: 'ci-runner', status: 'BLOCKED', reason: 'BLOCKED_INFRASTRUCTURE' });
if (p0Open === true) blockers.push({ gate: 'p0', status: 'FAIL', reason: 'P0_OPEN' });
if (p0Open === null) blockers.push({ gate: 'p0-status', status: 'NOT_EXECUTED', reason: 'P0_STATUS_UNKNOWN' });
if (securityCritical === true) blockers.push({ gate: 'security-critical', status: 'FAIL', reason: 'SECURITY_CRITICAL' });
if (securityCritical === null) blockers.push({ gate: 'security-critical-status', status: 'NOT_EXECUTED', reason: 'SECURITY_CRITICAL_STATUS_UNKNOWN' });
if (automationReadiness !== 'VERIFIED') blockers.push({ gate: 'automation-readiness', status: 'NOT_EXECUTED', reason: 'AUTOMATION_NOT_VERIFIED' });

const productionReady = readinessState === 'PASS';

const report = {
  schema: 'hipico-release-report.v290-current',
  sha,
  generatedAt: new Date().toISOString(),
  ticket: 290,
  status: codeReviewStatus,
  codeReviewStatus,
  stablePromotionStatus,
  automationReadiness,
  blockerClassification: blockedInfrastructure ? 'BLOCKED_INFRASTRUCTURE' : null,
  gates: {
    ...gates,
    agentShadow: agentShadowStatus,
    raceContext: raceContextStatus
  },
  blockers,
  evidence: {
    postgresChain: 'v12-v27',
    database: 'isolated-ephemeral',
    loadVolumes: [100, 500, 2000],
    sourceReadOnly: true,
    financialAuthority: false,
    p0Open,
    securityCritical,
    physicalQa: gates.physicalQa,
    physicalQaArtifact,
    soakArtifact,
    productionSchemaJob,
    productionSchemaArtifact,
    authRecoveryJob,
    authRecoveryArtifact
  },
  readiness: {
    score: readinessScore.score,
    appliedCaps: readinessScore.appliedCaps,
    passedStableGates: readinessScore.passed,
    totalStableGates: readinessScore.total,
    productionReady,
    state: readinessState,
    automationReadiness,
    note: productionReady
      ? 'All required code, browser matrix, security, Android, evidence, production schema, auth recovery, physical QA, soak, P0/security status and automation validation gates are PASS on this exact SHA.'
      : 'Stable promotion remains blocked until every required gate, including physical QA, >=24h soak, production schema and auth recovery verification, is PASS on this exact SHA and P0/security/automation readiness evidence is explicit.'
  }
};

await fs.mkdir(outputRoot, { recursive: true });
await fs.writeFile(path.join(outputRoot, 'release-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await fs.writeFile(path.join(outputRoot, 'release-report.md'), `# Control Hípico — Release report #290\n\n- SHA: \`${sha}\`\n- Code review: **${codeReviewStatus}**\n- Stable promotion: **${stablePromotionStatus}**\n- Production readiness: **${readinessState}**\n- Automation readiness: **${automationReadiness}**\n- Readiness score: **${readinessScore.score}/100**\n- PostgreSQL chain: **v12-v27**\n- Infra: **${blockedInfrastructure ? 'BLOCKED_INFRASTRUCTURE' : 'N/A'}**\n\n## Applied caps\n${readinessScore.appliedCaps.length ? readinessScore.appliedCaps.map((item) => `- max ${item.max}: ${item.reason}`).join('\n') : '- Ninguno.'}\n\n## Gates\n${Object.entries(report.gates).map(([name, value]) => `- ${name}: **${value}**`).join('\n')}\n\n## Blockers\n${blockers.length ? blockers.map((item) => `- ${item.gate}: **${item.status}**${item.reason ? ` — ${item.reason}` : ''}`).join('\n') : '- Ninguno.'}\n`, 'utf8');
console.log(`[hipico-v290] release report sha=${sha} codeReview=${codeReviewStatus} stable=${stablePromotionStatus} readiness=${readinessState} automation=${automationReadiness} score=${readinessScore.score}`);
if (codeReviewStatus !== 'PASS') process.exitCode = 1;
