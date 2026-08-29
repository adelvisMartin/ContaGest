import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLabRunSafe, importSanitizedCorpus, runLabScenario } from './hipico-lab-simulator.js';
import { HIPICO_LAB_SCENARIOS, labScenarioById } from './hipico-lab-scenarios.js';

test('LAB ships the ten required scenario families', () => {
  assert.equal(HIPICO_LAB_SCENARIOS.length, 10);
  for (const id of [
    'nominal-day', 'multi-user-burst', 'duplicate-retry', 'correction-cancel', 'ambiguous',
    'close-in-flight', 'reconnect-out-of-order', 'restart-half-day', 'pre-close-load', 'hostile-input'
  ]) assert.ok(labScenarioById(id), `missing ${id}`);
});

test('same fixture and epoch produce identical transcript/state hashes', () => {
  const scenario = labScenarioById('nominal-day')!;
  const first = runLabScenario(scenario);
  const second = runLabScenario(scenario);
  assert.equal(first.transcriptHash, second.transcriptHash);
  assert.equal(first.stateHash, second.stateHash);
  assert.deepEqual(first.summary, second.summary);
});

test('duplicate retry produces one respondable decision only', () => {
  const result = runLabScenario(labScenarioById('duplicate-retry')!);
  assert.equal(result.transcript[0].decision.responseIntent === 'NONE', false);
  assert.equal(result.transcript[1].decision.decision, 'NO_RESPONSE');
  assert.equal(result.transcript[1].decision.responseIntent, 'NONE');
  assert.equal(result.summary.duplicateResponses, 0);
  assertLabRunSafe(result);
});

test('reconnect fixture preserves delivery order and detects older stateful timestamp', () => {
  const result = runLabScenario(labScenarioById('reconnect-out-of-order')!);
  assert.equal(result.transcript[0].eventId, 'reconnect-late');
  assert.equal(result.transcript[1].eventId, 'reconnect-old');
  assert.equal(result.transcript[1].decision.audit.outOfOrder, true);
  assert.equal(result.transcript[1].decision.decisionReason, 'OUT_OF_ORDER_STATEFUL_MESSAGE');
  assertLabRunSafe(result);
});

test('pre-close load produces decisions for all 120 events without participant leakage', () => {
  const result = runLabScenario(labScenarioById('pre-close-load')!);
  assert.equal(result.eventCount, 120);
  assert.equal(result.transcript.length, 120);
  assert.equal(result.summary.lostDecisions, 0);
  assert.equal(result.summary.contextLeaks, 0);
  assertLabRunSafe(result);
});

test('sanitized corpus hashes participant identity and strips source alias from IDs', () => {
  const source = [
    { sender: '+584121234567', text: 'hola', atMs: 0 },
    { sender: '+584121234567', text: 'juega 2N', atMs: 10 },
    { sender: '+584149999999', text: 'ayuda', atMs: 20 }
  ];
  const scenario = importSanitizedCorpus(source);
  assert.equal(scenario.participants.length, 2);
  assert.equal(JSON.stringify(scenario).includes('+584121234567'), false);
  assert.equal(JSON.stringify(scenario).includes('+584149999999'), false);
  assert.match(scenario.events[0].participantId, /^synthetic-[a-f0-9]{12}$/);
});

test('all versioned scenarios complete without lost decisions/context leaks', () => {
  for (const scenario of HIPICO_LAB_SCENARIOS) {
    const result = runLabScenario(scenario);
    assert.equal(result.summary.lostDecisions, 0, scenario.id);
    assert.equal(result.summary.contextLeaks, 0, scenario.id);
    assert.equal(result.summary.fail, 0, `${scenario.id}: ${JSON.stringify(result.findings)}`);
  }
});
