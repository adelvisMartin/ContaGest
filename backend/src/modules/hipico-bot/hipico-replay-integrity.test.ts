import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReplayMatch, canonicalReplaySignature, groupShadowReplaySignature, transportReplaySignature } from './hipico-replay-integrity.js';
import { __test__ as bridgeStoreTest } from './hipico-bridge-transport.store.js';

test('transport replay signature is stable for equivalent nullable transport fields', () => {
  const first = transportReplaySignature({ phoneNumberId: 'group:g1', sender: '584121234567', messageType: 'chat', body: 'Juego 1N del 5 con 100k' });
  const replay = transportReplaySignature({ phoneNumberId: 'group:g1', sender: '584121234567', messageType: 'chat', body: 'Juego 1N del 5 con 100k' });
  assert.equal(replay, first);
  assert.doesNotThrow(() => assertReplayMatch('transport', first, replay));
});

test('transport replay with same provider id but altered body is rejected', () => {
  const persisted = transportReplaySignature({ phoneNumberId: 'group:g1', sender: '584121234567', messageType: 'chat', body: 'Juego 1N del 5 con 100k' });
  const forged = transportReplaySignature({ phoneNumberId: 'group:g1', sender: '584121234567', messageType: 'chat', body: 'Juego 1N del 5 con 900k' });
  assert.throws(() => assertReplayMatch('transport', persisted, forged), (error: any) => error?.code === 'HIPICO_TRANSPORT_REPLAY_MISMATCH');
});

test('canonical replay binds sender timestamp type body and quoted source id', () => {
  const persisted = canonicalReplaySignature({
    sender: '584121234567',
    sentAt: '2026-09-11T01:00:00-05:00',
    messageType: 'chat',
    body: 'J',
    quotedExternalMessageId: 'wamid-source-1'
  });
  const sameInstant = canonicalReplaySignature({
    sender: '584121234567',
    sentAt: new Date('2026-09-11T06:00:00.000Z'),
    messageType: 'chat',
    body: 'J',
    quotedExternalMessageId: 'wamid-source-1'
  });
  assert.equal(sameInstant, persisted);
});

test('canonical replay rejects changed sender, text or quoted context', () => {
  const persisted = canonicalReplaySignature({ sender: '584121234567', sentAt: '2026-09-11T06:00:00.000Z', messageType: 'chat', body: '30k', quotedExternalMessageId: 'source-1' });
  const changed = [
    canonicalReplaySignature({ sender: '584129999999', sentAt: '2026-09-11T06:00:00.000Z', messageType: 'chat', body: '30k', quotedExternalMessageId: 'source-1' }),
    canonicalReplaySignature({ sender: '584121234567', sentAt: '2026-09-11T06:00:00.000Z', messageType: 'chat', body: '300k', quotedExternalMessageId: 'source-1' }),
    canonicalReplaySignature({ sender: '584121234567', sentAt: '2026-09-11T06:00:00.000Z', messageType: 'chat', body: '30k', quotedExternalMessageId: 'source-2' })
  ];
  for (const candidate of changed) {
    assert.throws(() => assertReplayMatch('canonical', persisted, candidate), (error: any) => error?.code === 'HIPICO_CANONICAL_REPLAY_MISMATCH');
  }
});

test('group shadow replay signature binds recipient message intent and risk', () => {
  const persisted = groupShadowReplaySignature({ recipient: 'lab-group', message: 'Revisar jugada', intent: 'offer_player', risk: 'monetary' });
  const replay = groupShadowReplaySignature({ recipient: 'lab-group', message: 'Revisar jugada', intent: 'offer_player', risk: 'monetary' });
  assert.equal(replay, persisted);
  assert.doesNotThrow(() => assertReplayMatch('group-shadow', persisted, replay));
});

test('group shadow outbox rejects a duplicate event with mutated projection', () => {
  const existing = {
    id: 'hbo-1',
    recipient: 'lab-group',
    message: 'Revisar jugada',
    intent: 'offer_player',
    risk: 'monetary'
  };
  const base = {
    eventId: 'event-1',
    recipient: 'lab-group',
    result: { suggestion: 'Revisar jugada', intent: 'offer_player', risk: 'monetary' }
  } as any;
  assert.doesNotThrow(() => bridgeStoreTest.assertGroupShadowReplay(existing, base));
  for (const mutated of [
    { ...base, recipient: 'source-group' },
    { ...base, result: { ...base.result, suggestion: 'Mensaje alterado' } },
    { ...base, result: { ...base.result, intent: 'race_result' } },
    { ...base, result: { ...base.result, risk: 'review' } }
  ]) {
    assert.throws(
      () => bridgeStoreTest.assertGroupShadowReplay(existing, mutated),
      (error: any) => error?.code === 'HIPICO_GROUP_SHADOW_OUTBOX_REPLAY_MISMATCH'
    );
  }
});

test('group shadow replay mismatch is mapped to the transport quarantine code at the route boundary', () => {
  const existing = {
    id: 'hbo-1',
    recipient: 'lab-group',
    message: 'Revisar jugada',
    intent: 'offer_player',
    risk: 'monetary'
  };
  const mutated = {
    eventId: 'event-1',
    recipient: 'source-group',
    result: { suggestion: 'Revisar jugada', intent: 'offer_player', risk: 'monetary' }
  } as any;
  assert.throws(
    () => bridgeStoreTest.assertGroupShadowReplayAtTransportBoundary(existing, mutated),
    (error: any) => error?.code === 'HIPICO_TRANSPORT_REPLAY_MISMATCH'
  );
});
