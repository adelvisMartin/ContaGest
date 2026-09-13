import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service=readFileSync(new URL('./hipico-bot.service.ts',import.meta.url),'utf8');
const operator=readFileSync(new URL('./hipico-operator.routes.ts',import.meta.url),'utf8');
const webhook=readFileSync(new URL('./hipico-webhook.routes.ts',import.meta.url),'utf8');

test('production outbound authority is canonical hipico_outbox',()=>{
  assert.match(service,/enqueueCanonicalOutbound/);
  assert.match(operator,/listCanonicalOutbox/);
  assert.match(operator,/dispatchCanonicalOutbound/);
  assert.match(webhook,/dispatchCanonicalOutbound/);
  assert.doesNotMatch(operator,/HipicoBotStore\.claimForSend/);
  assert.doesNotMatch(operator,/HipicoBotStore\.markSent/);
  assert.doesNotMatch(operator,/HipicoBotStore\.queueIdempotent/);
});

test('automatic webhook flow cannot directly send without canonical dispatch lease',()=>{
  const processStart=service.indexOf('export async function processIncoming');
  const processBody=service.slice(processStart);
  assert.match(processBody,/enqueueCanonicalOutbound/);
  assert.doesNotMatch(processBody,/sendCloudText\(/);
  assert.doesNotMatch(processBody,/claimForSend\(/);
});
