import assert from 'node:assert/strict';
import test from 'node:test';
import { decideRiskPolicy, RISK_POLICY_VERSION } from './risk-policy.js';
import type { AgentCandidate } from './agent-policy.js';

const safeQuery: AgentCandidate = {
  intent: 'query:NEXT_RACE',
  confidence: .995,
  tool: 'queryNextRace',
  arguments: { text: '¿Cuál es la próxima carrera?' },
  risk: 'safe',
  source: 'deterministic',
  modelVersion: null
};

function decide(overrides: Record<string, unknown> = {}) {
  return decideRiskPolicy({
    mode: 'AUTOMATIC_LOW_RISK',
    candidate: safeQuery,
    evidenceState: 'FRESH',
    sourceAuthorized: true,
    systemHealthy: true,
    sourceReadOnly: false,
    humanOwned: false,
    ambiguous: false,
    toolValidated: true,
    ...overrides
  } as any);
}

test('risk policy has a stable explicit version and only four dispositions', () => {
  assert.match(RISK_POLICY_VERSION, /^hipico-risk-policy-v\d+$/);
  const dispositions = new Set([
    decide().disposition,
    decide({ mode: 'ASSISTED' }).disposition,
    decide({ ambiguous: true }).disposition,
    decide({ candidate: { ...safeQuery, risk: 'monetary', intent: 'betting_or_balance', tool: null } }).disposition
  ]);
  assert.deepEqual([...dispositions].sort(), ['AUTO', 'DENY', 'HUMAN_REQUIRED', 'SUGGEST'].sort());
});

test('risk policy denies monetary/betting/settlement intent regardless of automation mode', () => {
  for (const intent of ['betting_or_balance', 'offer_player', 'offer_receiver', 'settlement_snapshot', 'balance_snapshot']) {
    const policy = decide({ candidate: { ...safeQuery, intent, risk: 'monetary', tool: null, confidence: 1 }, mode: 'AUTOMATIC' });
    assert.equal(policy.disposition, 'DENY');
    assert.equal(policy.autonomousSendAllowed, false);
    assert.equal(policy.reason, 'FINANCIAL_AUTHORITY_DENIED');
  }
});

test('risk policy denies prompt/tool injection even when candidate is otherwise high confidence', () => {
  const policy = decide({
    candidate: { ...safeQuery, intent: 'security_review', risk: 'review', confidence: .999, tool: null },
    mode: 'AUTOMATIC'
  });
  assert.equal(policy.disposition, 'DENY');
  assert.equal(policy.reason, 'SECURITY_POLICY_VIOLATION');
});

test('risk policy keeps SOURCE read-only while still permitting shadow evaluation', () => {
  const automatic = decide({ mode: 'AUTOMATIC', sourceReadOnly: true });
  assert.equal(automatic.disposition, 'DENY');
  assert.equal(automatic.reason, 'SOURCE_READ_ONLY');
  assert.equal(automatic.autonomousSendAllowed, false);
  const shadow = decide({ mode: 'SHADOW', sourceReadOnly: true });
  assert.equal(shadow.disposition, 'SUGGEST');
  assert.equal(shadow.autonomousSendAllowed, false);
});

test('risk policy requires a human for human-owned, ambiguous, review or lifecycle command candidates', () => {
  assert.equal(decide({ humanOwned: true }).disposition, 'HUMAN_REQUIRED');
  assert.equal(decide({ ambiguous: true }).disposition, 'HUMAN_REQUIRED');
  assert.equal(decide({ candidate: { ...safeQuery, risk: 'review' } }).disposition, 'HUMAN_REQUIRED');
  assert.equal(decide({ candidate: { ...safeQuery, risk: 'review', intent: 'race_close', tool: 'proposeRaceCommand' } }).disposition, 'HUMAN_REQUIRED');
});

test('risk policy fails closed on missing, stale, conflicting or unauthorized evidence for live race queries', () => {
  for (const evidenceState of ['MISSING', 'STALE', 'CONFLICT'] as const) {
    const policy = decide({ evidenceState });
    assert.equal(policy.disposition, 'HUMAN_REQUIRED');
    assert.equal(policy.autonomousSendAllowed, false);
  }
  assert.equal(decide({ sourceAuthorized: false }).disposition, 'HUMAN_REQUIRED');
  assert.equal(decide({ systemHealthy: false }).disposition, 'HUMAN_REQUIRED');
});

test('risk policy permits AUTO only for enumerated read-only tools with fresh evidence and confidence >= .95', () => {
  for (const tool of ['queryRaceStatus', 'queryNextRace', 'queryLastResult', 'querySchedule', 'queryScratches'] as const) {
    const policy = decide({ candidate: { ...safeQuery, tool, confidence: .95 } });
    assert.equal(policy.disposition, 'AUTO');
    assert.equal(policy.autonomousSendAllowed, true);
    assert.equal(policy.toolExecutable, true);
  }
  assert.equal(decide({ candidate: { ...safeQuery, confidence: .9499 } }).disposition, 'HUMAN_REQUIRED');
  assert.equal(decide({ toolValidated: false }).disposition, 'HUMAN_REQUIRED');
});

test('model candidates can never grant autonomous authority even for allowlisted read-only tools', () => {
  const policy = decide({
    mode: 'AUTOMATIC',
    candidate: { ...safeQuery, source: 'model', modelVersion: 'fixture-model', confidence: 1 }
  });
  assert.equal(policy.disposition, 'SUGGEST');
  assert.equal(policy.autonomousSendAllowed, false);
  assert.equal(policy.toolExecutable, false);
  assert.equal(policy.reason, 'MODEL_CANDIDATE_REQUIRES_REVIEW');
});

test('SHADOW and ASSISTED can only suggest safe candidates, while DISABLED denies automation', () => {
  const shadow = decide({ mode: 'SHADOW' });
  assert.equal(shadow.disposition, 'SUGGEST');
  assert.equal(shadow.autonomousSendAllowed, false);
  assert.equal(decide({ mode: 'ASSISTED' }).disposition, 'SUGGEST');
  assert.equal(decide({ mode: 'DISABLED' }).disposition, 'DENY');
});

test('safe greetings/help do not require provider evidence but still honor mode/confidence/tool validation', () => {
  for (const intent of ['greeting', 'help'] as const) {
    const policy = decide({ candidate: { ...safeQuery, intent, confidence: .99, tool: 'queryRaceStatus' }, evidenceState: 'NOT_REQUIRED', sourceAuthorized: false });
    assert.equal(policy.disposition, 'AUTO');
  }
});