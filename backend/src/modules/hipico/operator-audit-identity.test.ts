import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { operatorActorRef } from '../hipico-bot/hipico-operator-security.js';

const documentRoutes = readFileSync(new URL('./document.routes.ts', import.meta.url), 'utf8');
const raceRoutes = readFileSync(new URL('./race.routes.ts', import.meta.url), 'utf8');

test('operator actor reference is stable pseudonymous identity and never contains the credential', () => {
  const env = {
    HIPICO_OPERATOR_CONTROL_TOKEN: 'test-operator-token-abcdefghijklmnopqrstuvwxyz-123456'
  } as NodeJS.ProcessEnv;
  const actor = operatorActorRef(env);
  assert.match(String(actor), /^operator-token:[a-f0-9]{24}$/);
  assert.equal(String(actor).includes(String(env.HIPICO_OPERATOR_CONTROL_TOKEN)), false);
  assert.equal(operatorActorRef(env), actor);
});

test('document approval derives actor server-side and rejects client-supplied operatorId fields', () => {
  assert.match(documentRoutes, /operatorActorRef\(\)/);
  assert.match(documentRoutes, /z\.object\(\{classification:classificationSchema\}\)\.strict\(\)/);
  assert.doesNotMatch(documentRoutes, /operatorId:z\./);
  assert.match(documentRoutes, /store\.approve\([^\n]+,actor\)/);
});

test('race command derives actor server-side and strict input cannot spoof actorId or actorType', () => {
  assert.match(raceRoutes, /operatorActorRef\(\)/);
  assert.match(raceRoutes, /const commandSchema=z\.object\([\s\S]*?\)\.strict\(\)/);
  assert.doesNotMatch(raceRoutes, /actorId:z\./);
  assert.doesNotMatch(raceRoutes, /actorType:z\./);
  assert.match(raceRoutes, /actorId:actor,actorType:'operator'/);
});
