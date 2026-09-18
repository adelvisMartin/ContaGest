import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adapterCaptureDecision } from '../frontend/api/hipico/_shared.js';

const bridge=await readFile(new URL('../frontend/api/hipico/group-bridge-ingest.js',import.meta.url),'utf8');
const meta=await readFile(new URL('../frontend/api/hipico/whatsapp-webhook.js',import.meta.url),'utf8');

test('serverless heuristic is advisory while persisted capture is always unclassified review',()=>{
  const result=adapterCaptureDecision('Llegada 7.3.1');
  assert.equal(result.storedClassification,'unclassified');
  assert.equal(result.storedConfidence,0);
  assert.equal(result.processingStatus,'review');
  assert.equal(result.domainAuthority,'backend_canonical_only');
  assert.equal(result.adapterHint.classification,'result');
  assert.ok(result.adapterHint.confidence>0);
});

test('linked-device serverless adapter delegates validated evidence to canonical backend and owns no business persistence',()=>{
  assert.match(bridge,/proxyCanonicalRequest/);
  assert.match(bridge,/path:\s*['"]\/api\/v1\/hipico-bot\/bridge\/events['"]/);
  assert.match(bridge,/body:\s*JSON\.stringify\(canonicalBridgeEvent\(body\)\)/);
  assert.match(bridge,/x-hipico-bridge-token/);
  assert.match(bridge,/canonical_backend_unavailable/);
  assert.doesNotMatch(bridge,/hipico_messages|hipico_bot_channels|hipico_shadow_evaluations/);
  assert.doesNotMatch(bridge,/adapterCaptureDecision|storedClassification|processing_status/);
  assert.doesNotMatch(bridge,/actions:\s*\[/);
  assert.doesNotMatch(bridge,/monetaryAutoApply/);
});

test('Meta serverless adapter delegates evidence and owns no classification or persistence',()=>{
  assert.match(meta,/proxyCanonicalRequest/);
  assert.match(meta,/path:'\/api\/v1\/hipico-bot\/webhook'/);
  assert.match(meta,/body:raw/);
  assert.match(meta,/relayCanonicalResponse/);
  assert.doesNotMatch(meta,/adapterCaptureDecision|storedClassification|storedConfidence|processing_status|domain_authority/);
  assert.doesNotMatch(meta,/\bsupabase\s*\(|persistMetaMessage/);
});
