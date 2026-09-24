import assert from 'node:assert/strict';
import test from 'node:test';
import { AutonomousReplyService } from './autonomous-reply.service.js';

const basePlan={
  intent:'ACK_RECEIVED',
  text:'Mensaje recibido.',
  canSend:true,
  confirmationVerified:false,
  responseIdempotencyKey:'resp_12345678',
  decisionVersion:'test',
  correlationId:'conv-test',
  sourceMessageId:'msg-1',
  evidence:null,
  handoffRequired:false,
  reason:'SAFE_INFORMATIONAL_INTENT'
} as any;

const baseInput={
  ownerId:'11111111-1111-4111-8111-111111111111',
  groupKey:'club-hipico-triple-crown-official',
  groupId:'120363111111111111@g.us',
  text:'¿Cuál es la próxima carrera?',
  sourceMessageId:'msg-1',
  fromMe:false,
  historySync:false,
  duplicate:false,
  mediaKind:'none',
  rateAllowed:true,
  systemHealthy:true,
  responsePlan:basePlan
};

function metrics(){
  return {
    providerId:'typesafe-jev',
    historical:{evaluations:200,observed:200,unavailable:0,skipped:0,reviewedObserved:200,intentClassMatched:200,safetyDisagreements:0},
    recent:{evaluations:75,observed:75,unavailable:0,skipped:0,reviewedObserved:75,intentClassMatched:75,safetyDisagreements:0},
    byIntentClass:{},
    window:{recentDays:30,recentSince:'2026-08-25T00:00:00.000Z',metricSchemaVersion:'jev-shadow-v1'},
    metricsSignature:'a'.repeat(64)
  };
}

function observed(overrides:Record<string,unknown>={}){
  return {
    providerId:'typesafe-jev',
    mode:'SHADOW',
    status:'OBSERVED',
    authoritative:false,
    canAuthorize:false,
    model:'jev-test',
    latencyMs:2,
    failureCode:null,
    decision:{
      intentClass:'query_next_race',
      intentConfidence:.99,
      intentProbabilities:{query_next_race:.99,unknown:.01},
      humanReviewProbability:.01,
      candidateAgreementProbability:.99,
      ...overrides
    },
    usage:{inputUnits:10,outputUnits:2}
  } as any;
}

function dependencies(options:{
  enabled?:boolean;
  observation?:any;
  metricsValue?:any;
  auditFails?:boolean;
  queryText?:string;
}={}){
  const audit:any[]=[];
  const provider={
    id:'typesafe-jev',
    publicStatus:()=>({
      providerId:'typesafe-jev',
      mode:'SHADOW',
      enabled:true,
      configured:true,
      authoritative:false,
      reasons:[]
    }),
    observe:async()=>options.observation||{
      providerId:'typesafe-jev',mode:'OFF',status:'SKIPPED',authoritative:false,canAuthorize:false,
      model:null,latencyMs:0,failureCode:'MODE_OFF',decision:null,usage:null
    }
  };
  const store={
    decisionProviderMetrics:async()=>options.metricsValue||metrics(),
    recordEvaluation:async(input:any)=>{
      if(options.auditFails)throw new Error('db down');
      audit.push(input);
      return{id:'eval-1'};
    }
  };
  const query={
    execute:async()=>({
      intent:'NEXT_RACE',
      answer:{id:'r1',meetingId:'m1',number:1,name:'Primera',scheduledAt:'2026-09-24T19:00:00.000Z',state:'ANNOUNCED',resultStage:'none'},
      scope:{ownerId:baseInput.ownerId,groupId:baseInput.groupKey,meetingId:null,raceId:null}
    })
  };
  return{
    audit,
    deps:{
      env:{HIPICO_SOURCE_AUTO_REPLY_ENABLED:(options.enabled??true)?'true':'false'},
      decisionProvider:provider as any,
      automationStore:store as any,
      raceQueryService:query as any
    }
  };
}

test('source auto reply is off by default and performs no provider or persistence work',async()=>{
  let touched=false;
  const service=new AutonomousReplyService({
    env:{},
    decisionProvider:{observe:async()=>{touched=true;throw new Error('unexpected');},publicStatus:()=>({})} as any,
    automationStore:{recordEvaluation:async()=>{touched=true;}} as any
  });
  const result=await service.decide(baseInput as any);
  assert.equal(result.canSend,false);
  assert.equal(result.reason,'SOURCE_AUTO_REPLY_DISABLED');
  assert.equal(touched,false);
});

