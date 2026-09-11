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
  const persist=domainStore.slice(domainStore.indexOf('export async function persistHipicoDomainEvent'));
  const lock=persist.indexOf('FOR UPDATE');
  const prior=persist.indexOf('const prior=await tx.$queryRaw');
  assert.ok(lock>=0&&prior>lock);
  assert.match(persist,/assertDomainReplay\(prior\[0\],input\.event\)/);
  assert.match(persist,/source_message_key=\$\{sourceMessageKey\}/);
  assert.match(persist,/AND state_version=\$\{current\.stateVersion\}/);
});

test('same domain source identity accepts only the same immutable source facts',()=>{
  const existing={
    id:'e1',eventType:'CORRECTION',disposition:'evidence_only',previousState:'OPEN',nextState:'OPEN',reason:'APPEND_ONLY_EVIDENCE',
    sourceMessageId:'msg-1',rawMessage:'corrige 5',actorRef:'p1',source:'whatsapp-web-bridge',originalEventId:'original-1'
  } as any;
  const input={type:'CORRECTION',sourceMessageKey:'source-1',sourceMessageId:'msg-1',rawMessage:'corrige 5',actorRef:'p1',source:'whatsapp-web-bridge',originalEventId:'original-1'} as any;
  assert.doesNotThrow(()=>domainTest.assertDomainReplay(existing,input));
  for(const changed of [
    {...input,type:'REVERSAL'},
    {...input,sourceMessageId:'msg-2'},
    {...input,rawMessage:'corrige 8'},
    {...input,actorRef:'p2'},
    {...input,source:'other-source'},
    {...input,originalEventId:'original-2'}
  ]){
    assert.throws(()=>domainTest.assertDomainReplay(existing,changed),(error:any)=>error?.code==='HIPICO_DOMAIN_REPLAY_MISMATCH');
  }
});

test('domain replay intentionally ignores parser-derived and retry-time metadata',()=>{
  const existing={id:'e1',eventType:'BET_RECORDED',disposition:'evidence_only',previousState:'OPEN',nextState:'OPEN',reason:'APPEND_ONLY_EVIDENCE',sourceMessageId:'msg-1',rawMessage:'5 x 100',actorRef:'p1',source:'whatsapp-web-bridge',originalEventId:null} as any;
  const replay={type:'BET_RECORDED',sourceMessageKey:'source-1',sourceMessageId:'msg-1',rawMessage:'5 x 100',actorRef:'p1',source:'whatsapp-web-bridge',originalEventId:null,parserVersion:'new-parser',schemaVersion:99,timestamp:'2030-01-01T00:00:00Z',normalizedPayload:{changed:true}} as any;
  assert.doesNotThrow(()=>domainTest.assertDomainReplay(existing,replay));
});

test('domain reversal lookup cannot cross aggregate boundaries',()=>{
  const correction=domainStore.slice(domainStore.indexOf("if(input.event.type==='CORRECTION'"));
  assert.match(correction,/aggregate_kind=\$\{input\.aggregateKind\} AND aggregate_key=\$\{aggregateKey\}/);
  assert.match(correction,/original_event_id=\$\{originalId\}[\s\S]*owner_id=\$\{ownerId\}::uuid[\s\S]*aggregate_kind=\$\{input\.aggregateKind\}/);
});
