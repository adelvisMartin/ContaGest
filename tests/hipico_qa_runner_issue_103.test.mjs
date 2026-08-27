import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  EVIDENCE_STATES,
  captureGitMetadata,
  classifyFailure,
  redact,
  runProcess,
  sha256File,
} from '../scripts/hipico-qa-runner-v103.mjs';

test('issue #103 only exposes exact evidence states', () => {
  assert.deepEqual(EVIDENCE_STATES, ['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED']);
});

test('issue #103 deliberately broken command is FAIL with non-zero exit', () => {
  const result = runProcess(process.execPath, ['-e', 'process.exit(19)']);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 19);
});

test('issue #103 missing tool is BLOCKED and never PASS', () => {
  const result = runProcess(`hipico-tool-that-does-not-exist-${Date.now()}`, []);
  assert.equal(result.status, 'BLOCKED');
  assert.notEqual(result.status, 'PASS');
});

test('issue #103 recognizes external network/toolchain blockers', () => {
  assert.equal(classifyFailure('npm ERR! code EAI_AGAIN'), 'BLOCKED');
  assert.equal(classifyFailure('Android SDK was not found'), 'BLOCKED');
  assert.equal(classifyFailure('AssertionError: expected 2 but got 3'), 'FAIL');
});

test('issue #103 redacts tokens, Venezuelan phones and full WhatsApp group IDs', () => {
  const raw = [
    'Authorization: Bearer abcdefghijklmnop.0123456789',
    'HIPICO_OPERATOR_TOKEN=super-secret-token',
    'contacto +58 412 555 0199',
    'group 120363123456789-987654321@g.us',
  ].join('\n');
  const safe = redact(raw);
  assert.doesNotMatch(safe, /super-secret-token/);
  assert.doesNotMatch(safe, /412\s*555\s*0199/);
  assert.doesNotMatch(safe, /120363123456789-987654321@g\.us/);
  assert.match(safe, /REDACTED/);
});

test('issue #103 captures SHA/branch/dirty state without cleaning a path with spaces', () => {
  const repo = mkdtempSync(join(tmpdir(), 'hipico qa path with spaces '));
  execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'qa@local.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'QA'], { cwd: repo });
  writeFileSync(join(repo, 'tracked.txt'), 'baseline\n', 'utf8');
  execFileSync('git', ['add', 'tracked.txt'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'baseline'], { cwd: repo, stdio: 'ignore' });

  const clean = captureGitMetadata(repo);
  assert.match(clean.sha, /^[0-9a-f]{40}$/);
  assert.equal(clean.dirty, false);

  writeFileSync(join(repo, 'untracked.txt'), 'keep me\n', 'utf8');
  const dirty = captureGitMetadata(repo);
  assert.equal(dirty.sha, clean.sha);
  assert.equal(dirty.dirty, true);
  assert.equal(readFileSync(join(repo, 'untracked.txt'), 'utf8'), 'keep me\n');
});

test('issue #103 SHA-256 evidence is deterministic across repeated reads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hipico repeat '));
  mkdirSync(join(dir, 'nested'));
  const file = join(dir, 'nested', 'artifact.txt');
  writeFileSync(file, 'same candidate evidence\n', 'utf8');
  const first = sha256File(file);
  const second = sha256File(file);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});
