import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test__ } from '../frontend/api/hipico/whatsapp-webhook.js';
import { __test__ as statusTest } from '../frontend/api/hipico/status.js';

const source=await readFile(new URL('../frontend/api/hipico/whatsapp-webhook.js',import.meta.url),'utf8');
const statusSource=await readFile(new URL('../frontend/api/hipico/status.js',import.meta.url),'utf8');
const backendWebhook=await readFile(new URL('../backend/src/modules/hipico-bot/hipico-webhook.routes.ts',import.meta.url),'utf8');
const backendSecurity=await readFile(new URL('../backend/src/modules/hipico-bot/hipico-webhook-security.ts',import.meta.url),'utf8');

test('Meta serverless endpoint is a raw compatibility adapter to the canonical backend',()=>{
  assert.match(source,/bodyParser:\s*false/);
  assert.match(source,/proxyCanonicalRequest/);
  assert.match(source,/\/api\/v1\/hipico-bot\/webhook/);
  assert.match(source,/x-hub-signature-256/);
  assert.match(source,/readRawBody/);
  assert.doesNotMatch(source,/classifyText/);
  assert.doesNotMatch(source,/supabase\(/);
  assert.doesNotMatch(source,/HIPICO_META_APP_SECRET/);
});

test('Meta verification query parameters are forwarded without reinterpretation',()=>{
  const path=__test__.webhookPath({query:{'hub.mode':'subscribe','hub.verify_token':'token','hub.challenge':'123'}});
  const url=new URL(`https://example.test${path}`);
  assert.equal(url.pathname,'/api/v1/hipico-bot/webhook');
  assert.equal(url.searchParams.get('hub.mode'),'subscribe');
  assert.equal(url.searchParams.get('hub.verify_token'),'token');
  assert.equal(url.searchParams.get('hub.challenge'),'123');
});

test('canonical backend retains strong HMAC, constant-time verification and placeholder-safe secrets',()=>{
  assert.match(backendWebhook,/webhookSignatureValid\(raw/);
  assert.match(backendWebhook,/webhookVerifyTokenValid\(token\)/);
  assert.match(backendSecurity,/MIN_WEBHOOK_SECRET_LENGTH=MIN_HIPICO_RUNTIME_SECRET_BYTES/);
  assert.match(backendSecurity,/crypto\.createHmac\('sha256'/);
  assert.match(backendSecurity,/crypto\.timingSafeEqual/);
  assert.match(backendSecurity,/hipicoRuntimeSecretConfigured/);
});

test('canonical backend pins phone identity, replay integrity and durable persistence for real messages',()=>{
  assert.match(backendWebhook,/WEBHOOK_PHONE_NUMBER_MISMATCH/);
  assert.match(backendWebhook,/webhookPhoneNumberId/);
  assert.match(backendWebhook,/HipicoBotStore\.dbReady\(true\)/);
  assert.match(backendWebhook,/processMessagesBounded/);
  assert.match(backendWebhook,/assertPersistedWebhookReplay/);
  assert.match(backendWebhook,/webhook_replay_mismatch/);
});

test('compatibility status uses canonical backend webhook configuration names and strong boundaries',()=>{
  const strong='x'.repeat(40);
  const ready=statusTest.secretReadiness({WHATSAPP_VERIFY_TOKEN:strong,WHATSAPP_APP_SECRET:strong,WHATSAPP_PHONE_NUMBER_ID:'1234567890'});
  assert.equal(ready.webhookVerifyTokenStrong,true);
  assert.equal(ready.webhookAppSecretStrong,true);
  assert.equal(ready.webhookPhoneNumberIdValid,true);
  assert.equal(statusTest.secretReadiness({WHATSAPP_VERIFY_TOKEN:'short'}).webhookVerifyTokenStrong,false);
  assert.match(statusSource,/\['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_PHONE_NUMBER_ID'\]/);
  assert.match(statusSource,/webhookAuthority:\s*'canonical_backend'/);
});

test('oversized adapter requests fail closed before proxy and backend owns semantic parsing',()=>{
  assert.match(source,/request_body_too_large/);
  assert.match(source,/status\(413\)/);
  assert.match(source,/retryable:\s*false/);
  assert.doesNotMatch(source,/JSON\.parse\(raw/);
});

test('adapter failure is retryable without logging raw signed payload',()=>{
  assert.match(source,/canonical_backend_unavailable/);
  assert.match(source,/console\.error\('hipico canonical webhook proxy failed', \{ message:/);
  assert.doesNotMatch(source,/console\.error\([^\n]*raw/);
  assert.doesNotMatch(source,/console\.error\([^\n]*body/);
});
