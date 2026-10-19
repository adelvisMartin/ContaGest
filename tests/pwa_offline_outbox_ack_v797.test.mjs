import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('frontend/src/services/pwaOfflineService.js','utf8');
const executable=source.replace(/^export /gm,'');
function harness(records) {
  const deleted=[];
  const compiled=new Function('records','deleted',
    executable+'\nreadOutbox=async()=>records;\n'+
    'deleteOutboxRecord=async(_session,id)=>{deleted.push(id)};\n'+
    'return {assertOfflineDeliveryAcknowledged,flushOfflineOutbox,enqueueOfflineOperation};');
  const api=compiled(records,deleted);
  const session={tenantId:'tenant-A',user:{id:'user-A'}};
  return {...api,deleted,session};
}
const records=[
  {id:'A',createdAt:'2026-10-16T01:00:00Z',operation:'analytics.event',authority:{method:'POST',path:'/analytics/events'},idempotencyKey:'EVENT-0001',payload:{kind:'analytics'}},
  {id:'B',createdAt:'2026-10-16T01:01:00Z',operation:'analytics.event',authority:{method:'POST',path:'/analytics/events'},idempotencyKey:'EVENT-0002',payload:{kind:'analytics'}}
];

test('#797 true acknowledgment permits deletion in order',async()=>{
 const h=harness(records);const sent=[];
 const result=await h.flushOfflineOutbox(h.session,async row=>{sent.push(row.idempotencyKey);return {ok:true}});
 assert.deepEqual(sent,['EVENT-0001','EVENT-0002']);
 assert.deepEqual(h.deleted,['A','B']); assert.equal(result.length,2);
 assert.ok(result.every(row=>row.delivered));
});
test('#797 explicit ok:false cannot delete pending item or continue to next item',async()=>{
 const h=harness(records);let requests=0;
 const result=await h.flushOfflineOutbox(h.session,async()=>{requests++;return {ok:false}});
 assert.equal(requests,1);assert.deepEqual(h.deleted,[]);
 assert.equal(result[0].delivered,false);assert.match(result[0].error,/OFFLINE_DELIVERY_NOT_ACKNOWLEDGED/);
});
test('#797 explicit delivered:false and HTTP status errors do not delete',async()=>{
 for(const denied of [{delivered:false},{status:409},{status:503},false,null]) {
  const h=harness(records);
  const rows=await h.flushOfflineOutbox(h.session,async()=>denied);
  assert.equal(rows[0].delivered,false);assert.deepEqual(h.deleted,[]);
 }
});
test('#797 rejected Promise retains record and stops ordered flush',async()=>{
 const h=harness(records);let requests=0;
 const rows=await h.flushOfflineOutbox(h.session,async()=>{requests++;throw Error('offline');});
 assert.equal(requests,1);assert.deepEqual(h.deleted,[]);assert.equal(rows[0].delivered,false);
});
test('#797 ambiguous responses cannot be acknowledged',()=>{
 const h=harness([]);
 for(const response of [null,undefined,false,{},'OK',{ok:false},{delivered:false},{status:400}])
  assert.throws(()=>h.assertOfflineDeliveryAcknowledged(response),/OFFLINE_DELIVERY_NOT_ACKNOWLEDGED/);
});
test('#797 gym workout mutation remains disabled absent idempotent server consumer',async()=>{
 const h=harness([]);
 assert.doesNotMatch(source,/['"]gym\.workout['"]\s*:/);
 assert.match(source,/'analytics.event': Object\.freeze/);
 await assert.rejects(h.enqueueOfflineOperation({session:h.session,operation:'gym.workout.create',
    payload:{sessionId:'x'},idempotencyKey:'EVENT-0003'}),error=>error.code==='OFFLINE_OPERATION_NOT_ALLOWED');
});
test('#797 duplicate queued event uses indexedDB add, never destructive put',()=>{
 assert.match(source,/store\.add\(record\)/);
 assert.doesNotMatch(source,/store\.put\(record\)/);
 assert.match(source,/sessionScope\(session\)/);
});
test('#797 idempotencyKey is bounded before IndexedDB',async()=>{
 const h=harness([]);
 for(const key of ['short','evil/tenant','a'.repeat(129),{value:'EVENT-0001'}]) {
  await assert.rejects(h.enqueueOfflineOperation({session:h.session,operation:'analytics.event',
    payload:{},idempotencyKey:key}));
 }
});
