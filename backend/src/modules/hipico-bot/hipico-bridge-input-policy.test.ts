import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HISTORY_MAX_IDENTICAL_PER_MINUTE,
  assertBridgeGroupIdentity,
  bridgeGroupIdentityReady,
  historySyncRateCheck,
  historySyncRateLimiter,
  liveRateLimitClock,
  normalizeBridgeGroupId,
  normalizeBridgeSender,
  validateBridgeGroupIdentity
} from './hipico-bridge-input-policy.js';

const sourceGroupId='120363111111111111@g.us';
const labGroupId='120363222222222222-2222222222@g.us';
const env={
  HIPICO_SOURCE_GROUP_ID:sourceGroupId,
  HIPICO_LAB_GROUP_ID:labGroupId,
  HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY:'club-hipico-triple-crown-official',
  HIPICO_LAB_CHANNEL_KEY:'control-hipico-lab'
};

test('bridge sender normalization rejects empty canonical identities',()=>{
  assert.equal(normalizeBridgeSender(''),null);
  assert.equal(normalizeBridgeSender('@c.us'),null);
  assert.equal(normalizeBridgeSender('   @lid   '),null);
});

test('bridge sender normalization preserves a stable sender identity without transport suffix',()=>{
  assert.equal(normalizeBridgeSender('584121234567@c.us'),'584121234567');
  assert.equal(normalizeBridgeSender('participant-7@lid'),'participant-7');
});

test('bridge sender normalization rejects control characters',()=>{
  assert.equal(normalizeBridgeSender('participant\u0007@c.us'),null);
});

test('SOURCE and LAB identity accepts modern and legacy WhatsApp group JIDs only',()=>{
  assert.equal(normalizeBridgeGroupId(sourceGroupId),sourceGroupId);
  assert.equal(normalizeBridgeGroupId(labGroupId),labGroupId);
  assert.equal(normalizeBridgeGroupId('12345@g.us'),'');
  assert.equal(normalizeBridgeGroupId('1234-5678@g.us'),'');
  assert.equal(normalizeBridgeGroupId('584121234567@s.whatsapp.net'),'');
  assert.equal(bridgeGroupIdentityReady(env),true);
});

test('backend bridge identity is role-bound and fails closed on substitutions or bad configuration',()=>{
  assert.equal(validateBridgeGroupIdentity({
    groupId:sourceGroupId,channelRole:'source',channelKey:'club-hipico-triple-crown-official',labChannelKey:'control-hipico-lab'
  },env),null);
  assert.equal(validateBridgeGroupIdentity({
    groupId:labGroupId,channelRole:'lab',channelKey:'control-hipico-lab',labChannelKey:'control-hipico-lab'
  },env),null);
  assert.equal(validateBridgeGroupIdentity({
    groupId:labGroupId,channelRole:'source',channelKey:'club-hipico-triple-crown-official',labChannelKey:'control-hipico-lab'
  },env),'HIPICO_BRIDGE_GROUP_IDENTITY_MISMATCH');
  assert.equal(validateBridgeGroupIdentity({
    groupId:sourceGroupId,channelRole:'source',channelKey:'club-hipico-triple-crown-official',labChannelKey:'control-hipico-lab'
  },{...env,HIPICO_LAB_GROUP_ID:sourceGroupId}),'HIPICO_BRIDGE_GROUP_IDENTITY_NOT_CONFIGURED');
  assert.throws(()=>assertBridgeGroupIdentity({
    groupId:labGroupId,channelRole:'source',channelKey:'club-hipico-triple-crown-official',labChannelKey:'control-hipico-lab'
  },env),(error:any)=>error?.code==='HIPICO_TRANSPORT_REPLAY_MISMATCH');
});

test('live rate limiting uses server time and never the message timestamp',()=>{
  assert.equal(liveRateLimitClock(false,()=>123456),123456);
  assert.equal(liveRateLimitClock(true,()=>123456),null);
});

test('history replay has a separate larger server-side throttle but is never unlimited',()=>{
  historySyncRateLimiter.reset();
  const actor='source:p1';
  const digest='same';
  for(let index=0;index<HISTORY_MAX_IDENTICAL_PER_MINUTE;index+=1){
    assert.equal(historySyncRateCheck(actor,digest,1000+index).allowed,true);
  }
  const blocked=historySyncRateCheck(actor,digest,2000);
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.reason,'REPETITION_RATE_LIMIT');
  assert.equal(historySyncRateCheck('source:p2',digest,2000).allowed,true);
  historySyncRateLimiter.reset();
});
