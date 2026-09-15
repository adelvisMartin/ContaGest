import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import {
  AGENT_TOOLS,
  AUTOMATION_STATES,
  AUTO_EXECUTABLE_TOOLS,
  HipicoAgentEngine,
  MIN_AUTO_CONFIDENCE,
  agentCanAct,
  canPromoteAutomation,
  safeToolRequest,
  validateModelCandidate
} from './agent-policy.js';
import { AutomationStore, sanitizeAgentEvidence } from './automation.store.js';

const moduleUrl = (name: string) => new URL(`./${name}`, import.meta.url);

void test('agent-policy keeps the established public surface and representative behavior', () => {
  assert.deepEqual(AUTOMATION_STATES, ['DISABLED', 'SHADOW', 'ASSISTED', 'AUTOMATIC_LOW_RISK', 'AUTOMATIC']);
  assert.ok(AGENT_TOOLS.includes('queryNextRace'));
  assert.ok(AUTO_EXECUTABLE_TOOLS.includes('queryNextRace'));
  assert.equal(MIN_AUTO_CONFIDENCE, .95);
  assert.equal(typeof HipicoAgentEngine, 'function');

  const candidate = validateModelCandidate({
    intent: 'query:NEXT_RACE',
    confidence: .99,
    tool: 'queryNextRace',
    arguments: { text: 'siguiente' },
    risk: 'safe'
  });
  assert.equal(candidate.source, 'model');
  assert.deepEqual(safeToolRequest(candidate), { tool: 'queryNextRace', arguments: { text: 'siguiente' } });
  assert.equal(agentCanAct('SHADOW', { ...candidate, source: 'deterministic' }), false);
  assert.throws(
    () => safeToolRequest({ ...candidate, arguments: { shell: 'whoami' } }),
    /AGENT_TOOL_ARGUMENTS_REJECTED/
  );

  const metrics = {
    reviewed: 200,
    matched: 196,
    highRiskFalsePositive: 0,
    unauthorizedAction: 0,
    conflicts: 0,
    abstentions: 0,
    raceContextErrors: 0,
    recent: {
      reviewed: 75,
      matched: 74,
      highRiskFalsePositive: 0,
      unauthorizedAction: 0,
      conflicts: 0,
      abstentions: 0,
      raceContextErrors: 0
    },
    window: { recentDays: 30, metricSchemaVersion: 'v7' }
  };
  assert.equal(canPromoteAutomation('SHADOW', 'ASSISTED', metrics).reason, 'SHADOW_GATE_PASSED');
});

void test('AutomationStore public API and evidence sanitizer remain stable', () => {
  const methods = Object.getOwnPropertyNames(AutomationStore.prototype);
  for (const name of ['metrics', 'read', 'get', 'setMode', 'recordEvaluation', 'review', 'evaluations', 'transitionEvents']) {
    assert.ok(methods.includes(name), `missing AutomationStore.${name}`);
  }
  assert.deepEqual(sanitizeAgentEvidence({ source: 'fixture', nested: { ok: true } }), {
    source: 'fixture',
    nested: { ok: true }
  });
  assert.throws(() => sanitizeAgentEvidence({ token: 'secret' }), /HIPICO_AGENT_EVIDENCE_FORBIDDEN_KEY/);
});

void test('v8 internal seams exist before the facade refactor is considered complete', () => {
  for (const file of [
    'agent-contracts.ts',
    'agent-tools.ts',
    'promotion-policy.ts',
    'agent-evaluator.ts',
    'automation-scope.ts',
    'automation-evidence.ts',
    'automation-metrics.store.ts',
    'agent-http.ts'
  ]) {
    assert.equal(existsSync(moduleUrl(file)), true, `${file} must exist`);
  }
});
