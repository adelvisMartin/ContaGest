import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReplayMatch, canonicalReplaySignature, groupShadowReplaySignature, transportReplaySignature } from './hipico-replay-integrity.js';
import { __test__ as bridgeStoreTest } from './hipico-bridge-transport.store.js';

const transportBase={
  phoneNumberId:'group:120363111111111111@g.us',
  sender:'584121234567',
  messageType:'chat',
  body:'Juego 1N del 5 con 100k',
  payload:{
    sentAt:'2026-09-11T01:00:00-05:00',
    channelRole:'source',
    fromMe:false,
    hasMedia:false,
    mediaKind:'none',
    quotedExternalMessageId:'wamid-source-1'
  }
};

test('transport replay signature is stable for equivalent source metadata and timestamp instants', () => {
  const first = transportReplaySignature(transportBase);
  const replay = transportReplaySignature({
    ...transportBase,
    payload:{...transportBase.payload,sentAt:'2026-09-11T06:00:00.000Z'}
  });
  assert.equal(replay, first);
  assert.doesNotThrow(() => assertReplayMatch('transport', first, replay));
});

test('transport replay rejects altered body or immutable transport metadata', () => {
  const persisted = transportReplaySignature(transportBase);
  const forged=[
    transportReplaySignature({...transportBase,body:'Juego 1N del 5 con 900k'}),
    transportReplaySignature({...transportBase,payload:{...transportBase.payload,sentAt:'2026-09-11T06:00:01.000Z'}}),
    transportReplaySignature({...transportBase,payload:{...transportBase.payload,channelRole:'lab'}}),
    transportReplaySignature({...transportBase,payload:{...transportBase.payload,fromMe:true}}),
    transportReplaySignature({...transportBase,payload:{...transportBase.payload,hasMedia:true,mediaKind:'image'}}),
    transportReplaySignature({...transportBase,payload:{...transportBase.payload,quotedExternalMessageId:'wamid-source-2'}})
  ];
  for(const candidate of forged){
    assert.throws(() => assertReplayMatch('transport', persisted, candidate), (error: any) => error?.code === 'HIPICO_TRANSPORT_REPLAY_MISMATCH');
  }
});

test('transport store compares the persisted JSON payload before accepting a duplicate provider id',()=>{
  const existing={id:'evt-1',...transportBase,payload:{...transportBase.payload}} as any;
  const input={providerMessageId:'waweb:1',...transportBase,result:{intent:'offer_player',risk:'monetary',confidence:.9,suggestion:'revisar'}} as any;
  assert.doesNotThrow(()=>bridgeStoreTest.assertTransportReplay(existing,input));
  assert.throws(
    ()=>bridgeStoreTest.assertTransportReplay(existing,{...input,payload:{...input.payload,fromMe:true}}),
    (error:any)=>error?.code==='HIPICO_TRANSPORT_REPLAY_MISMATCH'
  );
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

test('group shadow replay signature still describes exact projection equality', () => {
  const persisted = groupShadowReplaySignature({ recipient: 'lab-group', message: 'Revisar jugada', intent: 'offer_player', risk: 'monetary' });
  const replay = groupShadowReplaySignature({ recipient: 'lab-group', message: 'Revisar jugada', intent: 'offer_player', risk: 'monetary' });
  assert.equal(replay, persisted);
  assert.doesNotThrow(() => assertReplayMatch('group-shadow', persisted, replay));
});

test('group shadow outbox tolerates derived classifier drift while preserving the first projection', () => {
  const existing = {
    id: 'hbo-1',
    recipient: 'lab-group'
  };
  const base = {
    eventId: 'event-1',
    recipient: 'lab-group',
    result: { suggestion: 'Revisar jugada', intent: 'offer_player', risk: 'monetary' }
  } as any;
  assert.doesNotThrow(() => bridgeStoreTest.assertGroupShadowDestination(existing, base));
  for (const derivedDrift of [
    { ...base, result: { ...base.result, suggestion: 'Mensaje alterado por nueva versión' } },
    { ...base, result: { ...base.result, intent: 'race_result' } },
    { ...base, result: { ...base.result, risk: 'review' } }
  ]) {
    assert.doesNotThrow(() => bridgeStoreTest.assertGroupShadowDestination(existing, derivedDrift));
  }
});

test('group shadow destination remains fail-closed on a duplicate event', () => {
  const existing = {
    id: 'hbo-1',
    recipient: 'lab-group'
  };
  const mutated = {
    eventId: 'event-1',
    recipient: 'source-group',
    result: { suggestion: 'Revisar jugada', intent: 'offer_player', risk: 'monetary' }
  } as any;
  assert.throws(
    () => bridgeStoreTest.assertGroupShadowDestination(existing, mutated),
    (error: any) => error?.code === 'HIPICO_TRANSPORT_REPLAY_MISMATCH'
  );
});
