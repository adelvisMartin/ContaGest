import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adapterCaptureDecision } from '../frontend/api/hipico/_shared.js';

const bridge=await readFile(new URL('../frontend/api/hipico/group-bridge-ingest.js',import.meta.url),'utf8');
const meta=await readFile(new URL('../frontend/api/hipico/whatsapp-webhook.js',import.meta.url),'utf8');

test('adapter heuristic remains advisory for callers that use it outside canonical transport adapters',()=>{
  const result=adapterCaptureDecision('Llegada 7.3.1');
  assert.equal(result.storedClassification,'unclassified');
  assert.equal(result.storedConfidence,0);
  assert.equal(result.processingStatus,'review');
  assert.equal(result.domainAuthority,'backend_canonical_only');
  assert.equal(result.adapterHint.classification,'result');
  assert.equal(result.adapterHintAuthoritative,false);
  assert.ok(result.adapterHint.confidence>0);
});

test('linked-device serverless adapter is transport-only and delegates domain authority',()=>{
  assert.match(bridge,/proxyCanonicalRequest/);
  assert.match(bridge,/\/api\/v1\/hipico-bot\/bridge\/events/);
  assert.match(bridge,/canonicalBridgeEvent/);
  assert.doesNotMatch(bridge,/adapterCaptureDecision/);
  assert.doesNotMatch(bridge,/classification:\s*capture/);
  assert.doesNotMatch(bridge,/processing_status/);
  assert.doesNotMatch(bridge,/supabase\(/);
  assert.doesNotMatch(bridge,/monetaryAutoApply/);
});

test('Meta serverless adapter preserves raw transport evidence and delegates domain authority',()=>{
  assert.match(meta,/bodyParser:\s*false/);
  assert.match(meta,/readRawBody/);
  assert.match(meta,/x-hub-signature-256/);
  assert.match(meta,/proxyCanonicalRequest/);
  assert.match(meta,/\/api\/v1\/hipico-bot\/webhook/);
  assert.doesNotMatch(meta,/adapterCaptureDecision/);
  assert.doesNotMatch(meta,/classification:\s*capture/);
  assert.doesNotMatch(meta,/supabase\(/);
});
