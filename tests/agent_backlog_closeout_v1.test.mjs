import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateBacklogCloseout } from '../scripts/agent-backlog-closeout-lib.mjs';

const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const issues = Array.from({ length: 19 }, (_, i) => ({ number: i + 637,
  title: `[EPIC] [P1] Owner ${i + 637}`, state: 'open' }));
const success = name => ({ name, status: 'completed', conclusion: 'success', headSha: sha });
const pr = changes => ({ number: 1341, title: 'fix(finance #637)', state: 'open',
  headSha: sha, baseSha: sha, mergeable: true, mergeableState: 'clean',
  checks: [success('tests')], ...changes });
const input = changes => ({ mainSha: sha, issues, prs: [pr()],
  requiredCheckPolicy: { status: 'VERIFIED', names: ['tests'] }, ...changes });

test('19 real owners fit target without deleting or auto-closing their epic criteria', () => {
  const result = evaluateBacklogCloseout(input());
  assert.equal(result.issueCount, 19);
  assert.equal(result.source, 'EVALUATED_SNAPSHOT_NOT_LIVE_PROOF');
  assert.equal(result.targetBand.inBand, true);
  assert.equal(result.targetBand.automaticIssueClosure, false);
  assert.ok(result.issues.every(x => x.status === 'OPEN_UNTIL_ACCEPTANCE_VERIFIED'));
  assert.equal(result.prs[0].decision, 'HUMAN_REVIEW_REQUIRED');
  assert.equal(result.noAutoMerge, true);
});

test('Git dirty/blocked and unfinished checks remain blocked even if mergeable is true', () => {
  for (const changes of [
    { mergeable: false, mergeableState: 'dirty' },
    { mergeable: true, mergeableState: 'unstable' },
    { checks: [{ name: 'tests', status: 'in_progress', conclusion: null, headSha: sha }] },
    { checks: [{ name: 'tests', status: 'completed', conclusion: 'failure', headSha: sha }] },
    { checks: [{ name: 'tests', status: 'completed', conclusion: 'skipped', headSha: sha }] },
    { checks: [] }, { draft: true }, { baseSha: other },
  ]) {
    const result = evaluateBacklogCloseout(input({ prs: [pr(changes)] }));
    assert.equal(result.prs[0].decision, 'BLOCKED', JSON.stringify(changes));
  }
});

test('stale evidence on another commit never authorizes merge', () => {
  const result = evaluateBacklogCloseout(input({ prs: [pr({
    checks: [{ ...success('tests'), headSha: other }],
  })] }));
  assert.ok(result.prs[0].blockers.includes('STALE_CHECK_SHA'));
  assert.ok(result.prs[0].blockers.includes('NO_EXACT_SHA_CHECKS'));
});

test('missing required policy/checks and ambiguous check names fail closed', () => {
  const unknown = evaluateBacklogCloseout(input({ requiredCheckPolicy: { status: 'UNKNOWN', names: [] } }));
  assert.ok(unknown.prs[0].blockers.includes('REQUIRED_POLICY_UNKNOWN'));
  const missing = evaluateBacklogCloseout(input({ requiredCheckPolicy: { status: 'VERIFIED', names: ['security'] } }));
  assert.ok(missing.prs[0].blockers.includes('REQUIRED_CHECK_UNSATISFIED:security'));
  const ambiguous = evaluateBacklogCloseout(input({ prs: [pr({ checks: [success('tests'), success('tests')] })] }));
  assert.ok(ambiguous.prs[0].blockers.includes('CHECK_NAME_AMBIGUOUS'));
});

test('claims from title alone stay inferred and cannot steal epic closure authority', () => {
  const inferred = evaluateBacklogCloseout(input()).prs[0].claim;
  assert.deepEqual(inferred, { number: 637, mode: 'INFERRED_TITLE_ONLY' });
  const declared = evaluateBacklogCloseout(input({ prs: [pr({ body: 'Agent-Claim-Issue: #637' })] })).prs[0].claim;
  assert.deepEqual(declared, { number: 637, mode: 'DECLARED' });
});

test('rejects malformed, duplicated, or forged GitHub collections', () => {
  for (const value of [null, {}, { ...input(), mainSha: 'main' },
    input({ issues: [issues[0], issues[0]] }), input({ prs: [pr(), pr()] }),
    input({ prs: [pr({ headSha: 'not-a-sha' })] }),
    input({ requiredCheckPolicy: { status: 'PASS', names: [] } }),
  ]) assert.throws(() => evaluateBacklogCloseout(value), /CLOSEOUT_/);
});
