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

test('fresh sending lease stays in flight and retryable instead of premature reconciliation',()=>{
  assert.match(service,/const WEBHOOK_SEND_LEASE_MS=2\*60\*1000/,'backend webhook must reuse the canonical two-minute send lease');
  assert.match(service,/markStaleSendingReconciliation/,'sending replay must use an atomic stale-only transition');
  assert.match(service,/HIPICO_WEBHOOK_SEND_IN_FLIGHT/,'a fresh sending lease must stay retryable instead of being quarantined');
  assert.doesNotMatch(service,/persistedStatus==='sending'\)\{\s*const reconciled=await HipicoBotStore\.markReconciliationRequired/,'sending replay must never quarantine immediately');
});

test('stale sending lease is quarantined atomically using updatedAt cutoff',()=>{
  assert.match(service,/async markStaleSendingReconciliation\(idValue:string,staleBefore:Date,error:string\)/);
  assert.match(service,/"status"='sending' AND "updatedAt"<=\$\{staleBefore\}/,'stale quarantine must be guarded by the persisted sending timestamp');
  assert.match(service,/new Date\(Date\.now\(\)-WEBHOOK_SEND_LEASE_MS\)/,'stale cutoff must derive from the canonical lease');
});

test('persistent webhook never acknowledges a non-durable automatic claim or delivery receipt',()=>{
  assert.match(service,/if\(!claimed\)[\s\S]*options\.requirePersistent[\s\S]*HIPICO_WEBHOOK_CLAIM_PERSISTENCE_REQUIRED/);
  assert.match(service,/markSent\(outbox\.id,sent\.providerMessageId,'automatic'\)[\s\S]*HIPICO_WEBHOOK_RECEIPT_PERSISTENCE_REQUIRED/);
  assert.match(service,/markReconciliationRequired\(outbox\.id,error\?\.message\|\|String\(error\)\)[\s\S]*HIPICO_WEBHOOK_OUTBOX_STATE_PERSISTENCE_REQUIRED/);
  assert.match(service,/markFailed\(outbox\.id,error\?\.message\|\|String\(error\)\)[\s\S]*HIPICO_WEBHOOK_OUTBOX_STATE_PERSISTENCE_REQUIRED/);
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
