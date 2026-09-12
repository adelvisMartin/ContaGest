import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { operatorActorRef } from './hipico-operator-security.js';

const routes=readFileSync(new URL('./hipico-bridge.routes.ts',import.meta.url),'utf8');
const strongA='a'.repeat(48);
const strongB='b'.repeat(48);

test('operator actor ref is deterministic, pseudonymous and bound to the configured authenticated secret',()=>{
  const first=operatorActorRef({HIPICO_OPERATOR_CONTROL_TOKEN:strongA} as NodeJS.ProcessEnv);
  const repeat=operatorActorRef({HIPICO_OPERATOR_CONTROL_TOKEN:strongA} as NodeJS.ProcessEnv);
  const other=operatorActorRef({HIPICO_OPERATOR_CONTROL_TOKEN:strongB} as NodeJS.ProcessEnv);
  assert.match(String(first),/^operator-token:[a-f0-9]{24}$/);
  assert.equal(first,repeat);
  assert.notEqual(first,other);
  assert.equal(String(first).includes(strongA),false);
  assert.equal(operatorActorRef({HIPICO_OPERATOR_CONTROL_TOKEN:'short'} as NodeJS.ProcessEnv),null);
});

test('bridge handoff derives durable actor attribution from authenticated operator identity, never request body',()=>{
  const handoff=routes.slice(routes.indexOf("router.post('/bridge/handoff'"),routes.indexOf("router.post('/bridge/events'"));
  assert.match(routes,/operatorActorRef/);
  assert.match(routes,/operatorId:z\.string\(\)\.trim\(\)\.min\(1\)\.max\(220\)\.optional\(\)/);
  assert.match(handoff,/const actorRef=operatorActorRef\(\)/);
  assert.match(handoff,/operatorId:actorRef/);
  assert.match(handoff,/actorId:actorRef/);
  assert.doesNotMatch(handoff,/operatorId:input\.operatorId/);
  assert.doesNotMatch(handoff,/actorId:input\.operatorId/);
});
