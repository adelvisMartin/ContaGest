import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGroupBridgeBody, __test__ } from '../frontend/api/hipico/group-bridge-ingest.js';

const source={
  HIPICO_SOURCE_GROUP_ID:'120363000000000001@g.us',
  HIPICO_LAB_GROUP_ID:'120363000000000002@g.us',
  HIPICO_SOURCE_CHANNEL_KEY:'club-hipico-triple-crown-official',
  HIPICO_LAB_CHANNEL_KEY:'control-hipico-lab'
};
const payload={
  bridgeVersion:'official-web-playwright-1.4.2',
  externalMessageId:'msg-297-1',
  groupId:source.HIPICO_SOURCE_GROUP_ID,
  groupName:'Remate caballos',
  channelKey:source.HIPICO_SOURCE_CHANNEL_KEY,
  labChannelKey:source.HIPICO_LAB_CHANNEL_KEY,
  channelRole:'source',
  shadowMode:true,
  senderId:'584121234567',
  senderLabel:'Operador',
  fromMe:false,
  timestamp:'2026-09-11T06:00:00Z',
  type:'chat',
  mediaKind:'none',
  text:'Juego 1N del 5 con 100k',
  hasMedia:false,
  quotedExternalMessageId:null,
  rawMeta:'{}'
};

const REQUIRED=[
  'bridgeVersion','externalMessageId','groupId','groupName','channelKey','labChannelKey','channelRole',
  'shadowMode','senderId','fromMe','timestamp','type','mediaKind','text','hasMedia'
];

test('current linked-device payload is accepted only for the configured SOURCE/LAB identity',()=>{
  assert.equal(validateGroupBridgeBody(payload,source),null);
  assert.equal(validateGroupBridgeBody({...payload,labChannelKey:'otro-lab'},source),'lab_channel_not_authorized');
  assert.equal(validateGroupBridgeBody({...payload,groupId:source.HIPICO_LAB_GROUP_ID},source),'source_group_not_authorized');
});

test('bridge payload requires every behavior-changing identity field explicitly',()=>{
  for(const key of REQUIRED){
    const candidate={...payload};
    delete candidate[key];
    assert.equal(validateGroupBridgeBody(candidate,source),'missing_required_field',key);
  }
  assert.equal(__test__.missingRequiredBridgeField(payload),null);
});

test('bridge payload contract rejects unknown fields and oversized parsed bodies',()=>{
  assert.equal(validateGroupBridgeBody({...payload,unexpected:'x'},source),'unknown_field');
  assert.equal(validateGroupBridgeBody({...payload,groupId:{padding:'x'.repeat(30000)}},source),'payload_too_large');
});

test('required bridge identity fields cannot be present but empty or ambiguously typed',()=>{
  assert.equal(validateGroupBridgeBody({...payload,bridgeVersion:''},source),'invalid_bridge_version');
  assert.equal(validateGroupBridgeBody({...payload,groupName:'   '},source),'invalid_group_name');
  assert.equal(validateGroupBridgeBody({...payload,channelRole:''},source),'invalid_channel_role');
  assert.equal(validateGroupBridgeBody({...payload,fromMe:'false'},source),'invalid_boolean_field');
  assert.equal(validateGroupBridgeBody({...payload,hasMedia:0},source),'invalid_boolean_field');
});

test('bridge timestamp is explicit zoned ISO-8601 and rejects impossible or ambiguous calendar input',()=>{
  const invalid=[
    '',
    '2026-09-11 06:00:00',
    '2026-09-11T06:00:00',
    '2026-02-29T06:00:00Z',
    '2026-02-31T06:00:00Z',
    '2026-13-01T06:00:00Z',
    '2026-09-11T24:00:00Z',
    '2026-09-11T06:60:00Z',
    '2026-09-11T06:00:60Z',
    '2026-09-11T06:00:00+14:30',
    '2026-09-11T06:00:00+15:00'
  ];
  for(const timestamp of invalid){
    assert.equal(validateGroupBridgeBody({...payload,timestamp},source),'invalid_timestamp',timestamp);
  }
  assert.equal(validateGroupBridgeBody({...payload,timestamp:'2028-02-29T06:00:00Z'},source),null);
  assert.equal(validateGroupBridgeBody({...payload,timestamp:'2026-09-11T01:00:00-05:00'},source),null);
});

test('equivalent zoned instants produce the same immutable replay identity',()=>{
  const utc={...payload,timestamp:'2026-09-11T06:00:00Z'};
  const offset={...payload,timestamp:'2026-09-11T01:00:00-05:00'};
  assert.equal(__test__.normalizedTimestamp(utc.timestamp),'2026-09-11T06:00:00.000Z');
  assert.equal(__test__.normalizedTimestamp(offset.timestamp),'2026-09-11T06:00:00.000Z');
  assert.equal(__test__.sourceReplaySignature(utc),__test__.sourceReplaySignature(offset));
});

test('bridge media flags, type and media kind must agree',()=>{
  assert.equal(validateGroupBridgeBody({...payload,type:'media',hasMedia:true,mediaKind:'document'},source),null);
  assert.equal(validateGroupBridgeBody({...payload,type:'chat',hasMedia:true,mediaKind:'document'},source),'invalid_media_consistency');
  assert.equal(validateGroupBridgeBody({...payload,type:'media',hasMedia:false,mediaKind:'none'},source),'invalid_media_consistency');
  assert.equal(validateGroupBridgeBody({...payload,type:'media',hasMedia:true,mediaKind:'none'},source),'invalid_media_consistency');
  assert.equal(validateGroupBridgeBody({...payload,type:'media',hasMedia:true,mediaKind:'sticker'},source),'invalid_media_kind');
});

test('media kind participates in immutable replay identity delegated to the canonical backend',()=>{
  const media={...payload,type:'media',hasMedia:true,mediaKind:'image'};
  const document={...media,mediaKind:'document'};
  assert.notEqual(__test__.sourceReplaySignature(media),__test__.sourceReplaySignature(document));

  const mediaEvent=__test__.canonicalBridgeEvent(media,source);
  const documentEvent=__test__.canonicalBridgeEvent(document,source);
  assert.equal(mediaEvent.mediaKind,'image');
  assert.equal(mediaEvent.hasMedia,true);
  assert.equal(mediaEvent.timestamp,'2026-09-11T06:00:00.000Z');
  assert.match(mediaEvent.rawMeta,/^serverless-compat:[a-f0-9]{24}$/);
  assert.notEqual(mediaEvent.rawMeta,documentEvent.rawMeta);
});
