import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { operatorActorRef, operatorTokenConfigured, operatorTokenValid } from './hipico-operator-security.js';

const TOKEN_A='A'.repeat(64);
const TOKEN_B='B'.repeat(64);

test('operator audit actor is derived server-side from the configured strong token',()=>{
  const envA={HIPICO_OPERATOR_CONTROL_TOKEN:TOKEN_A} as NodeJS.ProcessEnv;
  const envB={HIPICO_OPERATOR_CONTROL_TOKEN:TOKEN_B} as NodeJS.ProcessEnv;
  assert.equal(operatorTokenConfigured(envA),true);
  assert.equal(operatorTokenValid(TOKEN_A,envA),true);
  assert.equal(operatorTokenValid(TOKEN_B,envA),false);
  const actorA=operatorActorRef(envA);
  const actorARepeat=operatorActorRef(envA);
  const actorB=operatorActorRef(envB);
  assert.match(String(actorA),/^operator-token:[a-f0-9]{24}$/);
  assert.equal(actorA,actorARepeat);
  assert.notEqual(actorA,actorB);
  assert.equal(String(actorA).includes(TOKEN_A),false);
});

test('weak or missing operator secrets cannot produce an auditable actor identity',()=>{
  assert.equal(operatorActorRef({} as NodeJS.ProcessEnv),null);
  assert.equal(operatorActorRef({HIPICO_OPERATOR_CONTROL_TOKEN:'short'} as NodeJS.ProcessEnv),null);
});

test('canonical mutation route never persists the client supplied operatorId as actorRef',()=>{
  const source=readFileSync(new URL('./hipico-canonical.routes.ts',import.meta.url),'utf8');
  assert.match(source,/const actorRef = operatorActorRef\(\)/);
  assert.match(source,/actorRef,\n\s*source: 'canonical_operator_api'/);
  assert.doesNotMatch(source,/actorRef:\s*input\.operatorId/);
});
