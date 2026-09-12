import assert from 'node:assert/strict';
import test from 'node:test';
import { decideConversation } from './hipico-conversation-engine.js';
import { initialHipicoState, reduceHipicoDomainEvent } from './hipico-domain-state.js';

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const alphabet = 'abcXYZ 0123456789$.,/-🙂\n';
function randomText(random: () => number, max = 180) {
  const length = Math.floor(random() * max);
  let output = '';
  for (let index = 0; index < length; index += 1) output += alphabet[Math.floor(random() * alphabet.length)];
  return output;
}

test('property: 2000 deterministic conversation iterations never grant effects', () => {
  const random = seeded(1502026);
  for (let index = 0; index < 2000; index += 1) {
    const message = {
      sourceMessageId: `property-${index}`,
      participantId: `p-${Math.floor(random() * 17)}`,
      text: randomText(random),
      timestamp: new Date(Date.parse('2026-08-29T12:00:00.000Z') + index * 1000).toISOString(),
      raceId: String(1 + (index % 24))
    };
    const context = { closedRaceIds: index % 17 === 0 ? [message.raceId] : [] };
    const first = decideConversation(message, context);
    const second = decideConversation(message, context);
    assert.deepEqual(second, first);
    assert.equal(first.effectsAllowed, false);
    assert.equal(first.transportAction, 'NONE');
    assert.match(first.correlationId, /^conv_[a-f0-9]{24}$/);
  }
});

test('property: 2000 domain replays are deterministic and duplicate-safe', () => {
  const random = seeded(12092026);
  const eventTypes = ['BET_RECORDED', 'UNKNOWN', 'AMBIGUOUS', 'CORRECTION', 'REVERSAL'] as const;
  for (let index = 0; index < 2000; index += 1) {
    const state = initialHipicoState('race');
    const event = {
      type: eventTypes[Math.floor(random() * eventTypes.length)],
      sourceMessageKey: `domain-property-${index}`,
      normalizedPayload: { groupKey: `g-${index % 11}`, sample: Math.floor(random() * 100000) }
    };
    const first = reduceHipicoDomainEvent(state, event);
    const second = reduceHipicoDomainEvent(state, event);
    assert.deepEqual(second, first);
    const replay = reduceHipicoDomainEvent(first.state, event);
    assert.equal(replay.disposition, 'duplicate');
    assert.equal(replay.nextState, first.nextState);
    assert.equal(replay.state.stateVersion, first.state.stateVersion);
  }
});
