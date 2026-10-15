#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/i;
const SAFE_ENV_KEYS = ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'LOCAL_VERIFY_DATABASE_ADMIN_URL'];

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function assertCandidate({ cwd, expectedSha, gitCommand = git, allowEvidenceArtifacts = false }) {
  if (!SHA.test(expectedSha || '')) throw new Error('CLEANROOM_EXPECTED_SHA_REQUIRED');
  const gitRoot = path.resolve(gitCommand(cwd, ['rev-parse', '--show-toplevel']));
  const requestedRoot = path.resolve(cwd);
  if ((process.platform === 'win32' ? gitRoot.toLowerCase() : gitRoot) !== (process.platform === 'win32' ? requestedRoot.toLowerCase() : requestedRoot)) throw new Error('CLEANROOM_ROOT_REQUIRED');
  const actual = gitCommand(cwd, ['rev-parse', 'HEAD']);
  if (actual !== expectedSha) throw new Error('CLEANROOM_SHA_MISMATCH');
  const changes = gitCommand(cwd, ['status', '--porcelain', '--untracked-files=all']).split(/\r?\n/).filter(Boolean);
  const allow = /^\?\? artifacts\/(?:local-verification|browser-matrix)\//;
  if (changes.some((change) => !allowEvidenceArtifacts || !allow.test(change))) throw new Error('CLEANROOM_SOURCE_DIRTY');
  return actual;
}

export function cleanRoomEnvironment(input = process.env) {
  const clean = Object.fromEntries(SAFE_ENV_KEYS.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
  if (clean.LOCAL_VERIFY_DATABASE_ADMIN_URL) {
    let database;
    try { database = new URL(clean.LOCAL_VERIFY_DATABASE_ADMIN_URL); }
    catch { throw new Error('CLEANROOM_DATABASE_URL_INVALID'); }
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)) {
      throw new Error('CLEANROOM_REMOTE_DATABASE_REJECTED');
    }
  }
  clean.CI = '1';
  clean.PLAYWRIGHT_HTML_OPEN = 'never';
  clean.npm_config_audit = 'false';
  return clean;
}

export function buildCleanRoomPlan(expectedSha) {
  if (!SHA.test(expectedSha || '')) throw new Error('CLEANROOM_EXPECTED_SHA_REQUIRED');
  return [
    { id: 'locked-install', command: 'npm', args: ['ci', '--no-audit', '--no-fund'] },
    { id: 'runner-contracts', command: 'npm', args: ['run', 'test:verify:local'] },
    { id: 'lint-contracts', command: 'npm', args: ['run', 'lint'] },
    { id: 'postgres17-migrations-build-runtime', command: 'node', args: ['scripts/zero-cost-bootstrap-v668.mjs', '--smoke', '--expected-sha', expectedSha] },
    { id: 'chromium-functional-smoke', command: 'npm', args: ['run', 'test:browser:functional'] },
  ];
}

function invokeStage(stage, { cwd, env }) {
  const isWindowsNpm = process.platform === 'win32' && stage.command === 'npm';
  const command = isWindowsNpm ? (env.COMSPEC || 'cmd.exe') : stage.command;
  // All CLI arguments are fixed by buildCleanRoomPlan or a validated 40-char hex SHA.
  const args = isWindowsNpm ? ['/d', '/s', '/c', 'npm.cmd ' + stage.args.join(' ')] : stage.args;
  const outcome = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: false, windowsHide: true });
  if (outcome.error) return { status: 'BLOCKED', exitCode: null, reason: 'MISSING_EXECUTABLE_OR_PREREQUISITE' };
  return { status: outcome.status === 0 ? 'PASS' : 'FAIL', exitCode: outcome.status ?? 1 };
}

