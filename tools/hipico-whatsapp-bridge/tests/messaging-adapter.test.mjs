import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WhatsAppWebAdapter } from '../src/whatsapp-web-adapter.mjs';
import { shouldSendLabSimulation } from '../src/delivery-policy.mjs';

class FakeClient extends EventEmitter {
  constructor() {
    super();
    this.initializeCalls = 0;
    this.destroyCalls = 0;
    this.sent = [];
  }

  async initialize() {
    this.initializeCalls += 1;
  }

  async destroy() {
    this.destroyCalls += 1;
  }

  async sendMessage(groupId, text) {
    this.sent.push({ groupId, text });
    return { id: { _serialized: `out-${this.sent.length}` } };
  }
}

function message(overrides = {}) {
  return {
    id: { _serialized: 'message-1' },
    from: 'source@g.us',
    to: 'self@c.us',
    author: 'participant@c.us',
    fromMe: false,
    timestamp: 1789293600,
    body: 'hola',
    type: 'chat',
    hasMedia: false,
    hasQuotedMsg: false,
    async getContact() { return { pushname: 'Participante' }; },
    ...overrides
  };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('WhatsAppWebAdapter normalizes only allowlisted inbound groups', async () => {
  const client = new FakeClient();
  const adapter = new WhatsAppWebAdapter({
    client,
    allowedGroups: new Set(['source@g.us', 'lab@g.us']),
    includeOwnMessages: true,
    allowSend: false
  });
  const received = [];
  adapter.receive((value) => received.push(value));
  await adapter.connect();
  client.emit('ready');

  client.emit('message_create', message());
  client.emit('message_create', message({ id: { _serialized: 'ignored' }, from: 'other@g.us' }));
  await settle();

  assert.equal(received.length, 1);
  assert.deepEqual(received[0], {
    channel: 'whatsapp-web',
    groupId: 'source@g.us',
    externalMessageId: 'message-1',
    senderId: 'participant@c.us',
    senderLabel: 'Participante',
    sentAt: new Date(1789293600 * 1000).toISOString(),
    type: 'chat',
    text: 'hola',
    quotedExternalMessageId: null,
    historySync: false,
    fromMe: false,
    hasMedia: false,
    mediaKind: 'none'
  });
});

test('WhatsAppWebAdapter keeps DOM/session effects behind explicit connect/disconnect/send', async () => {
  const client = new FakeClient();
  const adapter = new WhatsAppWebAdapter({
    client,
    allowedGroups: new Set(['lab@g.us']),
    allowSend: true
  });
  adapter.receive(() => undefined);

  assert.equal((await adapter.status()).state, 'disconnected');
  await adapter.connect();
  assert.equal(client.initializeCalls, 1);
  client.emit('ready');
  assert.equal((await adapter.status()).state, 'connected');

  assert.deepEqual(await adapter.send('lab@g.us', 'respuesta'), {
    accepted: true,
    externalMessageId: 'out-1'
  });
  await assert.rejects(adapter.send('other@g.us', 'no'), /WHATSAPP_CHANNEL_GROUP_NOT_ALLOWED/);

  await adapter.disconnect();
  assert.equal(client.destroyCalls, 1);
  assert.equal((await adapter.status()).state, 'disconnected');
});

test('WhatsAppWebAdapter fails closed when outbound effects are disabled', async () => {
  const client = new FakeClient();
  const adapter = new WhatsAppWebAdapter({
    client,
    allowedGroups: new Set(['lab@g.us']),
    allowSend: false
  });
  adapter.receive(() => undefined);
  await adapter.connect();
  client.emit('ready');

  assert.deepEqual(await adapter.send('lab@g.us', 'respuesta'), {
    accepted: false,
    externalMessageId: null
  });
  assert.equal(client.sent.length, 0);
});

test('history replay and duplicate backend results can never auto-send to LAB', () => {
  assert.equal(shouldSendLabSimulation({ channelRole: 'source', historySync: false }, { duplicate: false }), true);
  assert.equal(shouldSendLabSimulation({ channelRole: 'source', historySync: true }, { duplicate: false }), false);
  assert.equal(shouldSendLabSimulation({ channelRole: 'source', historySync: false }, { duplicate: true }), false);
  assert.equal(shouldSendLabSimulation({ channelRole: 'lab', historySync: false }, { duplicate: false }), false);
});
