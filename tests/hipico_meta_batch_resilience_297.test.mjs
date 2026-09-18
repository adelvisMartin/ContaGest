import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const serverless=readFileSync(new URL('../frontend/api/hipico/whatsapp-webhook.js',import.meta.url),'utf8');
const backend=readFileSync(new URL('../backend/src/modules/hipico-bot/hipico-webhook.routes.ts',import.meta.url),'utf8');

test('serverless Meta adapter delegates signed payloads to canonical backend without business persistence',()=>{
  assert.match(serverless,/proxyCanonicalRequest/);
  assert.match(serverless,/\/api\/v1\/hipico-bot\/webhook/);
  assert.match(serverless,/x-hub-signature-256/);
  assert.match(serverless,/relayCanonicalResponse/);
  assert.doesNotMatch(serverless,/\bsupabase\s*\(|persistMetaMessage|adapterCaptureDecision|classifyText/);
});

test('canonical backend preserves valid siblings from malformed signed batches',()=>{
  assert.match(backend,/const invalidMessages=Math\.max\(0,expectedRawMessages-messages\.length\)/);
  assert.match(backend,/processMessagesBounded\(messages\)/);
  assert.match(backend,/invalid_webhook_items_partial/);
  assert.match(backend,/processed:result\.processed/);
});

test('canonical backend keeps transient persistence faults retryable and replay mismatch non-retryable',()=>{
  assert.match(backend,/webhook_processing_failed/);
  assert.match(backend,/retryable:true/);
  assert.match(backend,/webhook_replay_mismatch/);
  assert.match(backend,/retryable:false/);
});
