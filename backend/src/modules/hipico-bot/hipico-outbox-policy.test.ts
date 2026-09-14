import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAutoClaim,
  classifyOutboundFailure,
  monotonicReceiptStatus,
  outboundPayloadDigest,
  retryDelayMs
} from './hipico-outbox-policy.js';

const canonicalPayload={
  ownerId:'11111111-1111-4111-8111-111111111111',groupKey:'club-hipico-source',destination:'584121234567',replyType:'operational',payload:{text:'Estado de carrera disponible.'}
};

test('outbox policy: semantic digest is deterministic and destination-sensitive',()=>{
  const first=outboundPayloadDigest(canonicalPayload);
  assert.match(first,/^[a-f0-9]{64}$/);
  assert.equal(first,outboundPayloadDigest({...canonicalPayload,payload:{text:'Estado de carrera disponible.'}}));
  assert.notEqual(first,outboundPayloadDigest({...canonicalPayload,destination:'584141112233'}));
});

test('outbox policy: retry delay grows exponentially and stays bounded',()=>{
  assert.equal(retryDelayMs(1,{baseMs:1000,maxMs:30_000,jitterRatio:0,jitterUnit:0}),1000);
  assert.equal(retryDelayMs(2,{baseMs:1000,maxMs:30_000,jitterRatio:0,jitterUnit:0}),2000);
  assert.equal(retryDelayMs(6,{baseMs:1000,maxMs:30_000,jitterRatio:0,jitterUnit:0}),30_000);
  assert.equal(retryDelayMs(2,{baseMs:1000,maxMs:30_000,jitterRatio:.25,jitterUnit:1}),2500);
});

test('outbox policy: every current ambiguous transport outcome requires reconciliation',()=>{
  for(const error of [
    {code:'HIPICO_CLOUD_SEND_TIMEOUT'},
    {code:'HIPICO_CLOUD_NETWORK_ERROR'},
    {code:'HIPICO_CLOUD_UPSTREAM_RETRYABLE',providerStatus:500},
    {code:'HIPICO_CLOUD_UPSTREAM_RETRYABLE',providerStatus:503},
    {code:'HIPICO_CLOUD_HTTP_ERROR',providerStatus:408},
    {code:'HIPICO_CLOUD_HTTP_ERROR',providerStatus:502}
  ]) assert.equal(classifyOutboundFailure(error).action,'reconciliation_required');
});

test('outbox policy: rate limiting may retry but deterministic failures are terminal',()=>{
  assert.equal(classifyOutboundFailure({code:'HIPICO_CLOUD_RATE_LIMITED',providerStatus:429}).action,'retry');
  assert.equal(classifyOutboundFailure({code:'HIPICO_CLOUD_HTTP_ERROR',providerStatus:429}).action,'retry');
  for(const code of ['HIPICO_CLOUD_MESSAGE_INVALID','HIPICO_CLOUD_SEND_DISABLED','HIPICO_DESTINATION_NOT_ALLOWLISTED','HIPICO_CLOUD_TRANSPORT_NOT_CONFIGURED']){
    assert.equal(classifyOutboundFailure({code}).action,'failed');
  }
});

test('outbox policy: only queued/retry rows whose schedule/cooldown/lease permits it can auto-claim',()=>{
  const now=new Date('2026-09-13T23:30:00.000Z');
  const eligible={status:'queued',attempts:0,maxAttempts:4,nextAttemptAt:'2026-09-13T23:29:00.000Z',cooldownUntil:null,leasedUntil:null};
  assert.equal(canAutoClaim(eligible,now),true);
  assert.equal(canAutoClaim({...eligible,status:'reconciliation_required'},now),false);
  assert.equal(canAutoClaim({...eligible,nextAttemptAt:'2026-09-13T23:31:00.000Z'},now),false);
  assert.equal(canAutoClaim({...eligible,cooldownUntil:'2026-09-13T23:31:00.000Z'},now),false);
  assert.equal(canAutoClaim({...eligible,leasedUntil:'2026-09-13T23:31:00.000Z'},now),false);
  assert.equal(canAutoClaim({...eligible,attempts:4},now),false);
});

test('outbox policy: Meta receipt lifecycle is monotonic and failed never downgrades delivered/read evidence',()=>{
  assert.equal(monotonicReceiptStatus('accepted','sent'),'sent');
  assert.equal(monotonicReceiptStatus('sent','delivered'),'delivered');
  assert.equal(monotonicReceiptStatus('delivered','read'),'read');
  assert.equal(monotonicReceiptStatus('read','sent'),'read');
  assert.equal(monotonicReceiptStatus('delivered','failed'),'delivered');
  assert.equal(monotonicReceiptStatus('reconciliation_required','failed'),'failed');
});