export function executeStages(plan, { run = invokeStage, cwd, env, afterStage = () => {} } = {}) {
  const gates = [];
  let previousFailed = false;
  for (const stage of plan) {
    if (previousFailed) {
      gates.push({ ...stage, status: 'NOT_EXECUTED', exitCode: null });
      continue;
    }
    const started = Date.now();
    let result;
    try { result = run(stage, { cwd, env }); }
    catch { result = { status: 'BLOCKED', exitCode: null, reason: 'STAGE_EXECUTION_EXCEPTION' }; }
    if (!['PASS', 'FAIL', 'BLOCKED'].includes(result?.status)) throw new Error('CLEANROOM_INVALID_GATE_STATUS');
    if (result.status === 'PASS' && result.exitCode !== 0) throw new Error('CLEANROOM_INVALID_PASS_EXIT');
    gates.push({ ...stage, status: result.status, exitCode: result.exitCode ?? null, durationMs: Date.now() - started, ...(result.reason ? { reason: result.reason } : {}) });
    previousFailed = result.status !== 'PASS';
    if (!previousFailed) {
      try { afterStage(stage); }
      catch { gates[gates.length - 1] = { ...gates[gates.length - 1], status: 'FAIL', reason: 'CHECKOUT_MUTATED_AFTER_STAGE' }; previousFailed = true; }
    }
  }
  return { status: gates.find((gate) => gate.status === 'FAIL') ? 'FAIL' : gates.find((gate) => gate.status === 'BLOCKED') ? 'BLOCKED' : 'PASS', gates };
}

export function runCleanRoom({ cwd = process.cwd(), expectedSha, env = process.env, run = invokeStage } = {}) {
  const root = path.resolve(cwd);
  assertCandidate({ cwd: root, expectedSha });
  const isolatedEnv = cleanRoomEnvironment(env);
  const parent = mkdtempSync(path.join(os.tmpdir(), 'contagest-cleanroom-'));
  const checkout = path.join(parent, 'checkout');
  let added = false;
  try {
    execFileSync('git', ['worktree', 'add', '--detach', checkout, expectedSha], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    added = true;
    assertCandidate({ cwd: checkout, expectedSha });
    const result = executeStages(buildCleanRoomPlan(expectedSha), {
      run, cwd: checkout, env: isolatedEnv,
      afterStage: () => assertCandidate({ cwd: checkout, expectedSha, allowEvidenceArtifacts: true }),
    });
    return { schemaVersion: 663, candidateSha: expectedSha, status: result.status, checkout: 'TEMPORARY_REMOVED', gates: result.gates, remote: { ci: 'NOT_EXECUTED', deploy: 'NOT_EXECUTED' } };
  } finally {
    if (added) {
      try { execFileSync('git', ['worktree', 'remove', '--force', checkout], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }); }
      finally { rmSync(parent, { recursive: true, force: true }); }
    } else rmSync(parent, { recursive: true, force: true });
  }
}

export function parseCli(argv) {
  const opts = { expectedSha: '', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--expected-sha') opts.expectedSha = argv[++i] || '';
    else if (argv[i] === '--dry-run') opts.dryRun = true;
    else throw new Error('CLEANROOM_ARGUMENT_UNKNOWN');
  }
  if (!SHA.test(opts.expectedSha)) throw new Error('CLEANROOM_EXPECTED_SHA_REQUIRED');
  return opts;
}

function main() {
  const opts = parseCli(process.argv.slice(2));
  assertCandidate({ cwd: process.cwd(), expectedSha: opts.expectedSha });
  const report = opts.dryRun
    ? { schemaVersion: 663, candidateSha: opts.expectedSha, status: 'NOT_EXECUTED', gates: buildCleanRoomPlan(opts.expectedSha).map((gate) => ({ ...gate, status: 'NOT_EXECUTED' })), remote: { ci: 'NOT_EXECUTED', deploy: 'NOT_EXECUTED' } }
    : runCleanRoom({ expectedSha: opts.expectedSha });
  const target = path.join(process.cwd(), 'artifacts', 'qa', 'clean-room-v663', opts.expectedSha, 'manifest.json');
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, candidateSha: opts.expectedSha, manifest: path.relative(process.cwd(), target) }));
  if (report.status !== 'PASS' && report.status !== 'NOT_EXECUTED') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch (error) { console.error('[cleanroom-v663]', error?.message || 'UNKNOWN_ERROR'); process.exitCode = 1; }
}
