import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { agentCanAct, type AgentCandidate } from './agent-policy.js';

function candidate(overrides: Partial<AgentCandidate> = {}): AgentCandidate {
  return {
    intent: 'query:NEXT_RACE',
    confidence: .99,
    tool: 'queryNextRace',
    arguments: { text: '¿Cuál es la próxima carrera?' },
    risk: 'safe',
    source: 'model',
    modelVersion: 'fixture-model',
    ...overrides
  };
}

void test('automatic eligibility is confidence- and tool-bounded instead of trusting any safe label', () => {
  assert.equal(agentCanAct('AUTOMATIC_LOW_RISK', candidate()), true);
  assert.equal(agentCanAct('AUTOMATIC_LOW_RISK', candidate({ confidence: .949 })), false);
  assert.equal(agentCanAct('AUTOMATIC', candidate({ tool: null })), false);
  assert.equal(agentCanAct('AUTOMATIC', candidate({ tool: 'proposeRaceCommand' })), false);
  assert.equal(agentCanAct('SHADOW', candidate()), false);
  assert.equal(agentCanAct('ASSISTED', candidate()), false);
});

void test('automation mode changes require an idempotency key and immutable transition ledger', () => {
  const routes = readFileSync(new URL('./agent.routes.ts', import.meta.url), 'utf8');
  const store = readFileSync(new URL('./automation.store.ts', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../../../supabase/sql/hipico_v16_agent_shadow.sql', import.meta.url), 'utf8');

  assert.match(routes, /idempotency-key/i);
  assert.match(routes, /idempotencyKey/);
  assert.match(store, /hipico_automation_transition_events/);
  assert.match(store, /HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH/);
  assert.match(migration, /create table if not exists public\.hipico_automation_transition_events/i);
  assert.match(migration, /idempotency_key/i);
});
