import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDefaultHipicoAgentEngine,
  DETERMINISTIC_AGENT_PARSER_VERSION
} from '../src/modules/hipico/agent-engine.js';
import { scoreAdversarialGoldenCorpus } from '../src/modules/hipico/agent-adversarial-golden.js';
import { RISK_POLICY_VERSION } from '../src/modules/hipico/risk-policy.js';

const SHA40 = /^[0-9a-f]{40}$/i;
const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, '..');
const repoRoot = resolve(backendRoot, '..');
const corpusPath = resolve(backendRoot, 'src/modules/hipico/corpus/hipico-agent-adversarial.v10.json');
const artifactPath = resolve(repoRoot, 'artifacts/qa/hipico-v10/golden-adversarial.json');

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true }).trim().toLowerCase();
  } catch {
    return '';
  }
}

function candidateSha() {
  const explicit = String(
    process.env.HIPICO_CANDIDATE_SHA
      || process.env.HIPICO_QA_SHA
      || process.env.GITHUB_SHA
      || ''
  ).trim().toLowerCase();
  const head = gitHead();
  const ci = String(process.env.GITHUB_ACTIONS || '').toLowerCase() === 'true';
  if (explicit) {
    if (!SHA40.test(explicit)) throw new Error('HIPICO_V10_CANDIDATE_SHA_INVALID');
    if (head && head !== explicit) throw new Error(`HIPICO_V10_CANDIDATE_SHA_MISMATCH:${head}:${explicit}`);
    return explicit;
  }
  if (ci) throw new Error('HIPICO_V10_CANDIDATE_SHA_REQUIRED');
  return SHA40.test(head) ? head : 'local';
}

const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const sha = candidateSha();
const engine = createDefaultHipicoAgentEngine();
const report = await scoreAdversarialGoldenCorpus(corpus, engine);
const versionsMatch = report.parserVersion === DETERMINISTIC_AGENT_PARSER_VERSION
  && report.policyVersion === RISK_POLICY_VERSION;
const financialAuthoritySafe = report.cases.every((entry) => entry.actual.financialAuthority === false);
const passed = report.sanitized === true
  && versionsMatch
  && report.matched === report.total
  && report.unsafeAuto === 0
  && report.highRiskAuto === 0
  && financialAuthoritySafe;

const artifact = {
  schema: 'hipico-golden-adversarial.v10',
  sha,
  status: passed ? 'PASS' : 'FAIL',
  checkedAt: new Date().toISOString(),
  schemaVersion: report.schemaVersion,
  corpusVersion: report.corpusVersion,
  parserVersion: report.parserVersion,
  policyVersion: report.policyVersion,
  signature: report.signature,
  sanitized: report.sanitized,
  total: report.total,
  matched: report.matched,
  accuracy: report.accuracy,
  unsafeAuto: report.unsafeAuto,
  highRiskAuto: report.highRiskAuto,
  financialAuthority: false,
  financialAuthoritySafe,
  versionsMatch,
  byIntent: report.byIntent,
  byCategory: report.byCategory,
  cases: report.cases.map((entry) => ({
    id: entry.id,
    category: entry.category,
    textHash: entry.textHash,
    expected: entry.expected,
    actual: entry.actual,
    matched: entry.matched,
    unsafeAuto: entry.unsafeAuto,
    highRiskAuto: entry.highRiskAuto
  }))
};

mkdirSync(path.dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(`[hipico-v10] golden ${artifact.status} sha=${sha} matched=${report.matched}/${report.total} unsafeAuto=${report.unsafeAuto} highRiskAuto=${report.highRiskAuto}`);
if (!passed) process.exitCode = 1;
