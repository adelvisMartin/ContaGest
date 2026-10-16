import test from 'node:test';
import assert from 'node:assert/strict';
import { projectNotificationDeliveryEvidence } from '../backend/src/modules/notifications/notification-delivery-evidence.ts';
const row = (status='provider_accepted',id='n1') => ({
  id,tenantId:'A',channel:'whatsapp',status,createdAt:new Date('2026-10-16T00:00:00Z'),
  recipient:'+5800000000',message:'SECRET_BODY',providerId:'SECRET_PROVIDER_ID',
  error:'SECRET_ERROR',payload:{token:'SECRET_TOKEN'}
});
const fail=fn=>assert.throws(fn,{message:'NOTIFICATION_TIMELINE_EVIDENCE_INVALID'});
test('#854 provider accepted, queued and legacy delivered never certify a receipt',()=>{
  const result=projectNotificationDeliveryEvidence('A',[row('queued'),row('provider_accepted','n2'),row('delivered','n3')]);
  assert.equal(result.verifiedDeliveries,0);
  for(const r of result.records){ assert.equal(r.receiptVerified,false);assert.equal(r.deliveryEvidence,'NOT_VERIFIED'); }
});
test('#854 projection never leaks PII, body, token or provider identity',()=>{
  const result=projectNotificationDeliveryEvidence('A',[row()]);
  const serialized=JSON.stringify(result);
  for(const secret of ['SECRET_BODY','SECRET_PROVIDER_ID','SECRET_TOKEN','+5800000000','SECRET_ERROR'])assert.ok(!serialized.includes(secret));
  assert.equal(result.records[0].channel,'whatsapp');
});
test('#854 rejects cross-tenant or duplicate notification ids',()=>{
  fail(()=>projectNotificationDeliveryEvidence('B',[row()]));
  fail(()=>projectNotificationDeliveryEvidence('A',[row(),row()]));
});
test('#854 rejects unknown delivery state, unknown channel, bad date',()=>{
  fail(()=>projectNotificationDeliveryEvidence('A',[row('magically_delivered')]));
  fail(()=>projectNotificationDeliveryEvidence('A',[{...row(),channel:'arbitrary'}]));
  fail(()=>projectNotificationDeliveryEvidence('A',[{...row(),createdAt:new Date('invalid')}]));
});
test('#854 bounds rows and accepts empty result with no false success',()=>{
  const empty=projectNotificationDeliveryEvidence('A',[]);
  assert.equal(empty.verifiedDeliveries,0);assert.equal(empty.records.length,0);
  fail(()=>projectNotificationDeliveryEvidence('A',Array.from({length:101},(_,i)=>row('queued',String(i)))));
});
