import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const routes=readFileSync(new URL('./hipico-webhook.routes.ts',import.meta.url),'utf8');

test('real Meta webhook refuses in-memory fallback when PostgreSQL is unavailable',()=>{
  const readiness=routes.indexOf('HipicoBotStore.dbReady(true)');
  const processing=routes.indexOf('processMessagesBounded(messages)');
  assert.ok(readiness>=0&&processing>readiness,'durability readiness must run before message processing');
  assert.match(routes,/webhook_persistence_unavailable/);
  assert.match(routes,/status\(503\)/);
  assert.match(routes,/retryable:true/);
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
  assert.match(routes,/Promise\.allSettled\(batch\.map\(processIncoming\)\)/);
});
