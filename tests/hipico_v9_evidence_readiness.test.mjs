import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  computeReadinessScore,
  deriveAutomationReadiness
} from '../scripts/hipico-release-readiness-v9.mjs';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('v9 evidence verifier requires every PR code artifact on the same SHA', async () => {
  const verifier = await read('scripts/hipico-verify-evidence-v290.mjs');
  for (const id of [
    'secretScan',
    'releaseGuard',
    'staticGate',
    'postgresRbac',
    'postgresGate',
    'restart',
    'performance',
    'chromiumGate',
    'securityGate',
    'androidGate',
    'releaseManifest'
  ]) assert.match(verifier, new RegExp(`id: '${id}'`), `missing required evidence descriptor ${id}`);
  assert.match(verifier, /migrations.*v12-v27/);
  assert.match(verifier, /agentPolicyMetrics/);
});

test('readiness score enforces #290 caps without converting unknown evidence into PASS', () => {
  const allPass = ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'];

  assert.equal(computeReadinessScore({ statuses: allPass, p0Open: false, codeReviewStatus: 'PASS', securityCritical: false, raceContextVerified: true }).score, 100);
  assert.ok(computeReadinessScore({ statuses: allPass, p0Open: true, codeReviewStatus: 'PASS', securityCritical: false, raceContextVerified: true }).score <= 60);
  assert.ok(computeReadinessScore({ statuses: allPass, p0Open: false, codeReviewStatus: 'FAIL', securityCritical: false, raceContextVerified: true }).score <= 79);
  assert.ok(computeReadinessScore({ statuses: allPass, p0Open: false, codeReviewStatus: 'PASS', securityCritical: true, raceContextVerified: true }).score <= 69);
  assert.ok(computeReadinessScore({ statuses: allPass, p0Open: false, codeReviewStatus: 'PASS', securityCritical: false, raceContextVerified: false }).score <= 70);

  const incomplete = computeReadinessScore({
    statuses: ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'NOT_EXECUTED', 'NOT_EXECUTED'],
    p0Open: false,
    codeReviewStatus: 'PASS',
    securityCritical: false,
    raceContextVerified: true
  });
  assert.ok(incomplete.score < 100);
});

test('automation readiness requires evidence, shadow and race context on the same release verdict', () => {
  assert.equal(deriveAutomationReadiness({ evidenceStatus: 'PASS', agentShadowStatus: 'PASS', raceContextStatus: 'PASS' }), 'VERIFIED');
  assert.equal(deriveAutomationReadiness({ evidenceStatus: 'PASS', agentShadowStatus: 'NOT_EXECUTED', raceContextStatus: 'PASS' }), 'NOT_VERIFIED');
  assert.equal(deriveAutomationReadiness({ evidenceStatus: 'PASS', agentShadowStatus: 'PASS', raceContextStatus: 'BLOCKED' }), 'NOT_VERIFIED');
  assert.equal(deriveAutomationReadiness({ evidenceStatus: 'FAIL', agentShadowStatus: 'PASS', raceContextStatus: 'PASS' }), 'NOT_VERIFIED');
});

test('release report publishes current chain, automation readiness and applied caps', async () => {
  const report = await read('scripts/hipico-release-report-v290.mjs');
  assert.match(report, /hipico-release-readiness-v9\.mjs/);
  assert.match(report, /postgresChain:\s*'v12-v27'/);
  assert.match(report, /automationReadiness/);
  assert.match(report, /appliedCaps/);
});
