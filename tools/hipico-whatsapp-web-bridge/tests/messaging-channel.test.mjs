import assert from 'node:assert/strict';
import test from 'node:test';

import { assertMessagingChannel } from '../src/channels/messaging-channel.mjs';
import { TestChannelAdapter } from '../src/channels/test-channel-adapter.mjs';

const sourceEvent = (overrides = {}) => ({
  externalMessageId: 'wamid-source-1',
  channelRole: 'source',
  shadowMode: true,
  historySync: false,
  fromMe: false,
  hasMedia: false,
  mediaKind: 'none',
  timestamp: '2026-09-13T20:00:00.000Z',
  type: 'chat',
  text: 'Juega 1N al 5 con 100k',
  quoteDepth: 0,
  ...overrides
});

test('MessagingChannel contract requires all five transport operations', () => {
  const complete = {
    connect() {},
    disconnect() {},
    status() {},
    receive() {},
    send() {}
  };
  assert.equal(assertMessagingChannel(complete), complete);
  for (const method of ['connect', 'disconnect', 'status', 'receive', 'send']) {
    const invalid = { ...complete, [method]: undefined };
    assert.throws(() => assertMessagingChannel(invalid), (error) => error?.code === 'HIPICO_CHANNEL_CONTRACT_INVALID');
  }
});

test('TestChannelAdapter delivers seeded inbound events deterministically once', async () => {
  const events = [
    sourceEvent({ externalMessageId: 'm1' }),
    sourceEvent({ externalMessageId: 'm2', historySync: true }),
    sourceEvent({ externalMessageId: 'm3', hasMedia: true, mediaKind: 'image', type: 'media' })
  ];
  const adapter = new TestChannelAdapter({ role: 'source', events });
  assertMessagingChannel(adapter);
  const received = [];
  adapter.receive((event) => received.push(event));

  const first = await adapter.connect();
  const second = await adapter.connect();

  assert.equal(first.connected, true);
  assert.equal(second.connected, true);
  assert.deepEqual(received.map((event) => event.externalMessageId), ['m1', 'm2', 'm3']);
  assert.equal(received[1].historySync, true);
  assert.equal(received[2].mediaKind, 'image');
  assert.equal(adapter.status().delivered, 3);
});

test('TestChannelAdapter connect/disconnect are idempotent and status is secret-free', async () => {
  const adapter = new TestChannelAdapter({ role: 'lab' });
  await adapter.connect();
  await adapter.connect();
  await adapter.disconnect();
  await adapter.disconnect();
  const status = adapter.status();
  assert.deepEqual(status, {
    channel: 'test',
    role: 'lab',
    connected: false,
    queued: 0,
    delivered: 0,
    sent: 0
  });
  const serialized = JSON.stringify(status).toLowerCase();
  assert.doesNotMatch(serialized, /token|secret|password|authorization|@g\.us/);
});

test('TestChannelAdapter is fail-closed for SOURCE sends and only records LAB sends', async () => {
  const source = new TestChannelAdapter({ role: 'source' });
  await source.connect();
  await assert.rejects(
    source.send({ text: 'NO ENVIAR', destinationRole: 'source' }),
    (error) => error?.code === 'HIPICO_SOURCE_SEND_FORBIDDEN'
  );
  assert.equal(source.status().sent, 0);

  const lab = new TestChannelAdapter({ role: 'lab' });
  await lab.connect();
  const sent = await lab.send({ text: 'SIMULACION', destinationRole: 'lab' });
  assert.equal(sent.accepted, true);
  assert.equal(sent.destinationRole, 'lab');
  assert.equal(lab.status().sent, 1);

  await assert.rejects(
    lab.send({ text: 'NO SOURCE', destinationRole: 'source' }),
    (error) => error?.code === 'HIPICO_SOURCE_SEND_FORBIDDEN'
  );
  assert.equal(lab.status().sent, 1);
});

test('inbound historySync and replay-relevant flags are preserved without granting effects', async () => {
  const adapter = new TestChannelAdapter({ role: 'source' });
  const received = [];
  adapter.receive((event) => received.push(event));
  await adapter.connect();
  await adapter.pushInbound(sourceEvent({
    externalMessageId: 'history-1',
    historySync: true,
    fromMe: true,
    quoteDepth: 2,
    hasMedia: true,
    mediaKind: 'document',
    type: 'media'
  }));

  assert.equal(received.length, 1);
  assert.equal(received[0].historySync, true);
  assert.equal(received[0].fromMe, true);
  assert.equal(received[0].quoteDepth, 2);
  assert.equal(received[0].hasMedia, true);
  assert.equal(received[0].effectsAllowed, false);
  assert.equal(received[0].transportAction, 'NONE');
});
