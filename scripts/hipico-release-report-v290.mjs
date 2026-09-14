import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

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
const gates = {
  static: status(process.env.HIPICO_GATE_STATIC),
  postgres: status(process.env.HIPICO_GATE_POSTGRES),
  restartRecovery: status(process.env.HIPICO_GATE_RESTART),
  browserChromium: status(process.env.HIPICO_GATE_CHROMIUM),
  security: status(process.env.HIPICO_GATE_SECURITY),
  android: status(process.env.HIPICO_GATE_ANDROID),
  evidence,
  browserMatrix: status(process.env.HIPICO_GATE_MATRIX),
  physicalQa: status(process.env.HIPICO_GATE_PHYSICAL_QA)
};
const codeReviewRequired = ['static', 'postgres', 'restartRecovery', 'browserChromium', 'security', 'android', 'evidence'];
const stableRequired = [...codeReviewRequired, 'browserMatrix', 'physicalQa'];
const codeReviewStatus = aggregate(codeReviewRequired.map((key) => gates[key]));
const stablePromotionStatus = aggregate(stableRequired.map((key) => gates[key]));
const blockedInfrastructure = String(process.env.HIPICO_BLOCKER_REASON || '') === 'BLOCKED_INFRASTRUCTURE';
const blockers = stableRequired.filter((key) => gates[key] !== 'PASS').map((key) => ({ gate: key, status: gates[key] }));
if (blockedInfrastructure) blockers.push({ gate: 'ci-runner', status: 'BLOCKED', reason: 'BLOCKED_INFRASTRUCTURE' });

const report = {
  schema: 'hipico-release-report.v290-current',
  sha,
  generatedAt: new Date().toISOString(),
  ticket: 290,
  status: codeReviewStatus,
  codeReviewStatus,
  stablePromotionStatus,
  blockerClassification: blockedInfrastructure ? 'BLOCKED_INFRASTRUCTURE' : null,
  gates,
  blockers,
  evidence: {
    postgresChain: 'v12-v22',
    database: 'isolated-ephemeral',
    loadVolumes: [100, 500, 2000],
    sourceReadOnly: true,
    financialAuthority: false,
    physicalQa: gates.physicalQa
  },
  readiness: {
    productionReady: stablePromotionStatus === 'PASS',
    state: stablePromotionStatus,
    note: stablePromotionStatus === 'PASS'
      ? 'All required code, browser matrix, security, Android, evidence and physical QA gates are PASS on this exact SHA.'
      : 'Stable promotion remains blocked until every required gate is PASS on this exact SHA.'
  }
};

await fs.mkdir(outputRoot, { recursive: true });
await fs.writeFile(path.join(outputRoot, 'release-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await fs.writeFile(path.join(outputRoot, 'release-report.md'), `# Control Hípico — Release report #290\n\n- SHA: \`${sha}\`\n- Code review: **${codeReviewStatus}**\n- Stable promotion: **${stablePromotionStatus}**\n- PostgreSQL chain: **v12-v22**\n- Infra: **${blockedInfrastructure ? 'BLOCKED_INFRASTRUCTURE' : 'N/A'}**\n\n## Gates\n${Object.entries(gates).map(([name, value]) => `- ${name}: **${value}**`).join('\n')}\n\n## Blockers\n${blockers.length ? blockers.map((item) => `- ${item.gate}: **${item.status}**${item.reason ? ` — ${item.reason}` : ''}`).join('\n') : '- Ninguno.'}\n`, 'utf8');
console.log(`[hipico-v290] release report sha=${sha} codeReview=${codeReviewStatus} stable=${stablePromotionStatus}`);
if (codeReviewStatus !== 'PASS') process.exitCode = 1;
