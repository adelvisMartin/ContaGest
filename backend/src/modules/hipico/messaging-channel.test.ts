import test from 'node:test';
import assert from 'node:assert/strict';
import { TestChannelAdapter } from './messaging-channel.js';

function message(overrides: Record<string, unknown> = {}) {
  return {
    channel: 'test',
    groupId: 'source-group',
    externalMessageId: 'message-1',
    senderId: 'participant-1',
    senderLabel: 'Participante',
    sentAt: '2026-09-13T10:00:00.000-05:00',
    type: 'chat',
    text: 'hola',
    quotedExternalMessageId: null,
    historySync: false,
    fromMe: false,
    hasMedia: false,
    mediaKind: 'none',
    ...overrides
  };
}

test('TestChannelAdapter reuses the canonical message contract including mediaKind/historySync', async () => {
  const channel = new TestChannelAdapter('test', new Set(['source-group']));
  const received: any[] = [];
  channel.receive((value) => received.push(value));
  await channel.connect();

  const result = await channel.inject(message({ historySync: true, hasMedia: true, type: 'media', mediaKind: 'image' }));
  assert.equal(result.duplicate, false);
  assert.equal(received.length, 1);
  assert.equal(received[0].historySync, true);
  assert.equal(received[0].mediaKind, 'image');
  assert.equal(channel.sent.length, 0, 'receiving history must never auto-send');
  assert.equal((await channel.status()).effectsAllowed, false);
});

test('history/live replay is deduplicated by canonical channel + group + external message identity', async () => {
  const channel = new TestChannelAdapter();
  let calls = 0;
  channel.receive(() => { calls += 1; });
  await channel.connect();

  const first = await channel.inject(message({ historySync: true }));
  const duplicate = await channel.inject(message({ historySync: true }));
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(calls, 1);
  assert.equal(channel.sent.length, 0);
});

test('failed deterministic ingestion releases its replay reservation for an explicit retry', async () => {
  const channel = new TestChannelAdapter();
  let calls = 0;
  channel.receive(() => {
    calls += 1;
    if (calls === 1) throw new Error('fixture failure');
  });
  await channel.connect();

  await assert.rejects(channel.inject(message()), /fixture failure/);
  const retried = await channel.inject(message());
  assert.equal(retried.duplicate, false);
  assert.equal(calls, 2);
});

test('group allowlist and channel identity fail closed', async () => {
  const channel = new TestChannelAdapter('test', new Set(['source-group', 'lab-group']));
  await channel.connect();
  await assert.rejects(channel.inject(message({ groupId: 'unknown-group' })), /TEST_CHANNEL_GROUP_NOT_ALLOWED/);
  await assert.rejects(channel.inject(message({ channel: 'whatsapp-web' })), /TEST_CHANNEL_IDENTITY_MISMATCH/);
  await assert.rejects(channel.send('unknown-group', 'hola'), /TEST_CHANNEL_GROUP_NOT_ALLOWED/);
});

test('send is always an explicit caller action and produces deterministic test ids', async () => {
  const channel = new TestChannelAdapter('test', new Set(['lab-group']));
  await channel.connect();
  assert.deepEqual(await channel.send('lab-group', 'respuesta'), { accepted: true, externalMessageId: 'test-1' });
  assert.deepEqual(channel.sent, [{ groupId: 'lab-group', text: 'respuesta', externalMessageId: 'test-1' }]);
});
