import test from 'node:test';
import assert from 'node:assert/strict';
import {enqueueOfflineOperation,flushOfflineOutbox,OUTBOX_ALLOWLIST} from '../frontend/src/services/pwaOfflineService.js';
import {readFileSync} from 'node:fs';
const session={tenantId:'tenant-A',user:{id:'user-A'}};
const file=readFileSync(new URL('../frontend/src/services/pwaOfflineService.js',import.meta.url),'utf8');
test('#797 inherited JS property names must never become offline permissions',async()=>{
  for(const operation of ['constructor','toString','__proto__','valueOf','hasOwnProperty','gym.workout.set']){
    await assert.rejects(enqueueOfflineOperation({session,operation,payload:{},idempotencyKey:'sample-key-123'}),e=>e?.code==='OFFLINE_OPERATION_NOT_ALLOWED');
  }
  assert.deepEqual(Object.keys(OUTBOX_ALLOWLIST),['analytics.event','gym.workout.set']);
});
test('#797 enqueue canonical analytics event still requests real session + IndexedDB',async()=>{
  await assert.rejects(enqueueOfflineOperation({session,operation:'analytics.event',payload:{event:'ok'},idempotencyKey:'sample-key-123'}),/IndexedDB/);
  await assert.rejects(enqueueOfflineOperation({session:null,operation:'analytics.event',payload:{},idempotencyKey:'sample-key-123'}),/sesión tenant\/user/);
});
test('#797 replay must resolve method/path against code authority, not persisted metadata',()=>{
  const body=file.split('export async function flushOfflineOutbox')[1].split('export async function recoverOfflineRuntime')[0];
  assert.match(body,/Object\.hasOwn\(OUTBOX_ALLOWLIST,\s*record\.operation\)/);
  assert.match(body,/method: authority\.method/);
  assert.match(body,/const path=resolveOfflinePath\(record\.operation,record\.payload\)/);
  assert.doesNotMatch(body,/record\.authority\.(?:method|path)/);
});
test('#797 workout SET now uses durable server replay authority',()=>{
  assert.equal(OUTBOX_ALLOWLIST['gym.workout.set'].path,'/verticals/gym/workout-sessions/:sessionId/sets');
  assert.equal(Object.hasOwn(OUTBOX_ALLOWLIST,'gym.workout.complete'),false);
  assert.ok(OUTBOX_ALLOWLIST['analytics.event'].path.startsWith('/analytics/'));
});
