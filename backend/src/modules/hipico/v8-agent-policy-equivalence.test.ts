import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agentCanAct,
  canPromoteAutomation,
  safeToolRequest,
  validateModelCandidate,
  type AgentCandidate
} from './agent-policy.js';

const historical = {
  reviewed: 200,
  matched: 196,
  highRiskFalsePositive: 0,
  unauthorizedAction: 0,
  conflicts: 0,
  abstentions: 0,
  raceContextErrors: 0
};

const recent = {
  reviewed: 75,
  matched: 74,
  highRiskFalsePositive: 0,
  unauthorizedAction: 0,
  conflicts: 0,
  abstentions: 0,
  raceContextErrors: 0
};

test('v8 freezes dual-window promotion paths and reason codes', () => {
  const pass = canPromoteAutomation('SHADOW', 'ASSISTED', {
    ...historical,
    recent,
    window: {
      recentDays: 30,
      recentSince: '2026-08-16T00:00:00.000Z',
      metricSchemaVersion: 'v7'
    }
  });

  assert.equal(pass.allowed, true);
  assert.equal(pass.reason, 'SHADOW_GATE_PASSED');
  assert.equal(
    canPromoteAutomation('SHADOW', 'AUTOMATIC_LOW_RISK', historical).reason,
    'INVALID_PROMOTION_PATH'
  );
  assert.equal(
    canPromoteAutomation('ASSISTED', 'AUTOMATIC_LOW_RISK', historical).reason,
    'LOW_RISK_METRICS_INSUFFICIENT'
  );
});

test('v8 freezes candidate validation and safe automatic query behavior', () => {
  assert.throws(
    () => validateModelCandidate({ intent: '', confidence: 2 }),
    /AGENT_CANDIDATE_SCHEMA_INVALID/
  );

  const candidate: AgentCandidate = {
    intent: 'query:NEXT_RACE',
    confidence: .995,
    tool: 'queryNextRace',
    arguments: { text: 'próxima carrera' },
    risk: 'safe',
    source: 'deterministic',
    modelVersion: null
  };

  assert.equal(agentCanAct('SHADOW', candidate), false);
  assert.equal(agentCanAct('AUTOMATIC_LOW_RISK', candidate), true);
  assert.deepEqual(safeToolRequest(candidate), {
    tool: 'queryNextRace',
    arguments: { text: 'próxima carrera' }
  });
});

test('v8 freezes dangerous tool-argument rejection', () => {
  const candidate: AgentCandidate = {
    intent: 'query:NEXT_RACE',
    confidence: 1,
    tool: 'queryNextRace',
    arguments: { token: 'secret-value' },
    risk: 'safe',
    source: 'deterministic',
    modelVersion: null
  };

  assert.throws(() => safeToolRequest(candidate), /AGENT_TOOL_ARGUMENTS_REJECTED/);
});
