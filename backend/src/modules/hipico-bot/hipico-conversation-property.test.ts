import assert from 'node:assert/strict';
import test from 'node:test';
import { decideConversation } from './hipico-conversation-engine.js';

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

test('property: 2000 seeded input/context cases are deterministic and never grant effects', () => {
  const random = seeded(1502026);
  for (let index = 0; index < 2000; index += 1) {
    const message = {
      sourceMessageId: `property-${index}`,
      participantId: `p-${Math.floor(random() * 23)}`,
      text: randomText(random),
      timestamp: new Date(Date.parse('2026-08-29T12:00:00.000Z') + index * 1000).toISOString(),
      raceId: String(1 + (index % 18))
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
