import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const operator=readFileSync(new URL('./hipico-operator.routes.ts',import.meta.url),'utf8');
const webhook=readFileSync(new URL('./hipico-webhook.routes.ts',import.meta.url),'utf8');
const orchestration=readFileSync(new URL('./hipico-webhook-outbound.ts',import.meta.url),'utf8');

test('production outbound authority is canonical hipico_outbox',()=>{
  assert.match(orchestration,/enqueueCanonicalOutbound/);
  assert.match(operator,/listCanonicalOutbox/);
  assert.match(operator,/dispatchCanonicalOutbound/);
  assert.match(webhook,/dispatchCanonicalOutbound/);
  assert.match(webhook,/processIncomingCanonical/);
  assert.doesNotMatch(webhook,/\bprocessIncoming\b/);
  assert.doesNotMatch(operator,/HipicoBotStore\.claimForSend/);
  assert.doesNotMatch(operator,/HipicoBotStore\.markSent/);
  assert.doesNotMatch(operator,/HipicoBotStore\.queueIdempotent/);
});

test('automatic webhook flow cannot directly send without canonical dispatch lease',()=>{
  assert.match(orchestration,/enqueueCanonicalOutbound/);
  assert.doesNotMatch(orchestration,/sendCloudText\(/);
  assert.doesNotMatch(orchestration,/claimForSend\(/);
  assert.match(webhook,/dispatchCanonicalOutbound\(\{ownerId,id:String\(result\.outbox\.id\)\}\)/);
});
