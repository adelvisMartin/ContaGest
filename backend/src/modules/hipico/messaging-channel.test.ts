import test from 'node:test';
import assert from 'node:assert/strict';
import { TestChannelAdapter } from './messaging-channel.js';

function message(overrides: Record<string, unknown> = {}) {
  return {
    channel: 'test',
    groupId: '120363111111111111@g.us',
    externalMessageId: 'm1',
    senderId: 'p1',
    sentAt: '2026-09-12T12:00:00.000Z',
    type: 'chat',
    text: 'hola',
    historySync: false,
    fromMe: false,
    hasMedia: false,
    mediaKind: 'none',
    ...overrides
  };
}

void test('TestChannelAdapter injects canonical normalized messages deterministically', async () => {
  const channel = new TestChannelAdapter();
  const received: string[] = [];
  channel.receive((item) => received.push(item.externalMessageId));
  await channel.connect();
  await channel.inject(message());
  assert.deepEqual(received, ['m1']);
  assert.deepEqual(await channel.status(), { state: 'connected', channel: 'test' });
});

void test('history-sync ingress is preserved and cannot auto-send', async () => {
  const channel = new TestChannelAdapter();
  const received: boolean[] = [];
  channel.receive((item) => received.push(item.historySync));
  await channel.connect();
  await channel.inject(message({ externalMessageId: 'history-1', historySync: true }));
  assert.deepEqual(received, [true]);
  assert.deepEqual(channel.sent, []);
});

void test('TestChannelAdapter records only explicit sends and rejects invalid messages', async () => {
  const channel = new TestChannelAdapter();
  await channel.connect();
  assert.deepEqual(await channel.send('g1', 'respuesta'), { accepted: true, externalMessageId: 'test-1' });
  assert.deepEqual(channel.sent, [{ groupId: 'g1', text: 'respuesta' }]);
  await assert.rejects(channel.inject(message({ externalMessageId: '' })));
});
