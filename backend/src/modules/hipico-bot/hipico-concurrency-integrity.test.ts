import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { initialHandoffState } from './hipico-response-safety.js';
import { __test__ as domainTest } from './hipico-domain-event.store.js';

const handoffStore=readFileSync(new URL('./hipico-handoff.store.ts',import.meta.url),'utf8');
const domainStore=readFileSync(new URL('./hipico-domain-event.store.ts',import.meta.url),'utf8');

test('new handoff state starts at optimistic version zero',()=>{
  assert.equal(initialHandoffState('group-1','p1').version,0);
});

test('handoff persistence uses compare-and-set instead of blind overwrite',()=>{
  const save=handoffStore.slice(handoffStore.indexOf('export async function saveHandoff'),handoffStore.indexOf('export async function persistResponsePlan'));
  assert.match(save,/expectedVersion/);
  assert.match(save,/ON CONFLICT \("conversationKey"\) DO NOTHING/);
  assert.match(save,/AND "version"=\$\{expectedVersion\}/);
  assert.match(save,/HIPICO_HANDOFF_CONFLICT/);
  assert.doesNotMatch(save,/ON CONFLICT \("conversationKey"\) DO UPDATE/);
});

test('domain event replay is serialized by aggregate before source identity is checked',()=>{
  const lock=domainStore.indexOf('FOR UPDATE');
  const prior=domainStore.indexOf('const prior=await tx.$queryRaw');
  assert.ok(lock>=0&&prior>lock);
  assert.match(domainStore,/HIPICO_DOMAIN_REPLAY_MISMATCH/);
  assert.match(domainStore,/source_message_key=\$\{sourceMessageKey\}/);
  assert.match(domainStore,/AND state_version=\$\{current\.stateVersion\}/);
});

test('domain replay accepts only immutable evidence-equivalent payload',()=>{
  const existing={
    id:'event-1',eventType:'RESULT_RECORDED',disposition:'applied',previousState:'CLOSED',nextState:'RESULT_RECEIVED',reason:'VALID_TRANSITION',
    sourceMessageId:'msg-1',rawMessage:'llegada 5-2-1',normalizedPayload:{board:[5,2,1],meta:{track:'Churchill Downs'}},
    actorRef:'operator-1',source:'whatsapp',parserVersion:'v1',schemaVersion:1,originalEventId:null,
    eventTimestamp:'2026-09-11T17:00:00.000Z'
  };
  const event={
    type:'RESULT_RECORDED' as const,sourceMessageKey:'source-key',sourceMessageId:'msg-1',rawMessage:'llegada 5-2-1',
    normalizedPayload:{meta:{track:'Churchill Downs'},board:[5,2,1]},actorRef:'operator-1',source:'whatsapp',parserVersion:'v1',schemaVersion:1,
    timestamp:'2026-09-11T13:00:00-04:00'
  };
  assert.doesNotThrow(()=>domainTest.assertDomainReplay(existing,event));
  for(const changed of [
    {...event,rawMessage:'llegada 5-2-9'},
    {...event,sourceMessageId:'msg-2'},
    {...event,normalizedPayload:{meta:{track:'Churchill Downs'},board:[5,2,9]}},
    {...event,actorRef:'operator-2'},
    {...event,parserVersion:'v2'},
    {...event,requiresReview:true}
  ]){
    assert.throws(()=>domainTest.assertDomainReplay(existing,changed as any),(error:any)=>error?.code==='HIPICO_DOMAIN_REPLAY_MISMATCH');
  }
});

test('domain replay canonicalizes JSON object key order but preserves array order',()=>{
  assert.equal(domainTest.stableJson({b:2,a:{y:2,x:1}}),domainTest.stableJson({a:{x:1,y:2},b:2}));
  assert.notEqual(domainTest.stableJson({board:[5,2,1]}),domainTest.stableJson({board:[5,1,2]}));
});

test('domain reversal lookup cannot cross aggregate boundaries',()=>{
  const correction=domainStore.slice(domainStore.indexOf("if(input.event.type==='CORRECTION'"));
  assert.match(correction,/aggregate_kind=\$\{input\.aggregateKind\} AND aggregate_key=\$\{aggregateKey\}/);
  assert.match(correction,/original_event_id=\$\{originalId\}[\s\S]*owner_id=\$\{ownerId\}::uuid[\s\S]*aggregate_kind=\$\{input\.aggregateKind\}/);
});
