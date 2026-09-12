import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const serverless=readFileSync(new URL('../frontend/api/hipico/whatsapp-webhook.js',import.meta.url),'utf8');
const backend=readFileSync(new URL('../backend/src/modules/hipico-bot/hipico-webhook.routes.ts',import.meta.url),'utf8');

test('serverless Meta batch isolates permanent replay mismatch to the offending message',()=>{
  const loop=serverless.indexOf('for (const message of validMessages)');
  const mismatch=serverless.indexOf("if(error?.code==='HIPICO_META_REPLAY_MISMATCH')",loop);
  const continuation=serverless.indexOf('continue;',mismatch);
  const response=serverless.indexOf('if(mismatched>0)',continuation);
  assert.ok(loop>=0&&mismatch>loop&&continuation>mismatch&&response>continuation);
  assert.match(serverless,/mismatched\+=1/);
  assert.match(serverless,/acceptedMessages:accepted/);
  assert.match(serverless,/error:'replay_mismatch'/);
  assert.doesNotMatch(serverless,/catch \(error\) \{\s*if\(error\?\.code==='HIPICO_META_REPLAY_MISMATCH'\)\{\s*return res\.status/);
});

test('backend and serverless both preserve valid siblings from malformed signed batches',()=>{
  assert.match(serverless,/const validMessages=messages\.filter\(\(message\)=>validMetaMessageIdentity\(message\)\)/);
  assert.match(serverless,/error:'invalid_message_identity_partial'/);
  assert.match(serverless,/for \(const message of validMessages\)/);

  assert.match(backend,/const invalidMessages=Math\.max\(0,expectedRawMessages-messages\.length\)/);
  assert.match(backend,/const result=await processMessagesBounded\(messages\)/);
  assert.match(backend,/error:'invalid_message_identity_partial'/);
});

test('transient serverless persistence faults remain retryable after idempotent sibling writes',()=>{
  assert.match(serverless,/throw error;[\s\S]*console\.error\('hipico whatsapp webhook'/);
  assert.match(serverless,/status\(503\)\.json\(\{ ok: false, retryable:true, error: 'webhook_processing_failed'/);
  assert.match(serverless,/resolution=ignore-duplicates,return=representation/);
  assert.match(serverless,/assertDuplicateMetaReplay/);
});
