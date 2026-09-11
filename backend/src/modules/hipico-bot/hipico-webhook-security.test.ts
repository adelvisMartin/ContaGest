import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MIN_WEBHOOK_SECRET_LENGTH, webhookSecurityReady, webhookSignatureValid, webhookVerifyTokenValid } from './hipico-webhook-security.js';

const routes=readFileSync(new URL('./hipico-webhook.routes.ts',import.meta.url),'utf8');
const service=readFileSync(new URL('./hipico-bot.service.ts',import.meta.url),'utf8');
const strong='s'.repeat(MIN_WEBHOOK_SECRET_LENGTH);
const env={WHATSAPP_VERIFY_TOKEN:'v'.repeat(MIN_WEBHOOK_SECRET_LENGTH),WHATSAPP_APP_SECRET:strong};

test('webhook security rejects weak or missing secrets and compares verify tokens safely',()=>{
  assert.equal(webhookSecurityReady(env),true);
  assert.equal(webhookSecurityReady({...env,WHATSAPP_VERIFY_TOKEN:'short'}),false);
  assert.equal(webhookSecurityReady({...env,WHATSAPP_APP_SECRET:'short'}),false);
  assert.equal(webhookVerifyTokenValid(env.WHATSAPP_VERIFY_TOKEN,env),true);
  assert.equal(webhookVerifyTokenValid(`${env.WHATSAPP_VERIFY_TOKEN}x`,env),false);
  assert.equal(webhookVerifyTokenValid('short',{...env,WHATSAPP_VERIFY_TOKEN:'short'}),false);
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

test('backend webhook verifies configuration/signature and persistence before processing',()=>{
  const postRoute=routes.slice(routes.indexOf("router.post('/webhook'"),routes.indexOf('export default router'));
  const configCheck=postRoute.indexOf('webhookSecurityReady()');
  const signatureCheck=postRoute.indexOf('webhookSignatureValid(raw');
  const dbCheck=postRoute.indexOf('HipicoBotStore.dbReady(true)');
  const extraction=postRoute.indexOf('extractMessages(req.body)');
  assert.ok(configCheck>=0&&signatureCheck>configCheck&&dbCheck>signatureCheck&&extraction>dbCheck);
  assert.match(postRoute,/Persistencia Hípico no disponible/);
  assert.match(postRoute,/status\(503\).*retryable:true/);
});

test('backend webhook processes the complete signed batch with bounded concurrency and bounded text',()=>{
  assert.match(routes,/WEBHOOK_BATCH_CONCURRENCY=25/);
  assert.match(routes,/for\(let offset=0;offset<messages\.length;offset\+=WEBHOOK_BATCH_CONCURRENCY\)/);
  assert.match(routes,/messages\.slice\(offset,offset\+WEBHOOK_BATCH_CONCURRENCY\)/);
  assert.match(routes,/Promise\.allSettled\(batch\.map\(processIncoming\)\)/);
  assert.match(routes,/String\(message\.body\|\|''\)\.slice\(0,4000\)/);
  assert.match(service,/MAX_INBOUND_TEXT=4000/);
  assert.match(service,/String\(message\?\.text\?\.body[\s\S]*\.slice\(0,MAX_INBOUND_TEXT\)/);
  assert.match(service,/String\(message\.id\|\|''\)\.slice\(0,320\)/);
  assert.doesNotMatch(routes,/extractMessages\(req\.body\)\.slice\(0,100\)/);
});

test('backend webhook does not acknowledge a partially failed batch',()=>{
  assert.match(routes,/if\(failed\)[\s\S]*status\(503\)/);
  assert.match(routes,/status\(200\)\.json\(\{ok:true,received:messages\.length,processed:processedCount,failed:0\}\)/);
});