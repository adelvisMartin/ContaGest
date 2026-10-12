import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRaceReadDigest, eligibleCanonicalLabRaceQuery, resolveCanonicalLabRaceQuery } from './hipico-lab-race-query.js';

const scope={ownerId:'11111111-1111-4111-8111-111111111111',groupKey:'control-hipico-lab'};
const request=()=>({
  channelRole:'lab' as const,channelId:'22222222-2222-4222-8222-222222222222',groupKey:scope.groupKey,
  text:'¿Qué carrera sigue?',fromMe:false,historySync:false,mediaKind:'none',
  rateAllowed:true,systemHealthy:true,forceReview:false,
  classification:{intent:'conversation',risk:'review',confidence:.65,suggestion:'Revisión',autoEligible:false,reason:'AMBIGUOUS'},
  responsePlan:{intent:'ACK_RECEIVED',text:'Mensaje recibido',canSend:true,confirmationVerified:false,
    responseIdempotencyKey:'qkey',decisionVersion:'v1',correlationId:'conv1',
    sourceMessageId:'message1',evidence:null,handoffRequired:false,reason:'SAFE_INFORMATIONAL_INTENT'}
});

test('canonical next race uses only scoped store result and exposes recorded stage',async()=>{
  let invoked=0;
  const output=await resolveCanonicalLabRaceQuery(request() as any,{
    readScope:async()=>scope,
    execute:async(q)=>{
      invoked++;
      assert.deepEqual(q,{...scope,text:'¿Qué carrera sigue?'});
      return{intent:'NEXT_RACE',answer:{id:'race-1',number:1,name:'Primera',scheduledAt:'2026-10-12T18:00:00Z'},
        scope:{ownerId:scope.ownerId,groupId:scope.groupKey,meetingId:null,raceId:null}};
    }
  });
  assert.equal(invoked,1);
  assert.match(output.text||'',/Próxima carrera: 1ª carrera/);
  assert.match(output.text||'',/2026-10-12T18:00:00Z/);
  assert.equal(output.reason,'CANONICAL_LAB_RACE_QUERY');
  assert.equal(output.confirmationVerified,false);
  assert.equal(output.evidence,null);
});

test('unsafe or unauthorized messages never access canonical races',async()=>{
  const original=request();let calls=0;
  const deps={readScope:async()=>{calls++;return scope;},execute:async()=>{throw new Error('NOT_ALLOWED');}};
  for(const change of [
    {channelRole:'source'},{fromMe:true},{historySync:true},{forceReview:true},
    {mediaKind:'image'},{rateAllowed:false},{systemHealthy:false},
    {classification:{intent:'offer_player',risk:'monetary'}},
    {classification:{intent:'conversational_security_review',risk:'review'}},
    {responsePlan:{...original.responsePlan,handoffRequired:true}},
    {responsePlan:{...original.responsePlan,confirmationVerified:true}},
    {text:'juega 20 al caballo 5'}
  ]){
    const candidate={...request(),...change} as any;
    assert.equal(eligibleCanonicalLabRaceQuery(candidate),false);
    const actual=await resolveCanonicalLabRaceQuery(candidate,deps as any);
    assert.equal(actual.text,candidate.responsePlan.text);
  }
  assert.equal(calls,0);
});

test('ambiguous race requires explicit meeting context, missing authority holds',async()=>{
  const ambiguous=await resolveCanonicalLabRaceQuery(request() as any,{
    readScope:async()=>scope,
    execute:async()=>{throw Object.assign(new Error('ambiguous'),{code:'RACE_QUERY_AMBIGUOUS'});}
  });
  assert.equal(ambiguous.intent,'NEEDS_CLARIFICATION');
  assert.match(ambiguous.text||'',/reunión y el número de carrera/);
  const unavailable=await resolveCanonicalLabRaceQuery(request() as any,{
    readScope:async()=>{throw new Error('DB_UNAVAILABLE');},
    execute:async()=>{throw new Error('NOT_REACHED');}
  });
  assert.equal(unavailable.canSend,false);
  assert.equal(unavailable.text,null);
  assert.equal(unavailable.reason,'CANONICAL_LAB_RACE_QUERY_UNAVAILABLE');
});

test('tenant mismatch cannot answer using another owner/group',async()=>{
  const result=await resolveCanonicalLabRaceQuery(request() as any,{
    readScope:async()=>({...scope,groupKey:'other-group'}),
    execute:async()=>{throw new Error('SHOULD_NOT_EXECUTE');}
  });
  assert.equal(result.canSend,false);
  assert.equal(result.text,null);
});

test('read-model digest changes when race moves from provisional to official even with same runner board',()=>{
  const base={
    intent:'RESULT' as const,
    answer:{known:true,raceId:'r1',resultStage:'provisional',result:{arrival:['3','5','1']},state:'PROVISIONAL_RESULT'},
    scope:{ownerId:scope.ownerId,groupId:scope.groupKey,meetingId:null,raceId:'r1'}
  };
  const initial=canonicalRaceReadDigest(base);
  assert.equal(initial,canonicalRaceReadDigest({...base}));
  const official=canonicalRaceReadDigest({...base,answer:{...base.answer,resultStage:'official',state:'OFFICIAL_RESULT'}});
  assert.notEqual(initial,official);
});
