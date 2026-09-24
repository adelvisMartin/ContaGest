import assert from 'node:assert/strict';
import test from 'node:test';
import { decideConversation, nextConversationContext } from './hipico-conversation-engine.js';
import type { IntentResult } from './hipico-operational-classifier.js';

const RACE_KEY='racectx_test_track_7';
const at = (id: string, participantId = 'p1', text = 'hola', timestamp = '2026-08-29T12:00:00.000Z') => ({
  sourceMessageId: id,
  participantId,
  text,
  timestamp,
  raceId: RACE_KEY
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
    { closedRaceIds: [RACE_KEY] },
    classifier({ intent: 'offer_player', risk: 'monetary', entities: { play: '2N', horse: '4', amount: 100 }, confidence: 0.99 })
  );
  assert.equal(result.decision, 'REJECTED');
  assert.equal(result.decisionReason, 'RACE_ALREADY_CLOSED');
});

test('classifier race number never invents a race identity when context resolver supplied none', () => {
  const result=decideConversation(
    {...at('m-race'),raceId:null},
    {},
    classifier({intent:'race_result',risk:'review',confidence:.99,entities:{racetrack:'Churchill Downs',raceNumber:7,board:['1','2']}})
  );
  assert.equal(result.raceId,null);
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

test('human ownership is canonicalized on both message and context sides', () => {
  const result = decideConversation(at('m6-context-case', 'p-one'), { humanOwnedParticipantIds: ['  P-ONE  '] });
  assert.equal(result.decision, 'NO_RESPONSE');
  assert.equal(result.decisionReason, 'HUMAN_OWNS_CONVERSATION');
  assert.equal(result.transportAction, 'NONE');
  assert.equal(result.effectsAllowed, false);
});

test('unsupported media asks for text before considering human handoff', () => {
  const result = decideConversation({ ...at('m7'), text: '', mediaKind: 'audio' });
  assert.equal(result.decision, 'NEEDS_CLARIFICATION');
  assert.equal(result.decisionReason, 'MEDIA_TEXT_REQUIRED');
  assert.equal(result.responseIntent, 'NEEDS_CLARIFICATION');
  assert.equal(result.classifierIntent, 'media_message');
  assert.equal(result.effectsAllowed, false);
});

test('media caption cannot impersonate a result or invoke the text classifier', () => {
  let classifierCalls=0;
  const result=decideConversation(
    {...at('media-caption','p1','Llegada 1.2.8.7'),mediaKind:'image'},
    {},
    () => {
      classifierCalls+=1;
      return {intent:'race_result',risk:'review',confidence:.999,suggestion:'',autoEligible:false,reason:'SHOULD_NOT_RUN',entities:{board:['1','2','8','7']}};
    }
  );
  assert.equal(classifierCalls,0);
  assert.equal(result.decision,'NEEDS_CLARIFICATION');
  assert.equal(result.decisionReason,'MEDIA_TEXT_REQUIRED');
  assert.equal(result.classifierIntent,'media_message');
  assert.equal(result.audit.monetaryOrStateful,false);
  assert.equal(result.effectsAllowed,false);
  assert.equal(result.transportAction,'NONE');
});

test('PDF filename/caption remains document evidence instead of a race opening', () => {
  const result=decideConversation({...at('pdf-caption','p1','Churchill Downs 5ta carrera abierta.pdf'),raceId:null,mediaKind:'document'});
  assert.equal(result.decision,'NEEDS_CLARIFICATION');
  assert.equal(result.classifierIntent,'document_reference');
  assert.equal(result.decisionReason,'MEDIA_TEXT_REQUIRED');
  assert.equal(result.effectsAllowed,false);
});

test('race result gets an operational pilot acknowledgement without applying state', () => {
  const result = decideConversation(
    at('m8'),
    {},
    classifier({ intent: 'race_result', risk: 'review', confidence: 0.99, entities: { raceNumber: 7, board: ['2', '4', '7'] } })
  );
  assert.equal(result.decision, 'HELD_FOR_REVIEW');
  assert.equal(result.effectsAllowed, false);
  assert.equal(result.transportAction, 'NONE');
  assert.match(result.responseText || '', /Llegada detectada/i);
  assert.match(result.responseText || '', /2\.4\.7\.\./);
  assert.match(result.responseText || '', /validará contra la carrera activa/i);
});

test('explicit race opening is stateful, precise and still fail-closed', () => {
  const result = decideConversation(
    { ...at('open-1'), raceId: null, text: 'Se aperturó Churchill Down, 1ra Carrera' },
    {},
    classifier({ intent: 'race_open', risk: 'review', confidence: 0.995, entities: { racetrack: 'Churchill Downs', raceNumber: 1, raceContextComplete: true } })
  );
  assert.equal(result.decision, 'HELD_FOR_REVIEW');
  assert.equal(result.audit.monetaryOrStateful, true);
  assert.equal(result.effectsAllowed, false);
  assert.match(result.responseText || '', /Churchill Downs, 1ra Carrera/i);
  assert.match(result.responseText || '', /no se modificaron saldos/i);
});

test('ambiguous race opening asks for track and race number', () => {
  const result = decideConversation(
    { ...at('open-2'), raceId: null, text: 'Se aperturó la carrera' },
    {},
    classifier({ intent: 'race_open', risk: 'review', confidence: 0.86, entities: { racetrack: '', raceNumber: null, raceContextComplete: false } })
  );
  assert.equal(result.decision, 'NEEDS_CLARIFICATION');
  assert.equal(result.decisionReason, 'RACE_OPEN_CONTEXT_INCOMPLETE');
  assert.match(result.responseText || '', /hipódromo o número/i);
  assert.equal(result.effectsAllowed, false);
});

test('complete offer echoes exact operational fields but never changes balance', () => {
  const result = decideConversation(
    { ...at('offer-1', 'p-zedan', 'Juego 3n del 1 con 30000'), participantLabel: 'Zedan' },
    {},
    classifier({ intent: 'offer_player', risk: 'monetary', confidence: 0.99, entities: { role: 'player', play: '3N', horse: '1', amount: 30000 } })
  );
  assert.equal(result.decision, 'HELD_FOR_REVIEW');
  assert.equal(result.decisionReason, 'OFFER_REQUIRES_COUNTERPARTY_OR_REVIEW');
  assert.match(result.responseText || '', /JUEGA Zedan 3N \(1\) con 30\.000,00/i);
  assert.match(result.responseText || '', /Pendiente de contraparte/i);
  assert.equal(result.effectsAllowed, false);
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