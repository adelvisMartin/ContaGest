import assert from 'node:assert/strict';
import test from 'node:test';
import type { AutomationMetrics, DeterministicAgentParser } from './agent-contracts.js';
import { HipicoAgentEngine } from './agent-evaluator.js';
import { UnifiedAgentRuntime } from './unified-agent-runtime.js';

const parser: DeterministicAgentParser = {
  parse(text) {
    return {
      intent: 'query:RACE_STATUS',
      confidence: .995,
      tool: 'queryRaceStatus',
      arguments: { text },
      risk: 'safe'
    };
  }
};

const promotionMetrics: AutomationMetrics = {
  reviewed: 200,
  matched: 200,
  highRiskFalsePositive: 0,
  unauthorizedAction: 0,
  conflicts: 0,
  abstentions: 0,
  raceContextErrors: 0,
  recent: {
    reviewed: 75,
    matched: 75,
    highRiskFalsePositive: 0,
    unauthorizedAction: 0,
    conflicts: 0,
    abstentions: 0,
    raceContextErrors: 0
  },
  window: {
    recentDays: 30,
    metricSchemaVersion: 'v7'
  }
};

test('unified runtime exposes an executable tool only after the canonical AUTO policy allows it', async () => {
  const runtime = new UnifiedAgentRuntime(new HipicoAgentEngine(parser));
  const result = await runtime.evaluate({
    text: 'estado de la carrera',
    mode: 'AUTOMATIC_LOW_RISK',
    riskContext: {
      evidenceState: 'FRESH',
      sourceAuthorized: true,
      systemHealthy: true,
      sourceReadOnly: false,
      humanOwned: false,
      ambiguous: false
    }
  });

  assert.equal(result.runtimeVersion, 'hipico-unified-agent-runtime-v1');
  assert.equal(result.riskPolicy.disposition, 'AUTO');
  assert.equal(result.execution.allowed, true);
  assert.deepEqual(result.execution.toolRequest, {
    tool: 'queryRaceStatus',
    arguments: { text: 'estado de la carrera' }
  });
});

test('unified runtime keeps proposed tools non-executable in SHADOW', async () => {
  const runtime = new UnifiedAgentRuntime(new HipicoAgentEngine(parser));
  const result = await runtime.evaluate({
    text: 'estado de la carrera',
    mode: 'SHADOW',
    riskContext: {
      evidenceState: 'FRESH',
      sourceAuthorized: true,
      systemHealthy: true
    }
  });

  assert.equal(result.riskPolicy.disposition, 'SUGGEST');
  assert.equal(result.execution.allowed, false);
  assert.equal(result.execution.toolRequest, null);
  assert.equal(result.proposal.toolRequest?.tool, 'queryRaceStatus');
});

test('unified runtime delegates promotion decisions to the canonical promotion policy', () => {
  const runtime = new UnifiedAgentRuntime(new HipicoAgentEngine(parser));
  const decision = runtime.canPromote('SHADOW', 'ASSISTED', promotionMetrics);

  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'SHADOW_GATE_PASSED');
});

test('audit events contain bounded decision metadata but never the raw user message', async () => {
  const events: unknown[] = [];
  const runtime = new UnifiedAgentRuntime(new HipicoAgentEngine(parser), {
    audit: (event) => events.push(event)
  });
  const secretLikeMessage = 'estado de la carrera token-super-secreto';

  await runtime.evaluate({
    text: secretLikeMessage,
    mode: 'SHADOW',
    riskContext: {
      evidenceState: 'FRESH',
      sourceAuthorized: true,
      systemHealthy: true
    }
  });

  assert.equal(events.length, 1);
  const encoded = JSON.stringify(events[0]);
  assert.equal(encoded.includes(secretLikeMessage), false);
  assert.match(encoded, /query:RACE_STATUS/);
  assert.match(encoded, /SHADOW/);
});
