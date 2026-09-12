import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const routes=readFileSync(new URL('./hipico-webhook.routes.ts',import.meta.url),'utf8');
const service=readFileSync(new URL('./hipico-bot.service.ts',import.meta.url),'utf8');

test('real Meta webhook refuses in-memory fallback when PostgreSQL is unavailable',()=>{
  const readiness=routes.indexOf('HipicoBotStore.dbReady(true)');
  const processing=routes.indexOf('processMessagesBounded(messages)');
  assert.ok(readiness>=0&&processing>readiness,'durability readiness must run before message processing');
  assert.match(routes,/webhook_persistence_unavailable/);
  assert.match(routes,/status\(503\)/);
  assert.match(routes,/retryable:true/);
  assert.match(routes,/processIncoming\(message,\{requirePersistent:true\}\)/,'signed webhook processing must require durable event/outbox persistence');
});

test('durable webhook processing cannot fall back to memory after the readiness pre-check',()=>{
  assert.match(service,/async saveEvent\(row:any,options:\{requirePersistent\?:boolean\}=\{\}\)/);
  assert.match(service,/if\(options\.requirePersistent\)throw Object\.assign\(new Error\('Persistent Hípico event storage is required for webhook ingestion\.'\),\{code:'HIPICO_WEBHOOK_PERSISTENCE_REQUIRED'\}\)/);
  assert.match(service,/export async function processIncoming\(message:any,options:\{requirePersistent\?:boolean\}=\{\}\)/);
  assert.match(service,/HipicoBotStore\.saveEvent\([^;]+options\)/s);
});

test('webhook retry repairs a partial event-without-outbox write idempotently',()=>{
  assert.match(service,/HipicoBotStore\.queueIdempotent\([^;]+meta-webhook[^;]+providerMessageId/s);
  assert.match(service,/event\.inserted===false&&queued\.inserted===false/,'a fully persisted replay must stop without sending twice');
  assert.match(routes,/const alreadyPersisted=await assertPersistedWebhookReplay\(message\);[\s\S]*processIncoming\(message,\{requirePersistent:true\}\)/);
  const duplicateShortCircuit=service.indexOf("if(event.inserted===false)return{duplicate:true}");
  assert.equal(duplicateShortCircuit,-1,'durable replay must not short-circuit before reconstructing a missing outbox');
});

test('interrupted automatic sends fail closed into reconciliation instead of blind resend',()=>{
  assert.match(service,/persistedStatus==='sending'/);
  assert.match(service,/INTERRUPTED_AUTOMATIC_SEND_REQUIRES_RECONCILIATION/);
  assert.match(service,/HIPICO_WEBHOOK_RECONCILIATION_PERSISTENCE_REQUIRED/);
});

test('empty signed webhook batches are acknowledged without requiring PostgreSQL',()=>{
  const emptyAck=routes.indexOf('if(messages.length===0)');
  const readiness=routes.indexOf('HipicoBotStore.dbReady(true)');
  assert.ok(emptyAck>=0&&readiness>emptyAck,'empty status-only batches should be acknowledged before persistence readiness');
  assert.match(routes,/received:0,processed:0,failed:0/);
});

test('partial webhook processing failure remains retryable and is never acknowledged with 2xx',()=>{
  assert.match(routes,/if\(result\.failed>0\)/);
  assert.match(routes,/error:'webhook_processing_failed'/);
  assert.match(routes,/return res\.status\(503\)/);
  assert.match(routes,/Promise\.allSettled\(batch\.map\(processMessageWithReplayGuard\)\)/);
});
