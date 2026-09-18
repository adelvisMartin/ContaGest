import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const routes=readFileSync(new URL('./hipico-webhook.routes.ts',import.meta.url),'utf8');
const canonical=readFileSync(new URL('./hipico-webhook-outbound.ts',import.meta.url),'utf8');
const replay=readFileSync(new URL('./hipico-webhook-replay.ts',import.meta.url),'utf8');
const outbox=readFileSync(new URL('./hipico-outbox.store.ts',import.meta.url),'utf8');

test('real Meta message processing refuses in-memory fallback when PostgreSQL is unavailable',()=>{
  const readiness=routes.indexOf('messages.length>0&&!await HipicoBotStore.dbReady(true)');
  const processing=routes.indexOf('processMessagesBounded(messages)');
  assert.ok(readiness>=0&&processing>readiness,'durability readiness must run before message processing');
  assert.match(routes,/webhook_persistence_unavailable/);
  assert.match(routes,/status\(503\)/);
  assert.match(routes,/retryable:true/);
  assert.match(routes,/processIncomingCanonical\(message,\{requirePersistent:true\}\)/);
});

test('canonical webhook processing propagates requirePersistent into durable event storage',()=>{
  assert.match(canonical,/saveEvent:\(row,options\)=>HipicoBotStore\.saveEvent\(row,options\)/);
  assert.match(canonical,/deps\.saveEvent\(\{\.\.\.message,\.\.\.result,status:'classified'\},options\)/);
  assert.match(canonical,/HIPICO_OUTBOX_PERSISTENCE_REQUIRED/);
  assert.match(canonical,/canonicalOutboxReadiness/);
});

test('webhook replay repairs partial event/outbox persistence idempotently',()=>{
  const guard=routes.indexOf('const alreadyPersisted=await assertPersistedWebhookReplay(message)');
  const processing=routes.indexOf('processIncomingCanonical(message,{requirePersistent:true})',guard);
  const duplicateRecheck=routes.indexOf('if(result?.duplicate&&!alreadyPersisted)await assertPersistedWebhookReplay(message)',processing);
  assert.ok(guard>=0&&processing>guard&&duplicateRecheck>processing);
  assert.match(canonical,/idempotencyKey:idempotencyKey\(String\(message\.providerMessageId\|\|''\)\)/);
  assert.match(outbox,/ON CONFLICT\(owner_id, idempotency_key\) DO NOTHING/i);
  assert.match(replay,/HIPICO_WEBHOOK_REPLAY_MISMATCH/);
});

test('canonical webhook never automatically reclaims reconciliation-required sends',()=>{
  assert.match(outbox,/o\.status IN \('queued', 'retry'\)/);
  const claim=outbox.slice(outbox.indexOf('WITH candidate AS'),outbox.indexOf('type SendingLease'));
  assert.doesNotMatch(claim,/reconciliation_required/);
});

test('empty message batches bypass message DB readiness while receipts keep their own durable path',()=>{
  assert.match(routes,/if\(messages\.length>0&&!await HipicoBotStore\.dbReady\(true\)\)/);
  assert.match(routes,/if\(receipts\.length>0\)[\s\S]*processReceiptsBounded\(receipts\)/);
  assert.match(routes,/const result=messages\.length>0\?await processMessagesBounded\(messages\):\{processed:0,failed:0,mismatched:0\}/);
});

test('partial webhook processing failure remains retryable and is never acknowledged with 2xx',()=>{
  assert.match(routes,/if\(result\.failed>0\)/);
  assert.match(routes,/error:'webhook_processing_failed'/);
  assert.match(routes,/return res\.status\(503\)/);
  assert.match(routes,/Promise\.allSettled\(batch\.map\(processMessageWithReplayGuard\)\)/);
});
