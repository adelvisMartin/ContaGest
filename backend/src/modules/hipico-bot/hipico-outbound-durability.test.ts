import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read=(file:string)=>readFileSync(new URL(file,import.meta.url),'utf8');
const service=read('./hipico-bot.service.ts');
const routes=read('./hipico-operator.routes.ts');

function indexOfRequired(source:string,needle:string){
  const index=source.indexOf(needle);
  assert.ok(index>=0,`missing invariant: ${needle}`);
  return index;
}

test('real operator outbound requires live persistent outbox before send',()=>{
  assert.match(routes,/HipicoBotStore\.dbReady\(true\)/);
  assert.match(routes,/outbox_persistence_unavailable/);
  assert.match(service,/HIPICO_OUTBOX_PERSISTENCE_REQUIRED/);
  assert.match(service,/async queueIdempotent/);
});

test('operator test sends are idempotent and never reuse request id with different content',()=>{
  assert.match(routes,/requestId:requestIdSchema/);
  assert.match(routes,/queueIdempotent/);
  assert.match(service,/ON CONFLICT \("id"\) DO NOTHING/);
  assert.match(service,/HIPICO_OUTBOX_IDEMPOTENCY_MISMATCH/);
  assert.match(routes,/request_id_reused_with_different_content/);
  assert.match(routes,/previous_attempt_failed_use_new_request_id_after_review/);
});

test('policy and destination allowlist are checked before atomic send claim',()=>{
  const preflight=indexOfRequired(routes,'const preflight=outboundPreflight');
  const claim=indexOfRequired(routes,"HipicoBotStore.claimForSend(item.id,'pending_approval')");
  assert.ok(preflight<claim);
  assert.match(routes,/cloudDestinationAllowed/);
  assert.match(routes,/outbound_disabled/);
});

test('sent, failed and reconciliation transitions verify one durable row',()=>{
  assert.match(service,/const affected=await prisma\.\$executeRaw/);
  assert.match(service,/return affected===1/);
  assert.match(service,/async markReconciliationRequired/);
  assert.match(service,/"status"='reconciliation_required'/);
  assert.match(routes,/reconciliation_required/);
  assert.match(service,/status:persisted\?'sent':'reconciliation_required'/);
});

test('transport failures with unknown Meta acceptance are quarantined and never reported retryable',()=>{
  assert.match(service,/HIPICO_CLOUD_DELIVERY_AMBIGUOUS/);
  assert.match(service,/requiere conciliación manual/);
  assert.match(service,/markReconciliationRequired/);
  assert.match(routes,/persistSendFailure/);
  assert.match(routes,/state\.ambiguous/);
  assert.match(routes,/retryable:false,error:'reconciliation_required'/);
  assert.match(routes,/item\.status==='sending'\|\|item\.status==='reconciliation_required'/);
});

test('Meta recipients are constrained to E.164 maximum 15 digits end-to-end',()=>{
  assert.match(service,/E164_DIGITS=\/\^\[1-9\]\\d\{6,14\}\$\//);
  assert.match(routes,/e164Schema=z\.string\(\)\.regex\(\/\^\\\+\?\[1-9\]\\d\{6,14\}\$\/\)/);
});
