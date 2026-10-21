import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSecurityClosureCheckout } from '../scripts/security-closure-checkout-v651.mjs';

function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}
function withRepository(fn) {
  const root = mkdtempSync(join(tmpdir(), 'sec651-checkout-'));
  try {
    git(root, 'init', '-q');
    writeFileSync(join(root, 'tracked.txt'), 'baseline\n');
    git(root, 'add', 'tracked.txt');
    git(root, '-c', 'user.name=Security Test', '-c', 'user.email=security@example.invalid', 'commit', '-qm', 'baseline');
    return fn(root, git(root, 'rev-parse', 'HEAD'));
  } finally { rmSync(root, {recursive: true, force: true}); }
}

test('accepts only the actual HEAD of a clean checkout', () => withRepository((root, sha) => {
  assert.equal(assertSecurityClosureCheckout(sha, root), sha);
  // Offline evidence is deliberately untracked/ignored, not part of the committed tree.
  mkdirSync(join(root, 'artifacts'));
  writeFileSync(join(root, 'artifacts', 'proof.json'), '{}');
  assert.equal(assertSecurityClosureCheckout(sha, root), sha);
}));

test('rejects a stale but well-formed candidate SHA', () => withRepository((root, sha) => {
  const alternate = sha[0] === 'a' ? 'b'.repeat(40) : 'a'.repeat(40);
  assert.throws(() => assertSecurityClosureCheckout(alternate, root), /SEC651_CANDIDATE_HEAD_MISMATCH/);
}));

test('rejects modifications to tracked files even with the correct HEAD', () => withRepository((root, sha) => {
  writeFileSync(join(root, 'tracked.txt'), 'changed without commit\n');
  assert.throws(() => assertSecurityClosureCheckout(sha, root), /SEC651_TRACKED_CHECKOUT_DIRTY/);
  git(root, 'add', 'tracked.txt');
  assert.throws(() => assertSecurityClosureCheckout(sha, root), /SEC651_TRACKED_CHECKOUT_DIRTY/);
}));

test('rejects a Git worktree root mismatch', () => withRepository((root, sha) => {
  const nested = join(root, 'nested');
  mkdirSync(nested);
  assert.throws(() => assertSecurityClosureCheckout(sha, nested), /SEC651_CHECKOUT_ROOT_MISMATCH/);
}));

test('rejects invalid SHAs and missing checkouts fail closed', () => withRepository((root) => {
  assert.throws(() => assertSecurityClosureCheckout('invalid', root), /SEC651_CANDIDATE_SHA_INVALID/);
  const absent = join(root, 'absent');
  assert.throws(() => assertSecurityClosureCheckout('a'.repeat(40), absent), /SEC651_CHECKOUT_UNAVAILABLE/);
}));

test('rejects an unavailable Git executable', () => withRepository((root, sha) => {
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = '';
    assert.throws(() => assertSecurityClosureCheckout(sha, root), /SEC651_CHECKOUT_UNAVAILABLE/);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  }
}));
