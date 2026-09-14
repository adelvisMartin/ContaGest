import test from 'node:test';
import assert from 'node:assert/strict';
import { __test__ } from '../frontend/api/hipico/group-bridge-ingest.js';

const identity={
  HIPICO_SOURCE_GROUP_ID:'120363000000000001@g.us',
  HIPICO_LAB_GROUP_ID:'120363000000000002@g.us',
  HIPICO_SOURCE_CHANNEL_KEY:'club-hipico-triple-crown-official',
  HIPICO_LAB_CHANNEL_KEY:'control-hipico-lab'
};
const base={
  bridgeVersion:'1.4.2',
  externalMessageId:'wamid-297-flags',
  groupId:identity.HIPICO_SOURCE_GROUP_ID,
  groupName:'Grupo fuente',
  channelKey:identity.HIPICO_SOURCE_CHANNEL_KEY,
  labChannelKey:identity.HIPICO_LAB_CHANNEL_KEY,
  channelRole:'source',
  shadowMode:true,
  senderId:'584121234567',
  timestamp:'2026-09-11T06:00:00.000Z',
  type:'chat',
  mediaKind:'none',
  text:'Juego 1N del 5 con 100k',
  quotedExternalMessageId:'origin-1',
  fromMe:false,
  hasMedia:false
};

test('serverless bridge accepts only explicit ISO-8601 timestamps with timezone and valid calendar fields',()=>{
  assert.equal(__test__.normalizedTimestamp('2026-09-11T06:00:00Z'),'2026-09-11T06:00:00.000Z');
  assert.equal(__test__.normalizedTimestamp('2026-09-11T01:00:00-05:00'),'2026-09-11T06:00:00.000Z');
  assert.equal(__test__.normalizedTimestamp('2024-02-29T23:59:59.123456Z'),'2024-02-29T23:59:59.123Z');
  assert.equal(__test__.normalizedTimestamp('2026-09-11T11:30:00+05:30'),'2026-09-11T06:00:00.000Z');

  for(const invalid of [
    '2026-09-11',
    '2026-09-11T06:00:00',
    '2026-09-11 06:00:00Z',
    '09/11/2026 06:00:00',
    '2026-02-29T06:00:00Z',
    '2026-02-31T06:00:00Z',
    '2026-13-01T06:00:00Z',
    '2026-09-11T24:00:00Z',
    '2026-09-11T06:60:00Z',
    '2026-09-11T06:00:60Z',
    '2026-09-11T06:00:00+14:30',
    '2026-09-11T06:00:00+15:00'
  ]) assert.equal(__test__.normalizedTimestamp(invalid),undefined,invalid);
});

test('serverless bridge replay signature binds sender, instant, body, quote and behavior-changing transport flags',()=>{
  const sameInstant={...base,timestamp:'2026-09-11T01:00:00-05:00'};
  assert.equal(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature(sameInstant));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,fromMe:true}));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,hasMedia:true,mediaKind:'image',type:'media'}));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,text:'Juego 1N del 5 con 300k'}));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,quotedExternalMessageId:'origin-2'}));
});

test('canonical delegated event preserves the same transport flags and immutable replay digest',()=>{
  const event=__test__.canonicalBridgeEvent(base,identity);
  assert.equal(event.fromMe,false);
  assert.equal(event.hasMedia,false);
  assert.equal(event.mediaKind,'none');
  assert.equal(event.timestamp,'2026-09-11T06:00:00.000Z');
  assert.equal(event.quotedExternalMessageId,'origin-1');
  assert.equal(event.rawMeta,`serverless-compat:${__test__.sourceReplaySignature(base).slice(0,24)}`);

  const fromMe=__test__.canonicalBridgeEvent({...base,fromMe:true},identity);
  const media=__test__.canonicalBridgeEvent({...base,type:'media',hasMedia:true,mediaKind:'image'},identity);
  assert.notEqual(fromMe.rawMeta,event.rawMeta);
  assert.notEqual(media.rawMeta,event.rawMeta);
});