test('deterministic canonical query replies autonomously when Jev is unavailable or off',async()=>{
  const {deps,audit}=dependencies();
  const service=new AutonomousReplyService(deps as any);
  const result=await service.decide(baseInput as any);
  assert.equal(result.action,'SEND');
  assert.equal(result.reason,'CANONICAL_READ_ONLY_QUERY');
  assert.match(result.text||'',/Próxima carrera/);
  assert.equal(result.authority.domainEffectsAllowed,false);
  assert.equal(result.authority.financialAuthority,false);
  assert.equal(audit.length,1);
  assert.equal(audit[0].canAct,false,'shadow audit must never masquerade as an executed action');
});

test('a mature Jev disagreement can only downgrade a safe reply to clarification',async()=>{
  const {deps}=dependencies({
    observation:observed({humanReviewProbability:.95,candidateAgreementProbability:.05}),
    metricsValue:metrics()
  });
  const service=new AutonomousReplyService(deps as any);
  const result=await service.decide(baseInput as any);
  assert.equal(result.action,'SEND');
  assert.equal(result.reason,'PROVIDER_DOWNGRADE_REQUIRES_CLARIFICATION');
  assert.match(result.text||'',/precisión adicional/i);
  assert.equal(result.provider.influence,'DOWNGRADE_ONLY');
  assert.equal(result.authority.domainEffectsAllowed,false);
});



test('weak Jev disagreement does not create unnecessary clarification or human work',async()=>{
  const {deps}=dependencies({
    observation:observed({
      intentClass:'query_last_result',
      intentConfidence:.62,
      humanReviewProbability:.55,
      candidateAgreementProbability:.45
    }),
    metricsValue:metrics()
  });
  const service=new AutonomousReplyService(deps as any);
  const result=await service.decide(baseInput as any);
  assert.equal(result.action,'SEND');
  assert.equal(result.reason,'CANONICAL_READ_ONLY_QUERY');
  assert.match(result.text||'',/Próxima carrera/);
  assert.equal(result.provider.influence,'NONE');
  assert.equal(result.handoffRequired,false);
});

test('system degradation still returns the safe degraded message instead of going silent',async()=>{
  const {deps,audit}=dependencies();
  const service=new AutonomousReplyService(deps as any);
  const result=await service.decide({
    ...baseInput,
    systemHealthy:false,
    responsePlan:{
      ...basePlan,
      intent:'SYSTEM_DEGRADED',
      text:'No puedo verificar la operación en este momento. No se confirmó ningún registro.',
      handoffRequired:true,
      reason:'SYSTEM_NOT_AUTHORITATIVE'
    }
  } as any);
  assert.equal(result.action,'SEND');
  assert.equal(result.canSend,true);
  assert.equal(result.reason,'SYSTEM_DEGRADED_SAFE_REPLY');
  assert.match(result.text||'',/No puedo verificar/i);
  assert.equal(result.handoffRequired,false,'safe degradation must not transfer conversation ownership to a human');
  assert.equal(result.authority.domainEffectsAllowed,false);
  assert.equal(audit.length,0,'degraded reply must not pretend an agent evaluation was authoritative');
});

test('monetary messages may receive a non-confirming autonomous response but never a domain action',async()=>{
  const {deps}=dependencies();
  const service=new AutonomousReplyService(deps as any);
  const result=await service.decide({
    ...baseInput,
    text:'juego 100 al 4',
    responsePlan:{...basePlan,text:'Contenido monetario recibido. No se confirmó ninguna operación.',intent:'ACK_RECEIVED'}
  } as any);
  assert.equal(result.action,'SEND');
  assert.equal(result.reason,'AUTONOMOUS_NON_CONFIRMING_RESPONSE');
  assert.match(result.text||'',/No se confirmó ninguna operación/);
  assert.equal(result.authority.financialAuthority,false);
  assert.equal(result.authority.stateMutationAllowed,false);
});

test('audit persistence failure blocks source sending instead of creating unaudited autonomous replies',async()=>{
  const {deps}=dependencies({auditFails:true});
  const service=new AutonomousReplyService(deps as any);
  const result=await service.decide(baseInput as any);
  assert.equal(result.action,'HOLD');
  assert.equal(result.canSend,false);
  assert.equal(result.reason,'AUTONOMOUS_REPLY_AUDIT_PERSISTENCE_FAILED');
});

test('history, self messages, duplicates and rate-limited events never produce source replies',async()=>{
  for(const patch of [
    {historySync:true},
    {fromMe:true},
    {duplicate:true},
    {rateAllowed:false}
  ]){
    const {deps}=dependencies();
    const service=new AutonomousReplyService(deps as any);
    const result=await service.decide({...baseInput,...patch} as any);
    assert.equal(result.canSend,false);
  }
});
