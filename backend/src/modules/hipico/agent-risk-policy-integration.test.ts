import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultHipicoAgentEngine } from './agent-engine.js';

const engine = createDefaultHipicoAgentEngine();

test('agent evaluation exposes deterministic policy and never auto-acts in SHADOW', async () => {
  const result = await engine.evaluate('¿Cuál es la próxima carrera?', 'SHADOW', {
    evidenceState: 'FRESH',
    sourceAuthorized: true,
    toolValidated: true
  });
  assert.equal(result.riskPolicy.disposition, 'SUGGEST');
  assert.equal(result.riskPolicy.autonomousSendAllowed, false);
  assert.equal(result.canAct, false);
});

test('agent evaluation fails closed when live-query evidence is not server verified', async () => {
  const result = await engine.evaluate('¿Cuál es la próxima carrera?', 'AUTOMATIC_LOW_RISK', {
    evidenceState: 'MISSING',
    sourceAuthorized: false,
    toolValidated: true
  });
  assert.equal(result.riskPolicy.disposition, 'HUMAN_REQUIRED');
  assert.equal(result.canAct, false);
});

test('agent evaluation allows low-risk action only when both legacy tool gate and new risk policy agree', async () => {
  const result = await engine.evaluate('¿Cuál es la próxima carrera?', 'AUTOMATIC_LOW_RISK', {
    evidenceState: 'FRESH',
    sourceAuthorized: true,
    toolValidated: true
  });
  assert.equal(result.riskPolicy.disposition, 'AUTO');
  assert.equal(result.canAct, true);
});

test('agent evaluation denies monetary intent independently of mode', async () => {
  const result = await engine.evaluate('juego 100 al 4', 'AUTOMATIC', {
    evidenceState: 'FRESH',
    sourceAuthorized: true,
    toolValidated: true
  });
  assert.equal(result.riskPolicy.disposition, 'DENY');
  assert.equal(result.riskPolicy.reason, 'FINANCIAL_AUTHORITY_DENIED');
  assert.equal(result.canAct, false);
});
