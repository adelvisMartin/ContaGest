import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { evaluateExactCandidate, inspectExactCandidate } from '../scripts/hipico-exact-sha-gate.mjs';

const sha='a'.repeat(40);

test('exact-SHA gate accepts only a clean 40-hex candidate',()=>{
  assert.equal(evaluateExactCandidate({sha,dirty:false}).ok,true);
  assert.equal(evaluateExactCandidate({sha:'not-a-sha',dirty:false}).reason,'HIPICO_CANDIDATE_SHA_UNAVAILABLE');
  assert.equal(evaluateExactCandidate({sha,dirty:true}).reason,'HIPICO_CANDIDATE_WORKTREE_DIRTY');
});

test('exact-SHA gate binds an explicitly requested candidate and rejects drift',()=>{
  assert.equal(evaluateExactCandidate({sha,expectedSha:sha.toUpperCase()}).ok,true);
  assert.equal(evaluateExactCandidate({sha,expectedSha:'b'.repeat(40)}).reason,'HIPICO_CANDIDATE_SHA_MISMATCH');
  assert.equal(evaluateExactCandidate({sha,expectedSha:'candidate'}).reason,'HIPICO_EXPECTED_SHA_INVALID');
});

test('exact-SHA inspection detects uncommitted files without deleting or cleaning them',()=>{
  const repo=mkdtempSync(join(tmpdir(),'hipico-exact-sha '));
  execFileSync('git',['init'],{cwd:repo,stdio:'ignore'});
  execFileSync('git',['config','user.email','qa@local.invalid'],{cwd:repo});
  execFileSync('git',['config','user.name','QA'],{cwd:repo});
  writeFileSync(join(repo,'tracked.txt'),'baseline\n','utf8');
  execFileSync('git',['add','tracked.txt'],{cwd:repo});
  execFileSync('git',['commit','-m','baseline'],{cwd:repo,stdio:'ignore'});

  const clean=inspectExactCandidate(repo,{});
  assert.equal(clean.ok,true);
  assert.match(clean.candidate,/^[0-9a-f]{40}$/);

  writeFileSync(join(repo,'keep-me.txt'),'do not delete\n','utf8');
  const dirty=inspectExactCandidate(repo,{});
  assert.equal(dirty.ok,false);
  assert.equal(dirty.reason,'HIPICO_CANDIDATE_WORKTREE_DIRTY');
  assert.equal(dirty.dirtyEntryCount,1);
});
