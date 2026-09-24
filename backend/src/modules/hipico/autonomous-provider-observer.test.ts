import assert from 'node:assert/strict';
import test from 'node:test';
import { observeAutonomousProvider, __test__ } from './autonomous-provider-observer.js';

const ownerId='11111111-1111-4111-8111-111111111111';

function deps(overrides:Record<string,unknown>={}){
  const calls:any[]=[];
  const candidate={
    intent:'query:NEXT_RACE',
    confidence:.995,
    tool:'queryNextRace',
    arguments:{},
    risk:'safe',
    source:'deterministic',
    modelVersion:null
  } as any;
  const riskPolicy={
    disposition:'SUGGEST',
    reason:'SHADOW_MODE',
    version:'hipico-risk-policy-v1',
    evidenceState:'MISSING',
    financialAuthority:false,
    autonomousSendAllowed:false
  } as any;
  return{
    calls,
    api:{
      engine:{evaluate:async()=>({candidate,canAct:false,riskPolicy})},
      provider:{
        publicStatus:()=>({providerId:'typesafe-jev',mode:'SHADOW',enabled:true,configured:true,authoritative:false,reasons:[]}),
        observe:async()=>({
          providerId:'typesafe-jev',mode:'SHADOW',status:'OBSERVED',authoritative:false,canAuthorize:false,
          model:'jev-test',latencyMs:4,failureCode:null,
          decision:{
            intentClass:'query_next_race',intentConfidence:.99,intentProbabilities:{query_next_race:.99},
            humanReviewProbability:.01,candidateAgreementProbability:.99
          },
          usage:{inputUnits:10,outputUnits:2}
        })
      },
      store:{
        recordEvaluation:async(input:any)=>{calls.push(['record',input]);return{id:'eval-1'};},
        decisionProviderMetrics:async()=>({
          providerId:'typesafe-jev',
          historical:{evaluations:200,observed:200,unavailable:0,skipped:0,reviewedObserved:200,intentClassMatched:200,safetyDisagreements:0},
          recent:{evaluations:75,observed:75,unavailable:0,skipped:0,reviewedObserved:75,intentClassMatched:75,safetyDisagreements:0},
          byIntentClass:{},
          window:{recentDays:30,recentSince:'2026-08-25T00:00:00.000Z',metricSchemaVersion:'jev-shadow-v1'},
          metricsSignature:'a'.repeat(64)
        })
      },
      ...overrides
    }
  };
}

test('autonomous provider observer stores hashed source identity and never grants canAct',async()=>{
  const fake=deps();
  const result=await observeAutonomousProvider({
    ownerId,groupKey:'club-hipico',groupId:'120363111111111111@g.us',
    text:'cual sigue?',sourceMessageId:'raw-whatsapp-message-id',humanOwned:false,systemHealthy:true
  },fake.api as any);

  assert.equal(result.evaluationId,'eval-1');
  assert.equal(result.observation?.status,'OBSERVED');
  assert.equal(result.readiness?.eligibleForAssistedRanking,true);
  assert.equal(fake.calls.length,1);
  const persisted=fake.calls[0][1];
  assert.equal(persisted.canAct,false);
  assert.notEqual(persisted.evidence.sourceMessageRef,'raw-whatsapp-message-id');
  assert.match(persisted.evidence.sourceMessageRef,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(persisted.evidence).includes('raw-whatsapp-message-id'),false);
});

test('provider evidence failure is best-effort and cannot block deterministic chat autonomy',async()=>{
  const fake=deps({
    provider:{
      publicStatus:()=>({providerId:'typesafe-jev',mode:'SHADOW',enabled:true,configured:true,authoritative:false,reasons:[]}),
      observe:async()=>{throw Object.assign(new Error('provider down'),{code:'JEV_TEST_DOWN'});}
    }
  });
  const result=await observeAutonomousProvider({
    ownerId,groupKey:'club-hipico',groupId:'120363111111111111@g.us',
    text:'hola',sourceMessageId:'m-2',humanOwned:false,systemHealthy:true
  },fake.api as any);
  assert.equal(result.observation,null);
  assert.equal(result.readiness,null);
  assert.equal(result.evaluationId,null);
  assert.equal(result.failureCode,'JEV_TEST_DOWN');
});

test('missing owner skips provider persistence without exposing source content',async()=>{
  const fake=deps();
  const result=await observeAutonomousProvider({
    ownerId:null,groupKey:'club-hipico',groupId:'120363111111111111@g.us',
    text:'hola',sourceMessageId:'m-3',humanOwned:false,systemHealthy:true
  },fake.api as any);
  assert.equal(result.failureCode,'OWNER_NOT_CONFIGURED');
  assert.equal(fake.calls.length,0);
});

test('source evidence reference is deterministic and one-way shaped',()=>{
  const first=__test__.sourceEvidenceRef('wamid:abc');
  const second=__test__.sourceEvidenceRef('wamid:abc');
  assert.equal(first,second);
  assert.match(first,/^[a-f0-9]{64}$/);
  assert.notEqual(first,'wamid:abc');
});
