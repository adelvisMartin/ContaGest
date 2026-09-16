import assert from 'node:assert/strict';
import test from 'node:test';
import { canPromoteAutomation } from './agent-policy.js';

function window(overrides: Record<string, number> = {}) {
  return {
    reviewed: 75,
    matched: 75,
    highRiskFalsePositive: 0,
    unauthorizedAction: 0,
    conflicts: 0,
    abstentions: 0,
    raceContextErrors: 0,
    ...overrides
  };
}

function metrics(overrides: Record<string, unknown> = {}) {
  return {
    reviewed: 200,
    matched: 200,
    highRiskFalsePositive: 0,
    unauthorizedAction: 0,
    conflicts: 0,
    abstentions: 0,
    raceContextErrors: 0,
    recent: window(),
    window: { recentDays: 30, metricSchemaVersion: 'v7' },
    ...overrides
  } as any;
}

test('ASSISTED promotion requires both historical and recent reviewed samples', () => {
  assert.equal(canPromoteAutomation('SHADOW', 'ASSISTED', metrics()).allowed, true);
  assert.equal(canPromoteAutomation('SHADOW', 'ASSISTED', metrics({ reviewed: 199, matched: 199 })).allowed, false);
  const recentTooSmall = metrics({ recent: window({ reviewed: 74, matched: 74 }) });
  const decision = canPromoteAutomation('SHADOW', 'ASSISTED', recentTooSmall);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'RECENT_METRICS_INSUFFICIENT');
});

test('historical pass cannot mask recent accuracy degradation', () => {
  const degraded = metrics({ recent: window({ reviewed: 75, matched: 73 }) });
  const decision = canPromoteAutomation('SHADOW', 'ASSISTED', degraded);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'RECENT_METRICS_INSUFFICIENT');
});

test('recent pass cannot mask historical quality degradation', () => {
  const degraded = metrics({ matched: 195 });
  const decision = canPromoteAutomation('SHADOW', 'ASSISTED', degraded);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'SHADOW_METRICS_INSUFFICIENT');
});

test('AUTOMATIC_LOW_RISK applies conflict, abstention and race-context limits to both windows', () => {
  const base = metrics({
    reviewed: 500,
    matched: 500,
    recent: window({ reviewed: 200, matched: 200 })
  });
  assert.equal(canPromoteAutomation('ASSISTED', 'AUTOMATIC_LOW_RISK', base).allowed, true);

  for (const recent of [
    window({ reviewed: 200, matched: 200, conflicts: 2 }),
    window({ reviewed: 200, matched: 200, abstentions: 7 }),
    window({ reviewed: 200, matched: 200, raceContextErrors: 2 }),
    window({ reviewed: 200, matched: 200, highRiskFalsePositive: 1 }),
    window({ reviewed: 200, matched: 200, unauthorizedAction: 1 })
  ]) {
    assert.equal(canPromoteAutomation('ASSISTED', 'AUTOMATIC_LOW_RISK', metrics({ reviewed: 500, matched: 500, recent })).allowed, false);
  }
});

test('AUTOMATIC requires owner approval plus historical and recent production-quality metrics', () => {
  const base = metrics({
    reviewed: 1000,
    matched: 1000,
    recent: window({ reviewed: 400, matched: 400 })
  });
  assert.equal(canPromoteAutomation('AUTOMATIC_LOW_RISK', 'AUTOMATIC', base, false).reason, 'OWNER_APPROVAL_REQUIRED');
  assert.equal(canPromoteAutomation('AUTOMATIC_LOW_RISK', 'AUTOMATIC', base, true).allowed, true);
  const staleSample = metrics({ reviewed: 1000, matched: 1000, recent: window({ reviewed: 399, matched: 399 }) });
  assert.equal(canPromoteAutomation('AUTOMATIC_LOW_RISK', 'AUTOMATIC', staleSample, true).reason, 'RECENT_METRICS_INSUFFICIENT');
});

test('downgrade/same-state and DISABLED→SHADOW semantics remain unchanged without recent metrics', () => {
  const legacy = { reviewed: 0, matched: 0, highRiskFalsePositive: 0, unauthorizedAction: 0, conflicts: 0 } as any;
  assert.equal(canPromoteAutomation('DISABLED', 'SHADOW', legacy).allowed, true);
  assert.equal(canPromoteAutomation('AUTOMATIC', 'SHADOW', legacy).reason, 'DOWNGRADE_OR_SAME_STATE');
});
