import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bridge=await readFile(new URL('../frontend/api/hipico/group-bridge-ingest.js',import.meta.url),'utf8');
const webhook=await readFile(new URL('../frontend/api/hipico/whatsapp-webhook.js',import.meta.url),'utf8');
const canonical=await readFile(new URL('../frontend/api/hipico/canonical-backend.js',import.meta.url),'utf8');

test('serverless inbound bridge is transport-only and delegates domain authority to canonical backend',()=>{
  assert.match(bridge,/from '\.\/canonical-backend\.js'/);
  assert.match(bridge,/proxyCanonicalRequest/);
  assert.match(bridge,/relayCanonicalResponse/);
  assert.match(bridge,/path:\s*'\/api\/v1\/hipico-bot\/bridge\/events'/);
  assert.doesNotMatch(bridge,/adapterCaptureDecision|adapterInitialClassification|storedClassification|adapter_hint_authoritative/);
  assert.doesNotMatch(bridge,/supabase\(|hipico_messages|hipico_ledger_entries/);
});

test('Meta webhook compatibility adapter forwards raw evidence and never classifies or persists business state',()=>{
  assert.match(webhook,/readRawBody/);
  assert.match(webhook,/from '\.\/canonical-backend\.js'/);
  assert.match(webhook,/proxyCanonicalRequest/);
  assert.match(webhook,/relayCanonicalResponse/);
  assert.match(webhook,/\/api\/v1\/hipico-bot\/webhook/);
  assert.match(webhook,/x-hub-signature-256/);
  assert.doesNotMatch(webhook,/adapterCaptureDecision|adapterInitialClassification|storedClassification|adapter_hint_authoritative/);
  assert.doesNotMatch(webhook,/supabase\(|hipico_messages|hipico_ledger_entries/);
});

test('canonical serverless proxy is path constrained fail-closed and response bounded',()=>{
  assert.match(canonical,/^const MAX_PROXY_RESPONSE_BYTES = 1024 \* 1024;/m);
  assert.match(canonical,/HIPICO_CANONICAL_API_BASE_URL/);
  assert.match(canonical,/HIPICO_CANONICAL_BACKEND_NOT_CONFIGURED/);
  assert.match(canonical,/HIPICO_CANONICAL_PATH_NOT_ALLOWED/);
  assert.match(canonical,/\^\\\/api\\\/v1\\\/hipico/);
  assert.match(canonical,/redirect:\s*'error'/);
  assert.match(canonical,/HIPICO_CANONICAL_RESPONSE_TOO_LARGE/);
});