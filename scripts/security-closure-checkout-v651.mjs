import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

const SHA = /^[a-f0-9]{40}$/i;
const fail = code => { throw new Error(`SEC651_${code}`); };
const git = (cwd, ...args) => execFileSync('git', args, {
  cwd, encoding: 'utf8', timeout: 8_000, maxBuffer: 16_384,
  stdio: ['ignore', 'pipe', 'ignore']
}).trim();

/** Refuse claims for a different revision or a modified tracked checkout. */
export function assertSecurityClosureCheckout(candidateSha, repoRoot) {
  if (typeof candidateSha !== 'string' || !SHA.test(candidateSha)) fail('CANDIDATE_SHA_INVALID');
  let head, top, trackedStatus;
  try {
    const root = realpathSync(resolve(repoRoot));
    top = realpathSync(resolve(git(root, 'rev-parse', '--show-toplevel')));
    head = git(root, 'rev-parse', '--verify', 'HEAD');
    trackedStatus = git(root, 'status', '--porcelain=v1', '--untracked-files=no');
    if (root !== top) fail('CHECKOUT_ROOT_MISMATCH');
  } catch (error) {
    if (error?.message?.startsWith('SEC651_')) throw error;
    fail('CHECKOUT_UNAVAILABLE');
  }
  if (!SHA.test(head) || head.toLowerCase() !== candidateSha.toLowerCase()) fail('CANDIDATE_HEAD_MISMATCH');
  if (trackedStatus) fail('TRACKED_CHECKOUT_DIRTY');
  return head;
}
