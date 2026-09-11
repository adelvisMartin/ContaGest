import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __test__ } from './hipico-webhook.routes.js';

const source=readFileSync(new URL('./hipico-webhook.routes.ts',import.meta.url),'utf8');

test('Cloud webhook is bound to a valid configured WhatsApp phone number id',()=>{
  const env={WHATSAPP_PHONE_NUMBER_ID:'1234567890'};
  assert.equal(__test__.configuredPhoneNumberId(env),'1234567890');
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'1234567890'}],env),null);
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'9999999999'}],env),'WEBHOOK_PHONE_NUMBER_MISMATCH');
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:''}],env),'WEBHOOK_PHONE_NUMBER_MISMATCH');
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'1234567890'}],{}),'WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED');
  assert.equal(__test__.configuredPhoneNumberId({WHATSAPP_PHONE_NUMBER_ID:'phone-id'}),'');
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'phone-id'}],{WHATSAPP_PHONE_NUMBER_ID:'phone-id'}),'WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED');
});

test('Cloud webhook uses canonical strong Meta runtime security and never legacy service auth helpers',()=>{
  assert.match(source,/import \{ metaSignatureValid, metaVerifyTokenValid, metaWebhookRuntimeConfigured \} from '\.\/hipico-meta-security\.js'/);
  assert.match(source,/hipicoNumericProviderIdConfigured/);
  assert.doesNotMatch(source,/import \{[^}]*signatureValid[^}]*\} from '\.\/hipico-bot\.service\.js'/);
  assert.doesNotMatch(source,/import \{[^}]*operatorTokenValid[^}]*\} from '\.\/hipico-bot\.service\.js'/);
  assert.match(source,/metaWebhookRuntimeConfigured\(\)/);
  assert.match(source,/metaVerifyTokenValid\(token\)/);
  assert.doesNotMatch(source,/metaWebhookSecretsConfigured\(\)/);
});

test('Cloud webhook verifies runtime readiness and signature before identity and processing',()=>{
  const runtime=source.indexOf('if(!metaWebhookRuntimeConfigured())');
  const signature=source.indexOf('metaSignatureValid(raw');
  const extraction=source.indexOf('extractMessages(req.body)');
  const identity=source.indexOf('webhookIdentityError(messages)');
  const processing=source.indexOf('processMessagesBounded(messages)');
  assert.ok(runtime>=0&&signature>runtime&&extraction>signature&&identity>extraction&&processing>identity);
});

test('Cloud webhook never silently truncates a valid signed batch',()=>{
  assert.equal(__test__.WEBHOOK_PROCESSING_CONCURRENCY,10);
  assert.doesNotMatch(source,/extractMessages\(req\.body\)\.slice\(/);
  assert.match(source,/for\(let offset=0;offset<messages\.length;offset\+=WEBHOOK_PROCESSING_CONCURRENCY\)/);
});

test('partial processing failure is retryable instead of being acknowledged with HTTP 200',()=>{
  assert.match(source,/if\(result\.failed>0\)/);
  assert.match(source,/status\(503\)\.json\(\{/);
  assert.match(source,/error:'webhook_processing_failed'/);
  assert.match(source,/retryable:true/);
  assert.match(source,/Dedupe makes the successful subset safe/);
});

test('foreign phone-number events are rejected as non-retryable before persistence',()=>{
  const identity=source.indexOf("identityError==='WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED'");
  const mismatch=source.indexOf("error:'webhook_phone_number_mismatch'");
  const processing=source.indexOf('processMessagesBounded(messages)');
  assert.ok(identity>=0&&mismatch>identity&&processing>mismatch);
  assert.match(source,/status\(400\).*retryable:false/s);
});

test('signed status-only callbacks may bypass PostgreSQL but not invalid runtime identity',()=>{
  const empty=source.indexOf('if(messages.length===0)');
  const db=source.indexOf('HipicoBotStore.dbReady(true)');
  const runtime=source.indexOf('if(!metaWebhookRuntimeConfigured())');
  assert.ok(runtime>=0&&empty>runtime&&db>empty);
  assert.match(source,/received:0,processed:0,failed:0/);
});
