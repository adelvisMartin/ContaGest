import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { initialHandoffState } from './hipico-response-safety.js';

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

test('domain reversal lookup cannot cross aggregate boundaries',()=>{
  const correction=domainStore.slice(domainStore.indexOf("if(input.event.type==='CORRECTION'"));
  assert.match(correction,/aggregate_kind=\$\{input\.aggregateKind\} AND aggregate_key=\$\{aggregateKey\}/);
  assert.match(correction,/original_event_id=\$\{originalId\}[\s\S]*owner_id=\$\{ownerId\}::uuid[\s\S]*aggregate_kind=\$\{input\.aggregateKind\}/);
});
