import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDuplicateExclusiveClaims, extractExclusiveIssueClaims } from '../scripts/agent-context-v2-lib.mjs';

test('closure syntax is parsed deterministically and deduplicated', () => {
  const claims = extractExclusiveIssueClaims('Closes #562\nFixes #562, resolves #563');
  assert.deepEqual(claims, [562, 563]);
});

test('#599/#600-equivalent duplicate exclusive claim fails closed', () => {
  const result = detectDuplicateExclusiveClaims([
    { number: 599, body: 'Closes #562', state: 'open' },
    { number: 600, body: 'Fixes #562', state: 'open' },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'DUPLICATE_WORK_CLAIM');
  assert.deepEqual(result.duplicates, [{ issue: 562, pullRequests: [599, 600] }]);
});

test('explicit machine-readable supersession permits exactly one active closing owner', () => {
  const result = detectDuplicateExclusiveClaims([
    { number: 599, body: 'Closes #562', state: 'open' },
    { number: 600, body: 'Agent-Claim-Supersedes: 599\nCloses #562', state: 'open' },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.duplicates, []);
  assert.deepEqual(result.superseded, [{ pullRequest: 599, by: 600 }]);
});

test('supersession without a shared exclusive issue cannot silence an owner', () => {
  const result = detectDuplicateExclusiveClaims([
    { number: 599, body: 'Closes #562', state: 'open' },
    { number: 600, body: 'Agent-Claim-Supersedes: 599\nCloses #563', state: 'open' },
    { number: 601, body: 'Fixes #562', state: 'open' },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'DUPLICATE_WORK_CLAIM');
  assert.deepEqual(result.duplicates, [{ issue: 562, pullRequests: [599, 601] }]);
  assert.deepEqual(result.superseded, []);
});

test('cyclic supersession fails closed because it leaves no unique closing owner', () => {
  const result = detectDuplicateExclusiveClaims([
    { number: 599, body: 'Agent-Claim-Supersedes: 600\nCloses #562', state: 'open' },
    { number: 600, body: 'Agent-Claim-Supersedes: 599\nFixes #562', state: 'open' },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'DUPLICATE_WORK_CLAIM');
  assert.deepEqual(result.duplicates, [{ issue: 562, pullRequests: [599, 600] }]);
  assert.deepEqual(result.superseded, []);
});

test('diagnostic or stacked PR without closure syntax is not an exclusive claim', () => {
  const result = detectDuplicateExclusiveClaims([
    { number: 701, body: 'Agent-Claim-Mode: diagnostic\nInvestigates #562', state: 'open' },
    { number: 702, body: 'Agent-Claim-Mode: stacked\nParent-Issue: 562', state: 'open' },
    { number: 703, body: 'Closes #562', state: 'open' },
  ]);
  assert.equal(result.ok, true);
});
