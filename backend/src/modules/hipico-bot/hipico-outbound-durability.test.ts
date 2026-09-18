import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read=(file:string)=>readFileSync(new URL(file,import.meta.url),'utf8');
const service=read('./hipico-bot.service.ts');
const routes=read('./hipico-operator.routes.ts');
const store=read('./hipico-outbox.store.ts');
const worker=read('./hipico-outbound-worker.ts');
const policy=read('./hipico-outbox-policy.ts');

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

test('real operator outbound requires canonical PostgreSQL outbox readiness before dispatch',()=>{
  const testMessage=routeBlock("router.post('/test-message'","router.post('/approve/:id'");
  assert.match(testMessage,/canonicalOutboxReadiness\(\)/);
  assert.match(testMessage,/canonical_outbox_unavailable/);
  assert.match(store,/to_regclass\('public\.hipico_outbox'\)/);
  assert.match(store,/to_regclass\('public\.hipico_outbox_receipts'\)/);
  assert.match(worker,/claimCanonicalOutbound/);
});

test('operator test sends are idempotent and never reuse request id with different content',()=>{
  assert.match(routes,/requestId:requestIdSchema/);
  assert.match(routes,/enqueueCanonicalOutbound/);
  assert.match(store,/ON CONFLICT\(owner_id, idempotency_key\) DO NOTHING/i);
  assert.match(store,/HIPICO_OUTBOUND_IDEMPOTENCY_MISMATCH/);
  assert.match(routes,/request_id_reused_with_different_content/);
  assert.match(routes,/previous_attempt_terminal_use_new_request_id_after_review/);
});

test('approval route checks policy before canonical worker claims an approval-required row',()=>{
  const approve=routeBlock("router.post('/approve/:id'","router.post('/outbox/:id/reconcile'");
  const preflight=indexOfRequired(approve,'const preflight=outboundPreflight');
  const dispatch=indexOfRequired(approve,'dispatchCanonicalOutbound');
  assert.ok(preflight<dispatch,'approval preflight must happen before canonical dispatch/claim');
  assert.match(approve,/allowApprovalRequired:true/);
  assert.match(worker,/claimCanonicalOutbound\(\{[\s\S]*allowApprovalRequired:input\.allowApprovalRequired/);
  assert.match(routes,/outbound_disabled/);
});

test('accepted retry failed and reconciliation transitions are durable canonical outbox writes',()=>{
  assert.match(worker,/markCanonicalAccepted/);
  assert.match(worker,/markCanonicalRetry/);
  assert.match(worker,/markCanonicalFailed/);
  assert.match(worker,/markCanonicalReconciliationRequired/);
  assert.match(store,/SET status = 'accepted'/);
  assert.match(store,/SET status = 'retry'/);
  assert.match(store,/SET status = 'failed'/);
  assert.match(store,/SET status = 'reconciliation_required'/);
});

test('unknown Meta acceptance is quarantined and never exposed as a blind retry',()=>{
  assert.match(policy,/HIPICO_CLOUD_DELIVERY_AMBIGUOUS/);
  assert.match(policy,/action:'reconciliation'/);
  assert.match(worker,/classification\.action==='reconciliation'/);
  assert.match(worker,/markCanonicalReconciliationRequired/);
  assert.match(routes,/result\.status==='reconciliation_required'/);
  assert.match(routes,/retryable:false,error:'reconciliation_required'/);
});

test('Meta 2xx without a provider message id is ambiguous and not a confirmed failure',()=>{
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
