import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { WhatsAppWebAdapter } from '../src/channels/whatsapp-web-adapter.mjs';

const SOURCE = '120363111111111111@g.us';
const LAB = '120363222222222222@g.us';

function fakeRuntime({ inbound = [] } = {}) {
  const calls = [];
  const page = { isClosed: () => false };
  const context = {
    pages: () => [page],
    close: async () => calls.push('context.close')
  };
  const chromium = {
    launchPersistentContext: async (profileDir, options) => {
      calls.push(['launch', profileDir, options]);
      return context;
    }
  };
  const dom = {
    ensureWhatsApp: async () => calls.push('ensureWhatsApp'),
    openGroup: async (name) => (calls.push(['openGroup', name]), true),
    currentGroupId: async () => LAB,
    sendText: async (text) => (calls.push(['sendText', text]), true),
    readInbound: async () => inbound
  };
  return { calls, chromium, page, context, domFactory: () => dom };
}

test('WhatsAppWebAdapter owns browser lifecycle and connect/disconnect are idempotent', async () => {
  const runtime = fakeRuntime();
  const adapter = new WhatsAppWebAdapter({
    chromium: runtime.chromium,
    profileDir: 'profile-dir',
    sourceGroupId: SOURCE,
    labGroupId: LAB,
    sourceGroupName: 'SOURCE',
    labGroupName: 'LAB',
    domFactory: runtime.domFactory
  });
  const first = await adapter.connect();
  const second = await adapter.connect();
  assert.equal(first.connected, true);
  assert.equal(second.connected, true);
  assert.equal(runtime.calls.filter((entry) => Array.isArray(entry) && entry[0] === 'launch').length, 1);
  await adapter.disconnect();
  await adapter.disconnect();
  assert.equal(runtime.calls.filter((entry) => entry === 'context.close').length, 1);
});

test('WhatsAppWebAdapter receive emits transport-only envelopes with history/replay flags intact', async () => {
  const runtime = fakeRuntime({ inbound: [{
    externalMessageId: 'wamid-1',
    text: '30k',
    historySync: true,
    fromMe: true,
    hasMedia: true,
    mediaKind: 'document',
    quoteDepth: 2
  }] });
  const adapter = new WhatsAppWebAdapter({
    chromium: runtime.chromium,
    profileDir: 'profile-dir',
    sourceGroupId: SOURCE,
    labGroupId: LAB,
    sourceGroupName: 'SOURCE',
    labGroupName: 'LAB',
    domFactory: runtime.domFactory
  });
  const received = [];
  adapter.receive((event) => received.push(event));
  await adapter.connect();
  await adapter.poll();
  assert.equal(received.length, 1);
  assert.equal(received[0].historySync, true);
  assert.equal(received[0].fromMe, true);
  assert.equal(received[0].hasMedia, true);
  assert.equal(received[0].quoteDepth, 2);
  assert.equal(received[0].effectsAllowed, false);
  assert.equal(received[0].transportAction, 'NONE');
  assert.equal('classification' in received[0], false);
});

test('WhatsAppWebAdapter has no SOURCE send path and LAB send is fail-closed on pin mismatch', async () => {
  const runtime = fakeRuntime();
  const adapter = new WhatsAppWebAdapter({
    chromium: runtime.chromium,
    profileDir: 'profile-dir',
    sourceGroupId: SOURCE,
    labGroupId: LAB,
    sourceGroupName: 'SOURCE',
    labGroupName: 'LAB',
    labSendEnabled: true,
    domFactory: runtime.domFactory
  });
  await adapter.connect();
  await assert.rejects(
    adapter.send({ destinationRole: 'source', text: 'NO' }),
    (error) => error?.code === 'HIPICO_SOURCE_SEND_FORBIDDEN'
  );
  const sent = await adapter.send({ destinationRole: 'lab', text: 'SIMULACION' });
  assert.equal(sent.accepted, true);
  assert.equal(sent.destinationRole, 'lab');
  assert.equal(runtime.calls.some((entry) => Array.isArray(entry) && entry[0] === 'sendText'), true);

  runtime.domFactory = () => ({
    ...runtime.domFactory?.(),
    ensureWhatsApp: async () => {},
    openGroup: async () => true,
    currentGroupId: async () => SOURCE,
    sendText: async () => true,
    readInbound: async () => []
  });
  const wrongPin = new WhatsAppWebAdapter({
    chromium: runtime.chromium,
    profileDir: 'profile-dir-2',
    sourceGroupId: SOURCE,
    labGroupId: LAB,
    sourceGroupName: 'SOURCE',
    labGroupName: 'LAB',
    labSendEnabled: true,
    domFactory: () => ({
      ensureWhatsApp: async () => {},
      openGroup: async () => true,
      currentGroupId: async () => SOURCE,
      sendText: async () => true,
      readInbound: async () => []
    })
  });
  await wrongPin.connect();
  await assert.rejects(
    wrongPin.send({ destinationRole: 'lab', text: 'SIMULACION' }),
    (error) => error?.code === 'HIPICO_LAB_ID_MISMATCH'
  );
});

test('WhatsAppWebAdapter refuses colliding SOURCE/LAB pins and status does not expose raw IDs', async () => {
  const runtime = fakeRuntime();
  assert.throws(() => new WhatsAppWebAdapter({
    chromium: runtime.chromium,
    profileDir: 'profile-dir',
    sourceGroupId: SOURCE,
    labGroupId: SOURCE,
    sourceGroupName: 'SOURCE',
    labGroupName: 'LAB',
    domFactory: runtime.domFactory
  }), (error) => error?.code === 'HIPICO_CHANNEL_GROUP_COLLISION');

  const adapter = new WhatsAppWebAdapter({
    chromium: runtime.chromium,
    profileDir: 'profile-dir',
    sourceGroupId: SOURCE,
    labGroupId: LAB,
    sourceGroupName: 'SOURCE',
    labGroupName: 'LAB',
    domFactory: runtime.domFactory
  });
  const status = JSON.stringify(adapter.status());
  assert.doesNotMatch(status, new RegExp(SOURCE.replace('.', '\\.')));
  assert.doesNotMatch(status, new RegExp(LAB.replace('.', '\\.')));
  assert.match(status, /sourceSendPossible/);
});

test('WhatsApp adapter source contains transport/DOM only and no business classifier/reducer/settlement imports', () => {
  const source = readFileSync(new URL('../src/channels/whatsapp-web-adapter.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /classif(?:y|ier)|conversation-engine|domain-state|settlement|balance|ledger/i);
  assert.match(source, /sourceSendPossible:\s*false/);
});
