import test from 'node:test';
import assert from 'node:assert/strict';
import { __test__ } from '../frontend/api/hipico/group-bridge-ingest.js';

const base={
  senderId:'584121234567',
  timestamp:'2026-09-11T06:00:00.000Z',
  type:'chat',
  text:'Juego 1N del 5 con 100k',
  quotedExternalMessageId:'origin-1',
  fromMe:false,
  hasMedia:false,
  historySync:false,
  mediaKind:'none'
};

test('serverless bridge accepts only explicit ISO-8601 timestamps with timezone and valid calendar fields',()=>{
  assert.equal(__test__.normalizedTimestamp('2026-09-11T06:00:00Z'),'2026-09-11T06:00:00.000Z');
  assert.equal(__test__.normalizedTimestamp('2026-09-11T01:00:00-05:00'),'2026-09-11T06:00:00.000Z');
  assert.equal(__test__.normalizedTimestamp('2024-02-29T23:59:59.123456Z'),'2024-02-29T23:59:59.123Z');
  assert.equal(__test__.normalizedTimestamp('2026-09-11T11:30:00+05:30'),'2026-09-11T06:00:00.000Z');

  for(const invalid of [
    '2026-09-11','2026-09-11T06:00:00','2026-09-11 06:00:00Z','09/11/2026 06:00:00',
    '2026-02-29T06:00:00Z','2026-02-31T06:00:00Z','2026-13-01T06:00:00Z','2026-09-11T24:00:00Z',
    '2026-09-11T06:60:00Z','2026-09-11T06:00:60Z','2026-09-11T06:00:00+14:30','2026-09-11T06:00:00+15:00'
  ]) assert.equal(__test__.normalizedTimestamp(invalid),undefined,invalid);
});

test('serverless bridge replay signature binds sender, instant, body, quote and behavior-changing transport flags',()=>{
  const sameInstant={...base,timestamp:'2026-09-11T01:00:00-05:00'};
  assert.equal(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature(sameInstant));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,fromMe:true}));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,hasMedia:true,mediaKind:'unknown'}));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,historySync:true}));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,text:'Juego 1N del 5 con 300k'}));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,quotedExternalMessageId:'origin-2'}));
});

test('canonical transport event keeps immutable flags while pinning configured channel identity',()=>{
  const source={
    HIPICO_SOURCE_GROUP_ID:'120363111111111111@g.us',
    HIPICO_LAB_GROUP_ID:'120363222222222222@g.us'
  };
  const event=__test__.canonicalBridgeEvent({...base,groupId:source.HIPICO_SOURCE_GROUP_ID,externalMessageId:'wamid-1',shadowMode:true},source);
  assert.equal(event.groupId,source.HIPICO_SOURCE_GROUP_ID);
  assert.equal(event.channelRole,'source');
  assert.equal(event.shadowMode,true);
  assert.equal(event.historySync,false);
  assert.equal(event.fromMe,false);
  assert.equal(event.hasMedia,false);
  assert.equal(event.mediaKind,'none');
  assert.match(event.rawMeta,/^serverless-compat:[a-f0-9]{24}$/);
});
