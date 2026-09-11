import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { __test__ as transportTest } from './hipico-bridge-transport.store.js';

const routes=readFileSync(new URL('./hipico-bridge.routes.ts',import.meta.url),'utf8');

const identityEnv={
  HIPICO_SOURCE_GROUP_ID:'120363111111111111@g.us',
  HIPICO_LAB_GROUP_ID:'120363222222222222-2222222222@g.us',
  HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY:'club-hipico-triple-crown-official',
  HIPICO_LAB_CHANNEL_KEY:'control-hipico-lab'
};

test('bridge route pins source and lab channels and requires shadow mode for every inbound event',()=>{
  const validator=routes.slice(routes.indexOf('function validatePinnedChannel'),routes.indexOf('router.use'));
  assert.match(validator,/if\(!input\.shadowMode\)/);
  assert.match(validator,/input\.channelKey!==OFFICIAL_SOURCE_CHANNEL_KEY/);
  assert.match(validator,/input\.labChannelKey!==DEFAULT_LAB_CHANNEL_KEY/);
  assert.match(validator,/input\.channelKey!==DEFAULT_LAB_CHANNEL_KEY/);
});

test('transport persistence requires pinned modern or legacy SOURCE/LAB IDs before any write',()=>{
  assert.equal(transportTest.bridgeGroupIdentityReady(identityEnv),true);
  assert.equal(transportTest.normalizeGroupId('120363111111111111@g.us'),'120363111111111111@g.us');
  assert.equal(transportTest.normalizeGroupId('120363222222222222-2222222222@g.us'),'120363222222222222-2222222222@g.us');
  assert.equal(transportTest.normalizeGroupId('invalid'), '');
  assert.equal(transportTest.assertBridgeGroupIdentity({
    groupId:identityEnv.HIPICO_SOURCE_GROUP_ID,
    channelRole:'source',
    channelKey:identityEnv.HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY,
    labChannelKey:identityEnv.HIPICO_LAB_CHANNEL_KEY
  },identityEnv),true);
  assert.equal(transportTest.assertBridgeGroupIdentity({
    groupId:identityEnv.HIPICO_LAB_GROUP_ID,
    channelRole:'lab',
    channelKey:identityEnv.HIPICO_LAB_CHANNEL_KEY,
    labChannelKey:identityEnv.HIPICO_LAB_CHANNEL_KEY
  },identityEnv),true);
});

test('transport boundary rejects group substitution as non-retryable identity mismatch',()=>{
  assert.throws(()=>transportTest.assertBridgeGroupIdentity({
    groupId:identityEnv.HIPICO_LAB_GROUP_ID,
    channelRole:'source',
    channelKey:identityEnv.HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY,
    labChannelKey:identityEnv.HIPICO_LAB_CHANNEL_KEY
  },identityEnv),(error:any)=>error?.code==='HIPICO_TRANSPORT_REPLAY_MISMATCH');
  assert.throws(()=>transportTest.assertBridgeGroupIdentity({
    groupId:identityEnv.HIPICO_SOURCE_GROUP_ID,
    channelRole:'lab',
    channelKey:identityEnv.HIPICO_LAB_CHANNEL_KEY,
    labChannelKey:identityEnv.HIPICO_LAB_CHANNEL_KEY
  },identityEnv),(error:any)=>error?.code==='HIPICO_TRANSPORT_REPLAY_MISMATCH');
});

test('transport readiness fails closed when IDs are missing, malformed or equal',()=>{
  assert.equal(transportTest.bridgeGroupIdentityReady({...identityEnv,HIPICO_SOURCE_GROUP_ID:''}),false);
  assert.equal(transportTest.bridgeGroupIdentityReady({...identityEnv,HIPICO_LAB_GROUP_ID:'not-a-group'}),false);
  assert.equal(transportTest.bridgeGroupIdentityReady({...identityEnv,HIPICO_LAB_GROUP_ID:identityEnv.HIPICO_SOURCE_GROUP_ID}),false);
  assert.throws(()=>transportTest.assertBridgeGroupIdentity({
    groupId:identityEnv.HIPICO_SOURCE_GROUP_ID,channelRole:'source',channelKey:identityEnv.HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY,labChannelKey:identityEnv.HIPICO_LAB_CHANNEL_KEY
  },{...identityEnv,HIPICO_SOURCE_GROUP_ID:''}),(error:any)=>error?.code==='HIPICO_BRIDGE_GROUP_IDENTITY_NOT_CONFIGURED');
});

test('operator handoff returns the persisted CAS version and conflicts require reload',()=>{
  const handoff=routes.slice(routes.indexOf("router.post('/bridge/handoff'"),routes.indexOf("router.post('/bridge/events'"));
  assert.match(handoff,/const saved=await saveHandoff/);
  assert.match(handoff,/handoff:saved/);
  assert.match(handoff,/HIPICO_HANDOFF_CONFLICT/);
  assert.match(handoff,/handoff_conflict_reload/);
});

test('bridge decision transition keeps the version returned by persistence',()=>{
  assert.match(routes,/handoffState=await saveHandoff\(next/);
  assert.match(routes,/HANDOFF_CONFLICT_RETRY/);
});