import assert from 'node:assert/strict';
import test from 'node:test';
import { TestChannelAdapter, type NormalizedChannelMessage } from './hipico-test-channel.js';

function message(id = 'message-1'): NormalizedChannelMessage {
  return {
    channel: 'e2e',
    groupId: 'group-a',
    externalMessageId: id,
    senderId: '584121234567',
    senderLabel: 'Operador E2E',
    sentAt: '2026-09-12T15:00:00.000Z',
    type: 'text',
    text: 'estatus',
    quotedExternalMessageId: null,
    historySync: false,
    fromMe: false,
    hasMedia: false
  };
}

test('TestChannelAdapter fails closed while disconnected and preserves normalized message identity', async () => {
  const channel = new TestChannelAdapter('e2e');
  await assert.rejects(channel.inject(message()), /TEST_CHANNEL_NOT_CONNECTED/);
  await assert.rejects(channel.send('group-a', 'respuesta'), /TEST_CHANNEL_NOT_CONNECTED/);
  assert.deepEqual(await channel.status(), { state: 'disconnected', channel: 'e2e' });

  const received: NormalizedChannelMessage[] = [];
  const unsubscribe = channel.receive((input) => { received.push(input); });
  await channel.connect();
  assert.deepEqual(await channel.status(), { state: 'connected', channel: 'e2e' });
  await channel.inject(message());
  assert.equal(received.length, 1);
  assert.deepEqual(received[0], message());

  const sent = await channel.send('group-a', 'respuesta');
  assert.equal(sent.accepted, true);
  assert.match(String(sent.externalMessageId), /^test-/);
  assert.deepEqual(channel.sent, [{ groupId: 'group-a', text: 'respuesta' }]);

  unsubscribe();
  await channel.inject(message('message-2'));
  assert.equal(received.length, 1);
  await channel.disconnect();
});

test('TestChannelAdapter rejects empty destinations and messages', async () => {
  const channel = new TestChannelAdapter();
  await channel.connect();
  await assert.rejects(channel.send('', 'respuesta'), /TEST_CHANNEL_INVALID_SEND/);
  await assert.rejects(channel.send('group-a', '   '), /TEST_CHANNEL_INVALID_SEND/);
  await channel.disconnect();
});
