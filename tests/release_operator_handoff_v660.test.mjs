import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  assertCleanHead, collectLocalEvidence, EVIDENCE_DIMENSIONS, makeHandoff,
  manifestDigest, renderHandoff, runCli, validateOperatorPlan,
} from './release-operator-handoff-v660.mjs';

const SHA = 'a'.repeat(40);
const PLAN = {
  schemaVersion: 660,
  contexts: [
    { id: 'platform', authority: 'AGENTS.md', issues: [624] },
    { id: 'finance', authority: 'docs/finance.md', issues: [643] },
    { id: 'operations', authority: 'docs/ops.md', issues: [660] },
  ],
  steps: [
    { id: 'preflight', context: 'platform', mode: 'READ_ONLY', runbook: 'docs/ops.md', commands: ['git rev-parse HEAD'] },
    { id: 'qa', context: 'operations', mode: 'QA_ISOLATED', runbook: 'docs/ops.md', commands: ['npm run verify:local -- --expected-sha <SHA>'] },
    { id: 'backup', context: 'operations', mode: 'OPERATOR_APPROVAL', runbook: 'docs/ops.md', commands: ['npm run test:hipico:backup-preflight'] },
    { id: 'migrate', context: 'finance', mode: 'OPERATOR_APPROVAL', runbook: 'docs/finance.md', commands: ['npm --workspace backend run prisma:deploy'] },
    { id: 'build', context: 'platform', mode: 'QA_ISOLATED', runbook: 'docs/ops.md', commands: ['npm run build'] },
  ],
};
function temporary(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cg660-'));
  try { return fn(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function put(root, relative, content) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
function sampleManifest(root, { profile = 'backend', candidateSha = SHA, tamper = false, missingLog = false } = {}) {
  const rel = `artifacts/local-verification/${SHA}/${profile}/manifest.json`;
  const logRel = `artifacts/local-verification/${SHA}/${profile}/logs/build.log`;
  if (!missingLog) put(root, logRel, 'fixture output');
  const item = {
    candidateSha, profile, status: 'PASS', platform: { node: 'v22.16.0', os: 'linux x64', SECRET: 'SHOULD_NOT_LEAK' },
    gates: [{ id: 'backend-build', status: 'PASS', command: 'npm run build:backend', required: true, logPath: path.join(root, logRel) }],
    finishedAt: '2026-10-14T12:00:00Z',
  };
  item.manifestSha256 = manifestDigest(item);
  if (tamper) item.gates[0].command = 'npm run fake:success';
  put(root, rel, JSON.stringify(item));
  return rel;
}

test('handoff has safe default NOT_READY and no imaginary PASS', () => {
  const result = makeHandoff({ candidateSha: SHA, plan: PLAN });
  assert.equal(result.releaseDecision, 'NOT_READY');
  assert.equal(result.reviewStatus, 'NOT_EXECUTED');
  assert.deepEqual(Object.keys(result.dimensions), EVIDENCE_DIMENSIONS);
  assert.ok(Object.values(result.dimensions).every(v => v.status === 'NOT_EXECUTED'));
  assert.match(renderHandoff(result), /rollback/i);
  assert.match(renderHandoff(result), /NOT_READY/);
  assert.ok(renderHandoff(result).includes(SHA));
});

test('real SHA scoped runner manifest with digest, executed gate and log qualifies only its dimension', () => temporary(root => {
  sampleManifest(root);
  const evidence = collectLocalEvidence({ root, candidateSha: SHA });
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].status, 'PASS');
  const result = makeHandoff({ candidateSha: SHA, plan: PLAN, localEvidence: evidence });
  assert.equal(result.dimensions.LOCAL_BUILD.status, 'PASS');
  assert.equal(result.dimensions.LOCAL_POSTGRES.status, 'NOT_EXECUTED');
  assert.equal(result.dimensions.REMOTE_CI.status, 'NOT_EXECUTED');
  assert.equal(result.releaseDecision, 'NOT_READY');
  assert.doesNotMatch(JSON.stringify(result), /SHOULD_NOT_LEAK/);
}));

test('stale SHA, tampered digest or missing log cannot produce PASS', () => temporary(root => {
  const rel = sampleManifest(root, { candidateSha: 'b'.repeat(40) });
  assert.equal(collectLocalEvidence({ root, candidateSha: SHA })[0].reason, 'SHA_MISMATCH');
  sampleManifest(root, { tamper: true });
  assert.equal(collectLocalEvidence({ root, candidateSha: SHA })[0].reason, 'DIGEST_MISMATCH');
  fs.unlinkSync(path.join(root, 'artifacts/local-verification', SHA, 'backend/logs/build.log'));
  const evidence = collectLocalEvidence({ root, candidateSha: SHA });
  assert.equal(evidence[0].reason, 'DIGEST_MISMATCH');
  sampleManifest(root, { missingLog: true });
  assert.equal(collectLocalEvidence({ root, candidateSha: SHA })[0].reason, 'GATE_EVIDENCE_INCOMPLETE');
  assert.ok(rel.endsWith('manifest.json'));
}));

test('runtime builder rejects forged PASS and source paths outside authority', () => {
  assert.throws(() => makeHandoff({ candidateSha: SHA, plan: PLAN, localEvidence: [
    { profile: 'backend', status: 'PASS', artifact: `artifacts/local-verification/${SHA}/backend/manifest.json`, dimensions: ['LOCAL_BUILD'] },
  ] }), /HANDOFF_PASS_UNVERIFIED/);
  const invalid = structuredClone(PLAN);
  invalid.steps[0].runbook = '../secrets.env';
  assert.throws(() => validateOperatorPlan(invalid), /HANDOFF_RUNBOOK_MISSING/);
  const duplicate = structuredClone(PLAN);
  duplicate.steps[1].id = duplicate.steps[0].id;
  assert.throws(() => validateOperatorPlan(duplicate), /HANDOFF_STEP_ID_INVALID/);
});

test('exact Git HEAD and clean working-tree required for CLI; outputs review artifacts only', () => temporary(root => {
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
  git('init', '-b', 'main');
  git('config', 'user.email', 'qa@example.invalid');
  git('config', 'user.name', 'QA');
  put(root, '.gitignore', 'artifacts/\n');
  put(root, 'config/release-operator-handoff-v660.json', JSON.stringify(PLAN));
  for (const p of ['AGENTS.md', 'docs/finance.md', 'docs/ops.md']) put(root, p, '# Fixture');
  git('add', '.');
  git('commit', '-m', 'fixture baseline');
  const sha = git('rev-parse', 'HEAD');
  assert.throws(() => assertCleanHead(root, SHA), /HANDOFF_SHA_MISMATCH/);
  assert.equal(assertCleanHead(root, sha), sha);
  const { report, files } = runCli({ root, argv: ['--sha', sha] });
  assert.equal(report.candidateSha, sha);
  assert.equal(report.releaseDecision, 'NOT_READY');
  assert.ok(fs.existsSync(path.join(root, files.json)));
  assert.ok(fs.existsSync(path.join(root, files.markdown)));
  assert.equal(assertCleanHead(root, sha), sha);
  put(root, 'README.md', '# uncommitted');
  assert.throws(() => assertCleanHead(root, sha), /HANDOFF_WORKTREE_DIRTY/);
}));