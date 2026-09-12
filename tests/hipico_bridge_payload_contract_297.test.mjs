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

test('bridge media flags, type and media kind must agree',()=>{
  assert.equal(validateGroupBridgeBody({...payload,type:'media',hasMedia:true,mediaKind:'document'},source),null);
  assert.equal(validateGroupBridgeBody({...payload,type:'chat',hasMedia:true,mediaKind:'document'},source),'invalid_media_consistency');
  assert.equal(validateGroupBridgeBody({...payload,type:'media',hasMedia:false,mediaKind:'none'},source),'invalid_media_consistency');
  assert.equal(validateGroupBridgeBody({...payload,type:'media',hasMedia:true,mediaKind:'none'},source),'invalid_media_consistency');
  assert.equal(validateGroupBridgeBody({...payload,type:'media',hasMedia:true,mediaKind:'sticker'},source),'invalid_media_kind');
});

test('media kind participates in immutable replay identity',()=>{
  const media={...payload,type:'media',hasMedia:true,mediaKind:'image'};
  assert.notEqual(__test__.sourceReplaySignature(media),__test__.sourceReplaySignature({...media,mediaKind:'document'}));
  const persisted={
    sender_id:media.senderId,
    sent_at:'2026-09-11T06:00:00.000Z',
    message_type:'media',
    raw_text:media.text,
    quoted_external_message_id:null,
    normalized:{from_me:false,has_media:true,media_kind:'image'}
  };
  assert.equal(__test__.persistedReplaySignature(persisted),__test__.sourceReplaySignature(media));
});
