import assert from 'node:assert/strict';
import test from 'node:test';
import { decideConversation, nextConversationContext } from './hipico-conversation-engine.js';
import type { IntentResult } from './hipico-operational-classifier.js';

const at = (id: string, participantId = 'p1', text = 'hola', timestamp = '2026-08-29T12:00:00.000Z') => ({
  sourceMessageId: id,
  participantId,
  text,
  timestamp,
  raceId: '7'
});

function classifier(result: Partial<IntentResult>): (text: string) => IntentResult {
  return () => ({
    intent: 'greeting', risk: 'safe', confidence: 1, suggestion: 'Hola.', autoEligible: false, reason: 'TEST',
    ...result
  });
}

test('same sourceMessageId produces no second response/effect', () => {
  const first = decideConversation(at('m1'));
  const context = nextConversationContext({}, at('m1'), first);
  const second = decideConversation(at('m1'), context);
  assert.equal(second.decision, 'NO_RESPONSE');
  assert.equal(second.decisionReason, 'DUPLICATE_SOURCE_MESSAGE');
  assert.equal(second.effectsAllowed, false);
  assert.equal(second.transportAction, 'NONE');
  assert.equal(second.correlationId, first.correlationId);
});

test('ambiguous monetary input asks clarification and never mutates', () => {
  const result = decideConversation(
    at('m2', 'p1', 'juega 2N'),
    {},
    classifier({ intent: 'offer_player', risk: 'monetary', entities: { play: '2N' }, confidence: 0.95 })
  );
  assert.equal(result.decision, 'NEEDS_CLARIFICATION');
  assert.match(result.responseText || '', /caballo|selección/i);
  assert.match(result.responseText || '', /monto/i);
  assert.equal(result.effectsAllowed, false);
});

test('closed race rejects stateful message fail-closed', () => {
  const result = decideConversation(
    at('m3'),
    { closedRaceIds: ['7'] },
    classifier({ intent: 'offer_player', risk: 'monetary', entities: { play: '2N', horse: '4', amount: 100 }, confidence: 0.99 })
  );
  assert.equal(result.decision, 'REJECTED');
  assert.equal(result.decisionReason, 'RACE_ALREADY_CLOSED');
});

test('out-of-order stateful message is held for review', () => {
  const result = decideConversation(
    at('m4', 'p1', 'cierra', '2026-08-29T11:59:00.000Z'),
    { lastTimestampByParticipant: { p1: '2026-08-29T12:00:00.000Z' } },
    classifier({ intent: 'race_close', risk: 'review', confidence: 0.99 })
  );
  assert.equal(result.decision, 'HELD_FOR_REVIEW');
  assert.equal(result.decisionReason, 'OUT_OF_ORDER_STATEFUL_MESSAGE');
});

test('participant context is isolated', () => {
  const context = {
    seenSourceMessageIds: ['p1-message'],
    lastTimestampByParticipant: { p1: '2026-08-29T13:00:00.000Z' }
  };
  const p2 = decideConversation(at('p2-message', 'p2', 'hola', '2026-08-29T12:00:00.000Z'), context);
  assert.equal(p2.audit.duplicate, false);
  assert.equal(p2.audit.outOfOrder, false);
  assert.equal(p2.decision, 'ACK_RECEIVED');
});

test('human-owned participant is silent to prevent double response', () => {
  const result = decideConversation(at('m6', 'P-ONE'), { humanOwnedParticipantIds: ['p-one'] });
  assert.equal(result.decision, 'NO_RESPONSE');
  assert.equal(result.decisionReason, 'HUMAN_OWNS_CONVERSATION');
});

test('unsupported media without text escalates', () => {
  const result = decideConversation({ ...at('m7'), text: '', mediaKind: 'audio' });
  assert.equal(result.decision, 'ESCALATED');
  assert.equal(result.responseIntent, 'ESCALATED');
});

test('state-changing classifier intent is only acknowledged for review', () => {
  const result = decideConversation(
    at('m8'),
    {},
    classifier({ intent: 'race_result', risk: 'review', confidence: 0.99, entities: { board: ['2', '4', '7'] } })
  );
  assert.equal(result.decision, 'HELD_FOR_REVIEW');
  assert.equal(result.effectsAllowed, false);
  assert.equal(result.transportAction, 'NONE');
  assert.match(result.responseText || '', /no se aplicó/i);
});

test('low-confidence stateful content is clarified instead of guessed', () => {
  const result = decideConversation(
    at('m9'),
    {},
    classifier({ intent: 'betting_or_balance', risk: 'monetary', confidence: 0.4 })
  );
  assert.equal(result.decision, 'NEEDS_CLARIFICATION');
  assert.equal(result.decisionReason, 'LOW_CONFIDENCE_STATEFUL_MESSAGE');
});
