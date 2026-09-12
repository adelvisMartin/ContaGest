import assert from 'node:assert/strict';
import test from 'node:test';
import { __test__ } from './hipico-domain-event.store.js';

function existing(overrides:Record<string,unknown>={}){
  return{
    id:'evt-1',
    eventType:'RACE_OPENED',
    disposition:'review',
    previousState:'PREPARING',
    nextState:'PREPARING',
    reason:'AMBIGUOUS_OR_UNKNOWN',
    sourceMessageId:'msg-1',
    rawMessage:'Abre Churchill Downs carrera 4',
    normalizedPayload:{raceContextComplete:true,racetrack:'Churchill Downs',raceNumber:4},
    actorRef:'operator-1',
    source:'canonical_operator_api',
    parserVersion:'parser-v1',
    schemaVersion:1,
    eventTimestamp:new Date('2026-09-11T20:00:00.000Z'),
    originalEventId:null,
    ...overrides
  } as any;
}

function incoming(overrides:Record<string,unknown>={}){
  return{
    type:'RACE_OPENED',
    sourceMessageKey:'source-1',
    sourceMessageId:'msg-1',
    rawMessage:'Abre Churchill Downs carrera 4',
    normalizedPayload:{raceNumber:4,racetrack:'Churchill Downs',raceContextComplete:true},
    actorRef:'operator-1',
    source:'canonical_operator_api',
    parserVersion:'parser-v1',
    schemaVersion:1,
    timestamp:'2026-09-11T20:00:00.000Z',
    originalEventId:null,
    requiresReview:true,
    ...overrides
  } as any;
}

function mismatch(action:()=>void){
  assert.throws(action,(error:any)=>error?.code==='HIPICO_DOMAIN_REPLAY_MISMATCH');
}

test('canonical domain replay accepts identical immutable evidence independent of JSON object key order',()=>{
  assert.doesNotThrow(()=>__test__.assertDomainReplay(existing(),incoming()));
  assert.equal(
    __test__.canonicalJson({b:2,a:{z:3,y:1}}),
    __test__.canonicalJson({a:{y:1,z:3},b:2})
  );
});

test('canonical domain replay normalizes equivalent timestamp offsets to the same instant',()=>{
  assert.doesNotThrow(()=>__test__.assertDomainReplay(
    existing({eventTimestamp:'2026-09-11T20:00:00.000Z'}),
    incoming({timestamp:'2026-09-11T15:00:00-05:00'})
  ));
});

test('canonical domain replay rejects changed structured evidence, parser, schema or timestamp',()=>{
  mismatch(()=>__test__.assertDomainReplay(existing(),incoming({normalizedPayload:{raceNumber:5,racetrack:'Churchill Downs',raceContextComplete:true}})));
  mismatch(()=>__test__.assertDomainReplay(existing(),incoming({parserVersion:'parser-v2'})));
  mismatch(()=>__test__.assertDomainReplay(existing(),incoming({schemaVersion:2})));
  mismatch(()=>__test__.assertDomainReplay(existing(),incoming({timestamp:'2026-09-11T20:00:01.000Z'})));
});

test('same source identity cannot be replayed from review into confirmed state semantics',()=>{
  mismatch(()=>__test__.assertDomainReplay(existing(),incoming({requiresReview:false})));
  assert.equal(__test__.persistedRequiresReview(existing()),true);
  assert.equal(__test__.incomingRequiresReview(incoming({requiresReview:false})),false);
});

test('explicit event id and original source facts are immutable when supplied',()=>{
  assert.doesNotThrow(()=>__test__.assertDomainReplay(existing(),incoming({eventId:'evt-1'})));
  mismatch(()=>__test__.assertDomainReplay(existing(),incoming({eventId:'evt-2'})));
  mismatch(()=>__test__.assertDomainReplay(existing(),incoming({sourceMessageId:'msg-2'})));
  mismatch(()=>__test__.assertDomainReplay(existing(),incoming({rawMessage:'texto cambiado'})));
  mismatch(()=>__test__.assertDomainReplay(existing(),incoming({actorRef:'operator-2'})));
  mismatch(()=>__test__.assertDomainReplay(existing(),incoming({originalEventId:'evt-original'})));
});

test('legacy callers without an explicit timestamp remain retry-compatible without inventing a new identity fact',()=>{
  assert.doesNotThrow(()=>__test__.assertDomainReplay(existing(),incoming({timestamp:undefined})));
});
