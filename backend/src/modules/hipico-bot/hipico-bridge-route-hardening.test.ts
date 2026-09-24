import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { __test__ as transportTest } from './hipico-bridge-transport.store.js';

const routes=readFileSync(new URL('./hipico-bridge.routes.ts',import.meta.url),'utf8');
const transportStore=readFileSync(new URL('./hipico-bridge-transport.store.ts',import.meta.url),'utf8');

const identityEnv={
  HIPICO_SOURCE_GROUP_ID:'120363111111111111@g.us',
  HIPICO_LAB_GROUP_ID:'120363222222222222-2222222222@g.us',
  HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY:'club-hipico-triple-crown-official',
  HIPICO_LAB_CHANNEL_KEY:'control-hipico-lab'
};

test('bridge route validates exact SOURCE/LAB identity before sender classification or persistence',()=>{
  const validator=routes.slice(routes.indexOf('function validatePinnedChannel'),routes.indexOf('router.use'));
  assert.match(validator,/if\(!input\.shadowMode\)/);
  assert.match(validator,/validateBridgeGroupIdentity\(input\)/);
  assert.match(validator,/HIPICO_BRIDGE_GROUP_IDENTITY_NOT_CONFIGURED/);

  const eventRouteStart=routes.indexOf("router.post('/bridge/events'");
  const eventRouteEnd=routes.indexOf('export default router',eventRouteStart);
  assert.ok(eventRouteStart>=0&&eventRouteEnd>eventRouteStart,'bridge events route must be present');
  const eventRoute=routes.slice(eventRouteStart,eventRouteEnd);
  const identityCheck=eventRoute.indexOf('const channelError=validatePinnedChannel(input)');
  const senderNormalization=eventRoute.indexOf('const sender=normalizeBridgeSender(input.senderId)');
  const mediaNormalization=eventRoute.indexOf('effectiveBridgeMediaKind(input.hasMedia,input.mediaKind)');
  const classification=eventRoute.indexOf('classifyUntrustedConversation({text:input.text,mediaKind:effectiveMediaKind');
  const persistence=eventRoute.indexOf('persistBridgeTransportEvent({');
  assert.ok(identityCheck>=0&&senderNormalization>identityCheck&&mediaNormalization>senderNormalization&&classification>mediaNormalization&&persistence>classification);
});

test('effective media kind propagates through transport, canonical storage and conversation decision',()=>{
  const eventRouteStart=routes.indexOf("router.post('/bridge/events'");
  const eventRouteEnd=routes.indexOf('export default router',eventRouteStart);
  const eventRoute=routes.slice(eventRouteStart,eventRouteEnd);
  assert.match(eventRoute,/hasMedia:effectiveMediaKind!=='none',mediaKind:effectiveMediaKind/);
  assert.match(eventRoute,/persistCanonicalShadow\([\s\S]*mediaKind:effectiveMediaKind/);
  assert.match(eventRoute,/decideConversation\([\s\S]*mediaKind:effectiveMediaKind/);
});

test('transport duplicate replay reloads persisted payload metadata before comparing identity',()=>{
  const duplicateSelectStart=transportStore.indexOf('const existing=await prisma.$queryRaw<PersistedTransportSource[]>');
  const duplicateSelectEnd=transportStore.indexOf('if(!existing[0]?.id)',duplicateSelectStart);
  assert.ok(duplicateSelectStart>=0&&duplicateSelectEnd>duplicateSelectStart,'transport duplicate select must be present');
  const duplicateSelect=transportStore.slice(duplicateSelectStart,duplicateSelectEnd);
  assert.match(duplicateSelect,/"payload"/,'duplicate replay must reload payload metadata used by transportReplaySignature');
  assert.match(transportStore,/type PersistedTransportSource=\{[\s\S]*payload:/,'persisted replay type must retain payload metadata');
});

test('transport persistence requires pinned modern or legacy SOURCE/LAB IDs before any write',()=>{
  assert.equal(transportTest.bridgeGroupIdentityReady(identityEnv),true);
  assert.equal(transportTest.normalizeGroupId('120363111111111111@g.us'),'120363111111111111@g.us');
  assert.equal(transportTest.normalizeGroupId('120363222222222222-2222222222@g.us'),'120363222222222222-2222222222@g.us');
  assert.equal(transportTest.normalizeGroupId('12345@g.us'),'');
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

test('bridge failure logs redact group labels, channel keys and raw provider ids',()=>{
  assert.doesNotMatch(routes,/persistent shadow ingestion failed'\s*,\s*\{[^}]*groupName/);
  assert.doesNotMatch(routes,/persistent shadow ingestion failed'\s*,\s*\{[^}]*channelKey/);
  assert.match(routes,/persistent shadow ingestion failed'\s*,\s*\{messageRef:shadowTag\(input\.externalMessageId\)/);
  assert.match(routes,/replay identity mismatch'\s*,\s*\{messageRef:shadowTag\(input\.externalMessageId\)/);
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

test('autonomous SOURCE reply path stays pinned, idempotent and non-authoritative',()=>{
  const eventStart=routes.indexOf("router.post('/bridge/events'");
  const eventEnd=routes.indexOf('export default router',eventStart);
  const eventRoute=routes.slice(eventStart,eventEnd);
  assert.match(eventRoute,/input\.channelRole==='source'&&autoReplyConfigured/);
  assert.match(eventRoute,/targetGroupId:stored\.row\.recipient/);
  assert.match(eventRoute,/ensureSourceReplyOutbox\(\{/);
  assert.match(eventRoute,/domainEffectsAllowed:false/);
  assert.match(eventRoute,/financialAuthority:false/);
  assert.match(eventRoute,/stateMutationAllowed:false/);
  assert.doesNotMatch(eventRoute,/targetGroupId:req\./);
});

test('source reply receipt is bridge-authenticated and only accepts sent or ambiguous terminal evidence',()=>{
  const start=routes.indexOf("router.post('/bridge/replies/:id/receipt'");
  const end=routes.indexOf("router.post('/bridge/events'",start);
  assert.ok(start>=0&&end>start);
  const receipt=routes.slice(start,end);
  assert.match(receipt,/bridgeTokenValid/);
  assert.match(receipt,/sourceReplyReceiptSchema/);
  assert.match(receipt,/recordSourceReplyDelivery/);
  assert.match(transportStore,/status:'sent'\|'ambiguous'/);
  assert.match(transportStore,/HIPICO_SOURCE_REPLY_TERMINAL/);
});

test('source reply replay rejects destination, message, intent or risk substitution',()=>{
  const existing={
    id:'hsr_11111111-1111-4111-8111-111111111111',
    eventId:'hwe-1',recipient:'120363111111111111@g.us',message:'hola',
    intent:'greeting',risk:'safe',status:'planned',providerMessageId:null,error:null,sentAt:null
  };
  const input={eventId:'hwe-1',recipient:'120363111111111111@g.us',message:'hola',intent:'greeting',risk:'safe'};
  assert.doesNotThrow(()=>transportTest.assertSourceReplyReplay(existing as any,input));
  for(const changed of [
    {...input,recipient:'120363222222222222@g.us'},
    {...input,message:'otro'},
    {...input,intent:'query:NEXT_RACE'},
    {...input,risk:'review'}
  ]){
    assert.throws(
      ()=>transportTest.assertSourceReplyReplay(existing as any,changed as any),
      (error:any)=>error?.code==='HIPICO_SOURCE_REPLY_REPLAY_MISMATCH'
    );
  }
});
