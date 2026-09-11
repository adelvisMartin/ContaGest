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

test('policy destination and transport configuration are checked before atomic send claim',()=>{
  const preflight=indexOfRequired(routes,'const preflight=outboundPreflight');
  const transport=indexOfRequired(routes,'const transport=cloudTransportConfiguration()');
  const claim=indexOfRequired(routes,"HipicoBotStore.claimForSend(item.id,'pending_approval')");
  assert.ok(preflight<claim);
  assert.ok(transport<claim);
  assert.match(routes,/cloudDestinationAllowed/);
  assert.match(routes,/cloud_transport_not_configured/);
  assert.match(routes,/outbound_disabled/);
});

test('operator status uses the same transport readiness contract instead of raw env presence',()=>{
  assert.match(routes,/cloudConfigured:transport\.configured/);
  assert.match(routes,/cloudTransportReasons:transport\.reasons/);
  assert.doesNotMatch(routes,/cloudConfigured:Boolean\(process\.env\.WHATSAPP_CLOUD_TOKEN/);
});

test('legacy service authentication exports delegate to canonical hardened modules',()=>{
  assert.match(service,/import \{ metaSignatureValid \} from '\.\/hipico-meta-security\.js'/);
  assert.match(service,/operatorTokenValid as canonicalOperatorTokenValid/);
  assert.match(service,/return metaSignatureValid\(raw,signature\)/);
  assert.match(service,/return canonicalOperatorTokenValid\(value\)/);
  assert.doesNotMatch(service,/const secret=String\(process\.env\.WHATSAPP_APP_SECRET/);
  assert.doesNotMatch(service,/const expected=String\(process\.env\.HIPICO_BOT_OPERATOR_TOKEN/);
});

test('automatic mode degrades to approved unless both outbound policy and transport are ready',()=>{
  assert.match(service,/cloudOutboundPolicy\(\)\.enabled&&cloudTransportConfiguration\(\)\.configured\?'automatic':'approved'/);
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
  const successCheck=indexOfRequired(service,'if(!response.ok)');
  const missingReceipt=indexOfRequired(service,"receiptReason:'MESSAGE_ID_MISSING'");
  assert.ok(missingReceipt>successCheck,'missing receipt handling must run only after a successful HTTP response');
  assert.match(service,/Meta respondió éxito sin identificador de mensaje; requiere conciliación manual/);
  assert.match(service,/code:'HIPICO_CLOUD_DELIVERY_AMBIGUOUS'/);
  assert.doesNotMatch(service,/HIPICO_META_MESSAGE_ID_MISSING/);
});

test('Meta recipients are constrained to E.164 maximum 15 digits end-to-end',()=>{
  assert.match(service,/E164_DIGITS=\/\^\[1-9\]\\d\{6,14\}\$\//);
  assert.match(routes,/e164Schema=z\.string\(\)\.regex\(\/\^\\\+\?\[1-9\]\\d\{6,14\}\$\/\)/);
});
