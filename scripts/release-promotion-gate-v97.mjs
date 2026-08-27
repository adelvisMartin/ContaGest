import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const reportPath = resolve(process.env.CG_RELEASE_PROMOTION_REPORT || 'artifacts/release/promotion-v97.json');
const results = [];

function readJson(path) {
  try { return JSON.parse(readFileSync(resolve(path), 'utf8')); } catch { return null; }
}

function run(id, command, args, classify) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false, env: process.env });
  const rawCode = Number.isInteger(result.status) ? result.status : null;
  const outcome = classify ? classify(rawCode, result.error) : (result.error ? 'BLOCKED' : rawCode === 0 ? 'PASS' : 'FAIL');
  const row = { id, outcome, exitCode: rawCode, durationMs: Date.now() - started, error: result.error?.message || null };
  results.push(row);
  return row;
}

const legal = run('legal-production', npm, ['run', 'qa:legal:production'], (code, error) => {
  if (error) return 'BLOCKED';
  const evidence = readJson('artifacts/qa/legal-production-gate.json');
  if (evidence?.verdict === 'BLOCKED') return 'BLOCKED';
  return code === 0 ? 'PASS' : 'FAIL';
});

const governance = run('main-governance-live', process.execPath, ['scripts/verify-main-protection-v97.mjs'], (code, error) => {
  if (error) return 'BLOCKED';
  const evidence = readJson('artifacts/release/governance-v97.json');
  if (['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED'].includes(evidence?.status)) return evidence.status;
  return code === 0 ? 'PASS' : code === 2 ? 'BLOCKED' : 'FAIL';
});

if (legal.outcome === 'PASS' && governance.outcome === 'PASS') {
  run('production-readiness-full', process.execPath, ['scripts/production-readiness.mjs', '--full'], (code, error) => {
    if (error) return 'BLOCKED';
    const evidence = readJson('artifacts/qa/production-readiness.json');
    if (evidence?.verdict === 'BLOCKED') return 'BLOCKED';
    return code === 0 ? 'PASS' : 'FAIL';
  });
} else {
  results.push({
    id: 'production-readiness-full',
    outcome: 'NOT_EXECUTED',
    exitCode: null,
    durationMs: 0,
    error: 'Critical legal/governance gate is not PASS; expensive release QA was not started.',
  });
}

const hasFail = results.some((item) => item.outcome === 'FAIL');
const hasBlocked = results.some((item) => ['BLOCKED', 'NOT_EXECUTED'].includes(item.outcome));
const status = hasFail ? 'FAIL' : hasBlocked ? 'BLOCKED' : 'PASS';
const governanceEvidence = readJson('artifacts/release/governance-v97.json');
const report = {
  schemaVersion: 1,
  issue: 97,
  status,
  candidateSha: process.env.GITHUB_SHA || null,
  checkedAt: new Date().toISOString(),
  mainProtection: governanceEvidence ? {
    status: governanceEvidence.status,
    branchProtected: governanceEvidence.branchProtected,
    requiredStatusChecks: governanceEvidence.requiredStatusChecks || [],
  } : null,
  results,
  note: 'PASS is a promotion gate, not a deploy action. This script never merges, deploys or changes branch protection.',
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const md = [
  '# ContaGest release promotion gate · #97',
  '',
  `Status: **${status}**`,
  '',
  '| Gate | Outcome | Exit |',
  '|---|---|---:|',
  ...results.map((item) => `| ${item.id} | **${item.outcome}** | ${item.exitCode ?? '—'} |`),
  '',
  'This gate never merges, deploys or mutates GitHub branch protection.',
  '',
].join('\n');
writeFileSync(reportPath.replace(/\.json$/i, '.md'), md, 'utf8');
console.log(`[release-promotion-v97] ${status}`);
process.exitCode = status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 2;
