import test from 'node:test';
import assert from 'node:assert/strict';
import {gateProviderWebhookEvent as gate} from '../backend/src/modules/integrations/webhook-ingress-gate.mjs';
const base={registeredTenantId:'tenant-a',authenticatedTenantId:'tenant-a',registeredConnectionId:'conn-a',verifiedConnectionId:'conn-a',
signedEventId:'event-0001',inboxClaimEventId:'event-0001',signatureVerified:true,receivedAtMs:1780000000000,
signedTimestampMs:1780000000000,durableInboxClaim:'inserted',inboxClaimTenantId:'tenant-a',inboxClaimConnectionId:'conn-a'};
const run=override=>gate({...base,...override});
test('verified signature and matching durable claim permit processing only',()=>{const p=run({});assert.equal(p.processingPermitted,true);assert.equal(p.reason,'VERIFIED_AND_CLAIMED');assert.ok(Object.isFrozen(p));});
test('signature fail closed regardless of durable claim',()=>assert.equal(run({signatureVerified:false}).reason,'SIGNATURE_NOT_VERIFIED'));
test('HTTP 200 or trust in caller does not replace crypto verification',()=>assert.equal(run({signatureVerified:null}).processingPermitted,false));
test('reject cross tenant and connection before admitting',()=>{assert.equal(run({authenticatedTenantId:'tenant-b'}).reason,'CONNECTION_TENANT_MISMATCH');assert.equal(run({verifiedConnectionId:'conn-b'}).reason,'CONNECTION_TENANT_MISMATCH');});
test('clock skew exactly 5 minutes allowed, beyond not',()=>{assert.equal(run({signedTimestampMs:base.receivedAtMs+300000}).processingPermitted,true);assert.equal(run({signedTimestampMs:base.receivedAtMs+300001}).reason,'TIMESTAMP_OUT_OF_WINDOW');});
test('stale and future timestamps rejected',()=>{assert.equal(run({signedTimestampMs:base.receivedAtMs-300001}).processingPermitted,false);assert.equal(run({signedTimestampMs:'today'}).processingPermitted,false);});
test('missing durable inbox claim always blocks processing',()=>{for(const claim of [null,'pending','failed',false])assert.equal(run({durableInboxClaim:claim}).reason,'INBOX_CLAIM_REQUIRED');});
test('replayed provider event never reprocesses',()=>assert.equal(run({durableInboxClaim:'duplicate'}).reason,'DUPLICATE_EVENT'));
test('claim must be for exact event, tenant and connection',()=>{assert.equal(run({inboxClaimEventId:'event-0002'}).reason,'INBOX_CLAIM_SCOPE_MISMATCH');assert.equal(run({inboxClaimTenantId:'tenant-b'}).processingPermitted,false);assert.equal(run({inboxClaimConnectionId:'conn-b'}).processingPermitted,false);});
test('invalid identifiers and timestamps fail closed',()=>{assert.equal(run({signedEventId:'bad event'}).reason,'INVALID_TRUSTED_IDENTITY');assert.equal(run({receivedAtMs:NaN}).processingPermitted,false);});
test('result never leaks provider payload, keys or event ID',()=>{const value=JSON.stringify(run({}));for(const fragment of [base.signedEventId,base.registeredTenantId,base.registeredConnectionId,'secret'])assert.ok(!value.includes(fragment));});
test('invalid input and array cannot pass',()=>{assert.equal(gate(null).processingPermitted,false);assert.equal(gate([]).processingPermitted,false);});
