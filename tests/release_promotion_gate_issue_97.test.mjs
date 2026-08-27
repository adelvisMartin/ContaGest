import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const promotion = readFileSync(new URL('../scripts/release-promotion-gate-v97.mjs', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../scripts/verify-main-protection-v97.mjs', import.meta.url), 'utf8');

test('issue #97 release promotion requires legal and live main governance before full readiness', () => {
  assert.match(promotion, /qa:legal:production/);
  assert.match(promotion, /verify-main-protection-v97\.mjs/);
  assert.match(promotion, /production-readiness\.mjs/);
  const legalIndex = promotion.indexOf("'legal-production'");
  const governanceIndex = promotion.indexOf("'main-governance-live'");
  const fullIndex = promotion.indexOf("'production-readiness-full'");
  assert.ok(legalIndex >= 0 && governanceIndex > legalIndex && fullIndex > governanceIndex);
});

test('issue #97 BLOCKED and NOT_EXECUTED can never become promotion PASS', () => {
  assert.match(promotion, /\['BLOCKED', 'NOT_EXECUTED'\]/);
  assert.match(promotion, /hasBlocked \? 'BLOCKED' : 'PASS'/);
  assert.match(promotion, /process\.exitCode = status === 'PASS' \? 0 : status === 'FAIL' \? 1 : 2/);
});

test('issue #97 promotion gate never mutates protection or merges/deploys', () => {
  assert.doesNotMatch(promotion, /branches\/main\/protection.*(?:PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(promotion, /merge_pull_request|vercel deploy|git push/);
  assert.match(promotion, /never merges, deploys or changes branch protection/);
});

test('issue #97 live verifier still checks protected flag and structural controls', () => {
  for (const marker of [
    'branch-protected-flag',
    'pull-request-required',
    'force-push-blocked',
    'deletion-blocked',
    'conversation-resolution-required',
  ]) assert.match(verifier, new RegExp(marker));
});
