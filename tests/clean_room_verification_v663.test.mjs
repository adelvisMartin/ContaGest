import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertCandidate, buildCleanRoomPlan, cleanRoomEnvironment, executeStages, parseCli, runCleanRoom } from '../scripts/clean-room-verification-v663.mjs';

function fixture(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cg663-fixture-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-b', 'main');
    git('config', 'user.email', 'qa@example.invalid');
    git('config', 'user.name', 'QA');
    writeFileSync(path.join(dir, 'fixture.txt'), 'baseline\n');
    git('add', '.');
    git('commit', '-m', 'fixture');
    return fn({ dir, sha: git('rev-parse', 'HEAD'), git });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('#663 requires exact SHA, clean root checkout and rejects dirty worktree', () => fixture(({ dir, sha }) => {
  assert.equal(assertCandidate({ cwd: dir, expectedSha: sha }), sha);
  assert.throws(() => assertCandidate({ cwd: dir, expectedSha: 'a'.repeat(40) }), /SHA_MISMATCH/);
  writeFileSync(path.join(dir, 'rogue.txt'), 'untracked');
  assert.throws(() => assertCandidate({ cwd: dir, expectedSha: sha }), /SOURCE_DIRTY/);
}));

test('#663 environment strips provider credentials and remote DB URLs', () => {
  const env = cleanRoomEnvironment({ PATH: '/bin', DATABASE_URL: 'postgresql://admin:secret@remote.example/prod', GITHUB_TOKEN: 'secret', QA_BASE_URL: 'https://remote.example', LOCAL_VERIFY_DATABASE_ADMIN_URL: 'postgresql://local:pw@127.0.0.1:5432/postgres' });
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.QA_BASE_URL, undefined);
  assert.equal(env.CI, '1');
  assert.match(env.LOCAL_VERIFY_DATABASE_ADMIN_URL, /127\.0\.0\.1/);
  assert.throws(() => cleanRoomEnvironment({ LOCAL_VERIFY_DATABASE_ADMIN_URL: 'postgresql://prod.example/db' }), /REMOTE_DATABASE_REJECTED/);
});

test('#663 mandatory plan uses repository npm lock, isolated PG17 bootstrap and Chromium smoke', () => {
  const sha = 'b'.repeat(40), plan = buildCleanRoomPlan(sha);
  assert.deepEqual(plan.map(x => x.id), ['locked-install', 'runner-contracts', 'lint-contracts', 'postgres17-migrations-build-runtime', 'chromium-functional-smoke']);
  assert.deepEqual(plan[0].args.slice(0, 1), ['ci']);
  assert.ok(plan[3].args.includes('--smoke'));
  assert.ok(plan[3].args.includes(sha));
  assert.throws(() => buildCleanRoomPlan('bad'), /EXPECTED_SHA_REQUIRED/);
  assert.deepEqual(parseCli(['--expected-sha', sha, '--dry-run']), { expectedSha: sha, dryRun: true });
});

test('#663 fail-closed stages stop on failure, never report unexecuted browser as PASS', () => {
  const calls = [];
  const report = executeStages(buildCleanRoomPlan('c'.repeat(40)), { run: stage => {
    calls.push(stage.id);
    return { status: calls.length === 2 ? 'FAIL' : 'PASS', exitCode: calls.length === 2 ? 4 : 0 };
  } });
  assert.equal(report.status, 'FAIL');
  assert.equal(calls.length, 2);
  assert.equal(report.gates[4].status, 'NOT_EXECUTED');
});

test('#663 own worktree is removed even when runner prerequisite fails', () => fixture(({ dir, sha, git }) => {
  const result = runCleanRoom({ cwd: dir, expectedSha: sha, env: { PATH: process.env.PATH }, run: () => ({ status: 'BLOCKED', exitCode: null }) });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.gates[1].status, 'NOT_EXECUTED');
  assert.equal(git('worktree', 'list', '--porcelain').match(/^worktree /gm)?.length, 1);
  assert.equal(readFileSync(path.join(dir, 'fixture.txt'), 'utf8'), 'baseline\n');
}));

test('#663 newly modified sources cause cleanup and no false PASS', () => fixture(({ dir, sha, git }) => {
  const report = runCleanRoom({ cwd: dir, expectedSha: sha, run: (_stage, { cwd }) => { writeFileSync(path.join(cwd, 'tracked.txt'), 'untracked'); return { status: 'PASS', exitCode: 0 }; } });
  assert.equal(report.status, 'FAIL');
  assert.equal(report.gates[0].reason, 'CHECKOUT_MUTATED_AFTER_STAGE');
  assert.equal(git('worktree', 'list', '--porcelain').match(/^worktree /gm)?.length, 1);
}));

test('#663 rejects fabricated PASS with nonzero exit', () => {
  assert.throws(() => executeStages(buildCleanRoomPlan('d'.repeat(40)), { run: () => ({ status: 'PASS', exitCode: 17 }) }), /INVALID_PASS_EXIT/);
});

test('#663 accepts only the verifier-owned untracked evidence path after a stage', () => fixture(({ dir, sha }) => {
  mkdirSync(path.join(dir, 'artifacts', 'local-verification'), { recursive: true });
  writeFileSync(path.join(dir, 'artifacts', 'local-verification', 'manifest.json'), '{}');
  assert.throws(() => assertCandidate({ cwd: dir, expectedSha: sha }), /SOURCE_DIRTY/);
  assert.equal(assertCandidate({ cwd: dir, expectedSha: sha, allowEvidenceArtifacts: true }), sha);
  writeFileSync(path.join(dir, 'artifacts', 'suspicious.json'), '{}');
  assert.throws(() => assertCandidate({ cwd: dir, expectedSha: sha, allowEvidenceArtifacts: true }), /SOURCE_DIRTY/);
}));
