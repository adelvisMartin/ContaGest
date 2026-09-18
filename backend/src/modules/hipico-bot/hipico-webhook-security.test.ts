import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractMessages } from './hipico-bot.service.js';
import { MIN_WEBHOOK_SECRET_LENGTH, webhookPhoneNumberId, webhookSecurityReady, webhookSignatureValid, webhookVerifyTokenValid } from './hipico-webhook-security.js';
import { __test__ as routeTest } from './hipico-webhook.routes.js';

const routes=readFileSync(new URL('./hipico-webhook.routes.ts',import.meta.url),'utf8');
const service=readFileSync(new URL('./hipico-bot.service.ts',import.meta.url),'utf8');
const strong='s'.repeat(MIN_WEBHOOK_SECRET_LENGTH);
const env={WHATSAPP_VERIFY_TOKEN:'v'.repeat(MIN_WEBHOOK_SECRET_LENGTH),WHATSAPP_APP_SECRET:strong,WHATSAPP_PHONE_NUMBER_ID:'123456789'};

function metaPayload({messageId='wamid-1',phoneNumberId='123456789',sender='584121234567'}={}){
  return{entry:[{changes:[{value:{metadata:{phone_number_id:phoneNumberId},messages:[{id:messageId,from:sender,type:'text',text:{body:'hola'}}]}}]}]};
}

test('webhook security requires strong non-placeholder secrets plus a numeric phone id',()=>{
  assert.equal(webhookSecurityReady(env),true);
  assert.equal(webhookSecurityReady({...env,WHATSAPP_VERIFY_TOKEN:'short'}),false);
  assert.equal(webhookSecurityReady({...env,WHATSAPP_APP_SECRET:'short'}),false);
  assert.equal(webhookSecurityReady({...env,WHATSAPP_VERIFY_TOKEN:'CHANGE_ME_CHANGE_ME_CHANGE_ME_CHANGE_ME'}),false);
  assert.equal(webhookSecurityReady({...env,WHATSAPP_PHONE_NUMBER_ID:'phone-id'}),false);
  assert.equal(webhookSecurityReady({...env,WHATSAPP_PHONE_NUMBER_ID:''}),false);
  assert.equal(webhookPhoneNumberId(env),'123456789');
  assert.equal(webhookPhoneNumberId({...env,WHATSAPP_PHONE_NUMBER_ID:'not-numeric'}),'');
  assert.equal(webhookVerifyTokenValid(env.WHATSAPP_VERIFY_TOKEN,env),true);
  assert.equal(webhookVerifyTokenValid(`${env.WHATSAPP_VERIFY_TOKEN}x`,env),false);
});

test('webhook HMAC requires a strong app secret and exact raw-body signature',()=>{
  const raw=Buffer.from('{"object":"whatsapp_business_account"}');
  const signature=`sha256=${crypto.createHmac('sha256',strong).update(raw).digest('hex')}`;
  assert.equal(webhookSignatureValid(raw,signature,env),true);
  assert.equal(webhookSignatureValid(raw,`${signature.slice(0,-1)}0`,env),false);
  assert.equal(webhookSignatureValid(raw,signature,{...env,WHATSAPP_APP_SECRET:'short'}),false);
  assert.equal(webhookSignatureValid(undefined,signature,env),false);
});

