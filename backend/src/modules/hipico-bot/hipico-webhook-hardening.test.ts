import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __test__ } from './hipico-webhook.routes.js';

const source=readFileSync(new URL('./hipico-webhook.routes.ts',import.meta.url),'utf8');

test('Cloud webhook is bound to the configured WhatsApp phone number id',()=>{
  const env={WHATSAPP_PHONE_NUMBER_ID:'1234567890'};
  assert.equal(__test__.configuredPhoneNumberId(env),'1234567890');
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'1234567890'}],env),null);
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'9999999999'}],env),'WEBHOOK_PHONE_NUMBER_MISMATCH');
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:''}],env),'WEBHOOK_PHONE_NUMBER_MISMATCH');
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'1234567890'}],{}),'WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED');
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'1234567890'}],{WHATSAPP_PHONE_NUMBER_ID:'not-numeric'}),'WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED');
});

test('Cloud webhook uses canonical strong Meta security and never legacy service auth helpers',()=>{
  assert.match(source,/import \{ metaSignatureValid, metaVerifyTokenValid, metaWebhookSecretsConfigured \} from '\.\/hipico-meta-security\.js'/);
  assert.doesNotMatch(source,/import \{[^}]*signatureValid[^}]*\} from '\.\/hipico-bot\.service\.js'/);
  assert.doesNotMatch(source,/import \{[^}]*operatorTokenValid[^}]*\} from '\.\/hipico-bot\.service\.js'/);
  assert.match(source,/metaWebhookSecretsConfigured\(\)/);
  assert.match(source,/metaVerifyTokenValid\(token\)/);
});

test('Cloud webhook verifies signature before identity, extraction and processing',()=>{
  const signature=source.indexOf('metaSignatureValid(raw');
  const envelopeIdentity=source.indexOf('rawEnvelopeIdentityError(req.body)');
  const extraction=source.indexOf('extractMessages(req.body)');
  const identity=source.indexOf('webhookIdentityError(messages)');
  const processing=source.indexOf('processMessagesBounded(messages)');
  assert.ok(signature>=0&&envelopeIdentity>signature&&extraction>envelopeIdentity&&identity>extraction&&processing>identity);
});

test('Cloud webhook never silently truncates or drops a valid signed batch',()=>{
  assert.equal(__test__.WEBHOOK_PROCESSING_CONCURRENCY,10);
  assert.doesNotMatch(source,/extractMessages\(req\.body\)\.slice\(/);
  assert.match(source,/for\(let offset=0;offset<messages\.length;offset\+=WEBHOOK_PROCESSING_CONCURRENCY\)/);
  assert.equal(__test__.rawMessageCount({entry:[{changes:[{value:{messages:[{id:'a'},{id:'b'}]}}]}]}),2);
  assert.match(source,/messages\.length!==expectedRawMessages/);
  assert.match(source,/error:'invalid_message_identity'/);
});

test('partial processing failure is retryable instead of being acknowledged with HTTP 200',()=>{
  assert.match(source,/if\(result\.failed>0\)/);
  assert.match(source,/status\(503\)\.json\(\{/);
  assert.match(source,/error:'webhook_processing_failed'/);
  assert.match(source,/retryable:true/);
});

test('foreign phone-number events are permanently rejected but transport-acknowledged to avoid redelivery loops',()=>{
  const envelopeIdentity=source.indexOf('rawEnvelopeIdentityError(req.body)');
  const mismatch=source.indexOf("error:'webhook_phone_number_mismatch'");
  const processing=source.indexOf('processMessagesBounded(messages)');
  assert.ok(envelopeIdentity>=0&&mismatch>envelopeIdentity&&processing>mismatch);
  assert.match(source,/status\(200\).*acknowledged:true.*accepted:false.*retryable:false.*webhook_phone_number_mismatch/s);
});

test('durable persistence is required before signed messages are acknowledged as processed',()=>{
  const dbReady=source.indexOf('HipicoBotStore.dbReady(true)');
  const processing=source.indexOf('processMessagesBounded(messages)');
  assert.ok(dbReady>=0&&processing>dbReady);
  assert.match(source,/status\(503\).*webhook_persistence_unavailable/s);
});
