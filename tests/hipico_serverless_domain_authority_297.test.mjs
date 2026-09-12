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

test('linked-device serverless adapter persists capture semantics and exposes hint separately',()=>{
  assert.match(bridge,/classification:\s*capture\.storedClassification/);
  assert.match(bridge,/confidence:\s*capture\.storedConfidence/);
  assert.match(bridge,/processing_status:\s*capture\.processingStatus/);
  assert.match(bridge,/domain_authority:\s*capture\.domainAuthority/);
  assert.match(bridge,/adapter_hint_authoritative:\s*false/);
  assert.match(bridge,/adapter_hint:\s*capture\.adapterHint/);
  assert.match(bridge,/adapterHint:\s*capture\.adapterHint/);
  assert.match(bridge,/domainAuthority:\s*capture\.domainAuthority/);
  assert.doesNotMatch(bridge,/processingStatus\s*=\s*classification/);
  assert.match(bridge,/actions:\s*\[\]/);
  assert.match(bridge,/monetaryAutoApply:\s*false/);
});

test('Meta serverless adapter also persists only review capture and never authoritative intent',()=>{
  assert.match(meta,/classification:\s*capture\.storedClassification/);
  assert.match(meta,/confidence:\s*capture\.storedConfidence/);
  assert.match(meta,/processing_status:\s*capture\.processingStatus/);
  assert.match(meta,/domain_authority:\s*capture\.domainAuthority/);
  assert.match(meta,/adapter_hint_authoritative:\s*false/);
  assert.match(meta,/adapter_hint:\s*capture\.adapterHint/);
  assert.match(meta,/domainAuthority:'backend_canonical_only'/);
});