test('legacy service auth exports delegate to canonical strong validators instead of carrying weaker copies',()=>{
  assert.match(service,/operatorTokenValid as canonicalOperatorTokenValid/);
  assert.match(service,/import \{ webhookSignatureValid \} from '\.\/hipico-webhook-security\.js'/);
  assert.match(service,/export function signatureValid\([\s\S]*return webhookSignatureValid\(raw,signature\)/);
  assert.match(service,/export function operatorTokenValid\([\s\S]*return canonicalOperatorTokenValid\(value\)/);
  assert.doesNotMatch(service,/WHATSAPP_APP_SECRET\|\|'[^']*'\)[\s\S]{0,300}createHmac/);
});

test('backend webhook verifies configuration and signature before identity or persistence',()=>{
  const postRoute=routes.slice(routes.indexOf("router.post('/webhook'"),routes.indexOf('export default router'));
  const configCheck=postRoute.indexOf('webhookSecurityReady()');
  const signatureCheck=postRoute.indexOf('webhookSignatureValid(raw');
  const extraction=postRoute.indexOf('extractMessages(req.body)');
  const identity=postRoute.indexOf('webhookIdentityError(messages)');
  const dbCheck=postRoute.indexOf('HipicoBotStore.dbReady(true)');
  const processing=postRoute.indexOf('processMessagesBounded(messages)');
  assert.ok(configCheck>=0&&signatureCheck>configCheck&&extraction>signatureCheck&&identity>extraction&&dbCheck>identity&&processing>dbCheck);
  assert.match(postRoute,/Persistencia Hípico no disponible/);
  assert.match(postRoute,/status\(503\).*retryable:true/);
});

test('backend webhook binds every extracted message to the configured phone id',()=>{
  assert.equal(routeTest.webhookIdentityError([{phoneNumberId:'123456789'}],env),null);
  assert.equal(routeTest.webhookIdentityError([{phoneNumberId:'999999999'}],env),'WEBHOOK_PHONE_NUMBER_MISMATCH');
  assert.equal(routeTest.webhookIdentityError([{phoneNumberId:'123456789'}],{...env,WHATSAPP_PHONE_NUMBER_ID:''}),'WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED');
  assert.equal(routeTest.webhookIdentityError([{phoneNumberId:'phone-id'}],{...env,WHATSAPP_PHONE_NUMBER_ID:'phone-id'}),'WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED');
});

test('backend webhook processes the complete signed batch with bounded concurrency and bounded text',()=>{
  assert.equal(routeTest.WEBHOOK_BATCH_CONCURRENCY,25);
  assert.match(routes,/for\(let offset=0;offset<messages\.length;offset\+=WEBHOOK_BATCH_CONCURRENCY\)/);
  assert.match(routes,/messages\.slice\(offset,offset\+WEBHOOK_BATCH_CONCURRENCY\)/);
  assert.match(routes,/Promise\.allSettled\(batch\.map\(processMessageWithReplayGuard\)\)/);
  assert.match(routes,/String\(message\.body\|\|''\)\.slice\(0,4000\)/);
  assert.match(service,/MAX_INBOUND_TEXT=4000/);
  assert.doesNotMatch(routes,/extractMessages\(req\.body\)\.slice\(/);
});

test('Meta message identity is preserved exactly and malformed identities are rejected, never truncated',()=>{
  const valid=extractMessages(metaPayload({messageId:'wamid-exact',phoneNumberId:'123456789'}));
  assert.equal(valid.length,1);
  assert.equal(valid[0].providerMessageId,'wamid-exact');
  assert.equal(valid[0].phoneNumberId,'123456789');
  const prefix='x'.repeat(320);
  assert.equal(extractMessages(metaPayload({messageId:`${prefix}a`})).length,0);
  assert.equal(extractMessages(metaPayload({messageId:`${prefix}b`})).length,0);
  assert.equal(extractMessages(metaPayload({phoneNumberId:'p'.repeat(121)})).length,0);
  assert.equal(extractMessages(metaPayload({phoneNumberId:''})).length,0);
  assert.equal(extractMessages(metaPayload({sender:'0412-1234567'})).length,0);
  assert.equal(routeTest.rawMessageCount(metaPayload({messageId:`${prefix}a`})),1);
});

test('signed malformed or foreign identity is transport-acknowledged but never accepted',()=>{
  const postRoute=routes.slice(routes.indexOf("router.post('/webhook'"),routes.indexOf('export default router'));
  assert.match(postRoute,/expectedRawMessages>0&&messages\.length===0[\s\S]*status\(200\)[\s\S]*accepted:false[\s\S]*invalid_message_identity/);
  assert.match(postRoute,/webhook_phone_number_mismatch/);
  assert.match(postRoute,/acknowledged:true,accepted:false,retryable:false/);
});

test('backend webhook does not acknowledge transient partial failure but does acknowledge permanent replay mismatch',()=>{
  assert.match(routes,/if\(result\.failed>0\)[\s\S]*status\(503\)/);
  assert.match(routes,/if\(result\.mismatched>0\)[\s\S]*status\(200\)[\s\S]*webhook_replay_mismatch/);
});
