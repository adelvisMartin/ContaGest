import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __test__ } from './hipico-webhook.routes.js';
import { webhookSecurityReady, webhookPhoneNumberId } from './hipico-webhook-security.js';

const source=readFileSync(new URL('./hipico-webhook.routes.ts',import.meta.url),'utf8');
const strong='x'.repeat(40);
const env={WHATSAPP_VERIFY_TOKEN:strong,WHATSAPP_APP_SECRET:strong,WHATSAPP_PHONE_NUMBER_ID:'1234567890'};

test('Cloud webhook runtime readiness includes a valid configured phone number id',()=>{
  assert.equal(webhookSecurityReady(env),true);
  assert.equal(webhookPhoneNumberId(env),'1234567890');
  assert.equal(webhookSecurityReady({...env,WHATSAPP_PHONE_NUMBER_ID:'phone-id'}),false);
  assert.equal(webhookPhoneNumberId({...env,WHATSAPP_PHONE_NUMBER_ID:'phone-id'}),'');
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'1234567890'}],env),null);
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'9999999999'}],env),'WEBHOOK_PHONE_NUMBER_MISMATCH');
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'1234567890'}],{...env,WHATSAPP_PHONE_NUMBER_ID:''}),'WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED');
});

test('Cloud webhook uses the canonical security module and immutable replay guard',()=>{
  assert.match(source,/webhookPhoneNumberId, webhookSecurityReady, webhookSignatureValid, webhookVerifyTokenValid/);
  assert.match(source,/assertPersistedWebhookReplay/);
  assert.doesNotMatch(source,/import \{[^}]*signatureValid[^}]*\} from '\.\/hipico-bot\.service\.js'/);
});

test('Cloud webhook verifies runtime readiness and raw signature before identity and processing',()=>{
  const post=source.slice(source.indexOf("router.post('/webhook'"),source.indexOf('export default router'));
  const readiness=post.indexOf('webhookSecurityReady()');
  const signature=post.indexOf('webhookSignatureValid(raw');
  const extraction=post.indexOf('extractMessages(req.body)');
  const identity=post.indexOf('webhookIdentityError(messages)');
  const persistence=post.indexOf('HipicoBotStore.dbReady(true)');
  const processing=post.indexOf('processMessagesBounded(messages)');
  assert.ok(readiness>=0&&signature>readiness&&extraction>signature&&identity>extraction&&persistence>identity&&processing>persistence);
});

test('Cloud webhook never silently truncates a valid signed batch',()=>{
  assert.equal(__test__.WEBHOOK_BATCH_CONCURRENCY,25);
  assert.doesNotMatch(source,/extractMessages\(req\.body\)\.slice\(/);
  assert.match(source,/for\(let offset=0;offset<messages\.length;offset\+=WEBHOOK_BATCH_CONCURRENCY\)/);
});

test('partial processing failure remains retryable and is never acknowledged with HTTP 200',()=>{
  assert.match(source,/if\(result\.failed>0\)/);
  assert.match(source,/if\(result\.failed>0\)[\s\S]*status\(503\)/);
  assert.match(source,/retryable:true/);
});

test('mutated provider-message replay is rejected but acknowledged to avoid Meta retry storms',()=>{
  assert.match(source,/WEBHOOK_REPLAY_MISMATCH/);
  assert.match(source,/if\(result\.mismatched>0\)[\s\S]*status\(200\)/);
  assert.match(source,/error:'webhook_replay_mismatch'/);
  assert.match(source,/acknowledged:true,accepted:false,retryable:false/);
});

test('foreign or malformed message identity is rejected before durable processing without redelivery loops',()=>{
  const invalid=source.indexOf('messages.length!==expectedRawMessages');
  const mismatch=source.indexOf("error:'webhook_phone_number_mismatch'");
  const persistence=source.indexOf('HipicoBotStore.dbReady(true)');
  assert.ok(invalid>=0&&mismatch>invalid&&persistence>mismatch);
  assert.match(source,/error:'invalid_message_identity'/);
  assert.match(source,/status\(200\).*accepted:false/s);
});

test('signed status-only callbacks may bypass PostgreSQL but not invalid runtime identity',()=>{
  const identity=source.indexOf('const identityError=webhookIdentityError(messages)');
  const empty=source.indexOf('if(messages.length===0)');
  const db=source.indexOf('HipicoBotStore.dbReady(true)');
  assert.ok(identity>=0&&empty>identity&&db>empty);
});
