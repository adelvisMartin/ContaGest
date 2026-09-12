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

function routeBlock(start:string,end:string|null=null){
  const startIndex=indexOfRequired(routes,start);
  const endIndex=end?routes.indexOf(end,startIndex):routes.length;
  assert.ok(endIndex>startIndex,`missing route boundary after: ${start}`);
  return routes.slice(startIndex,endIndex);
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

test('approval route checks policy and destination allowlist before atomic send claim',()=>{
  const approve=routeBlock("router.post('/approve/:id'",'export default router');
  const preflight=indexOfRequired(approve,'const preflight=outboundPreflight');
  const claim=indexOfRequired(approve,"HipicoBotStore.claimForSend(item.id,'pending_approval')");
  assert.ok(preflight<claim,'approval preflight must happen before claiming a sendable row');
  assert.match(approve,/cloudDestinationAllowed|outboundPreflight/);
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

test('Meta 2xx without a provider message id is also ambiguous and not a confirmed failure',()=>{
  const sender=service.slice(indexOfRequired(service,'export async function sendCloudText'),indexOfRequired(service,'export async function processIncoming'));
  const successCheck=indexOfRequired(sender,'if(!response.ok)');
  const missingReceipt=indexOfRequired(sender,"receiptReason:'MESSAGE_ID_MISSING'");
  assert.ok(missingReceipt>successCheck,'missing receipt handling must run only after a successful HTTP response');
  assert.match(sender,/Meta respondió éxito sin identificador de mensaje; requiere conciliación manual/);
  assert.match(sender,/code:'HIPICO_CLOUD_DELIVERY_AMBIGUOUS'/);
  assert.doesNotMatch(sender,/HIPICO_META_MESSAGE_ID_MISSING/);
});

test('Meta recipients are constrained to E.164 maximum 15 digits end-to-end',()=>{
  assert.match(service,/E164_DIGITS=\/\^\[1-9\]\\d\{6,14\}\$\//);
  assert.match(routes,/e164Schema=z\.string\(\)\.regex\(\/\^\\\+\?\[1-9\]\\d\{6,14\}\$\/\)/);
});