import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  labReplayCandidate,labReplayEligible,labReplayFingerprint,labReplaySnapshotValid,
  LAB_REPLY_REPLAY_POLICY,LAB_REPLY_REPLAY_TTL_MS,type LabReplayScope
} from './hipico-lab-recovery-policy.js';
import type { SafeResponsePlan } from './hipico-response-safety.js';

const now=Date.UTC(2026,9,12,14,0,0);
const scope=():LabReplayScope=>({
  channelRole:'lab',channelId:'11111111-1111-4111-8111-111111111111',
  groupId:'120363222222222222@g.us',groupKey:'control-hipico-lab',
  sender:'123456789012@lid',sourceMessageId:'msg-live-1',sentAt:'2026-10-12T14:00:00.000Z',
  messageText:'¿Qué carrera sigue?',fromMe:false,historySync:false,mediaKind:'none',
  forceReview:false,rateAllowed:true,systemHealthy:true,humanOwned:false,
  classification:{intent:'conversation',risk:'review',confidence:.65,suggestion:'revisar',autoEligible:false,reason:'AMBIGUOUS'}
});
const plan=():SafeResponsePlan & {readModelDigest?:string}=>({
  intent:'ACK_RECEIVED',text:'Próxima carrera: la primera, programada a las 18:00.',
  canSend:true,confirmationVerified:false,responseIdempotencyKey:'resp_abcdef0123456789abcdef0123456789',
  decisionVersion:'v1',correlationId:'conv_1',sourceMessageId:'msg-live-1',
  evidence:null,handoffRequired:false,reason:'CANONICAL_LAB_RACE_QUERY',readModelDigest:'a'.repeat(64)
});
function snapshot(input=scope(),reply=plan()){
  const candidate=labReplayCandidate(input,reply);
  assert.ok(candidate);
  return{
    scopeHash:candidate.fingerprint,policy:candidate.policy,kind:candidate.kind,
    text:candidate.text,readDigest:candidate.readDigest,
    expiresAt:new Date(now+LAB_REPLY_REPLAY_TTL_MS),
    responseHash:crypto.createHash('sha256').update(candidate.text).digest('hex')
  };
}
test('authorized LAB query candidate binds source identity, version and entire race read model',()=>{
  const input=scope(),candidate=labReplayCandidate(input,plan());
  assert.ok(candidate);
  assert.equal(candidate.kind,'race_query');
  assert.equal(candidate.policy,LAB_REPLY_REPLAY_POLICY);
  assert.equal(candidate.readDigest,'a'.repeat(64));
  assert.equal(candidate.fingerprint,labReplayFingerprint(input));
  assert.equal(labReplaySnapshotValid(snapshot(),input,now),true);
});
test('scope isolation, body tampering and expiry all deny recovery',()=>{
  const trusted=snapshot();
  for(const change of [
    {groupId:'120363333333333333@g.us'},{groupKey:'other-group'},
    {sender:'999999999999@lid'},{channelId:'22222222-2222-4222-8222-222222222222'},
    {sourceMessageId:'msg-live-2'},{messageText:'otra carrera'},
    {sentAt:'2026-10-12T14:00:01.000Z'}
  ]){
    assert.equal(labReplaySnapshotValid(trusted,{...scope(),...change},now),false);
  }
  assert.equal(labReplaySnapshotValid(trusted,scope(),now+LAB_REPLY_REPLAY_TTL_MS),false);
  assert.equal(labReplaySnapshotValid({...trusted,expiresAt:new Date(now+LAB_REPLY_REPLAY_TTL_MS+1)},scope(),now),false);
  assert.equal(labReplaySnapshotValid({...trusted,policy:'old-policy'},scope(),now),false);
  assert.equal(labReplaySnapshotValid({...trusted,text:'altered'},scope(),now),false);
  assert.equal(labReplaySnapshotValid({...trusted,readDigest:null},scope(),now),false);
});
test('no SOURCE, operational, unauthenticated, human-owned or degraded response gets a candidate',()=>{
  for(const change of [
    {channelRole:'source'},{historySync:true},{fromMe:true},{mediaKind:'document'},
    {forceReview:true},{rateAllowed:false},{systemHealthy:false},{humanOwned:true},
    {classification:{intent:'offer_player',risk:'monetary',confidence:1,suggestion:'',autoEligible:false,reason:'offer'}},
    {classification:{intent:'conversational_security_review',risk:'review',confidence:1,suggestion:'',autoEligible:false,reason:'APPSEC'}}
  ]){
    const input={...scope(),...change} as LabReplayScope;
    assert.equal(labReplayCandidate(input,plan()),null);
  }
  for(const change of [
    {canSend:false},{confirmationVerified:true},{handoffRequired:true},
    {evidence:{receiptId:'funds'}},{intent:'CONFIRMED'},
    {intent:'SYSTEM_DEGRADED'},{readModelDigest:undefined},
    {sourceMessageId:'another-message'}
  ]){
    assert.equal(labReplayCandidate(scope(),{...plan(),...change} as any),null);
  }
});
test('static greeting remains replayable but review/finance cannot impersonate a static reply',()=>{
  const input={...scope(),classification:{intent:'greeting',risk:'safe',confidence:.99,suggestion:'Hola',autoEligible:true,reason:'SAFE_GREETING'}};
  const reply={...plan(),reason:'SAFE_GREETING',text:'¡Hola!',readModelDigest:undefined};
  assert.equal(labReplayCandidate(input,reply)?.kind,'static_safe');
  assert.equal(labReplaySnapshotValid(snapshot(input,reply),input,now),true);
  assert.equal(labReplaySnapshotValid(snapshot(input,reply),{...input,classification:scope().classification},now),false);
  assert.equal(labReplayCandidate({...input,classification:{...input.classification,risk:'monetary'}},reply),null);
});
