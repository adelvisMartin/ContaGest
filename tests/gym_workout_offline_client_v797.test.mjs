import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OUTBOX_ALLOWLIST,resolveOfflinePath,enqueueOfflineOperation} from '../frontend/src/services/pwaOfflineService.js';

const a='b49ef9b7-405f-45e4-84d5-7528752a5e73';
const b='a49ef9b7-405f-45e4-84d5-7528752a5e73';
const valid={sessionId:a,routineExerciseId:b,setNumber:1,status:'completed',reps:8,loadKg:40};
const session={tenantId:'tenant-A',user:{id:'user-A'}};

test('#797 path is source-controlled and only a valid UUID is interpolated',()=>{
  assert.equal(OUTBOX_ALLOWLIST['gym.workout.set'].method,'POST');
  assert.equal(resolveOfflinePath('gym.workout.set',valid),
    '/verticals/gym/workout-sessions/'+a+'/sets');
  assert.throws(()=>resolveOfflinePath('gym.workout.set',{...valid,sessionId:'../../admin'}),
    {code:'OFFLINE_WORKOUT_PAYLOAD_INVALID'});
  assert.throws(()=>resolveOfflinePath('constructor',valid),{code:'OFFLINE_OPERATION_NOT_ALLOWED'});
});

test('#797 rejects forbidden fields and invalid payload before IndexedDB access',async()=>{
  for(const invalid of [
    {...valid,accessToken:'sensitive'},
    {...valid,sessionId:'https://evil.invalid'},
    {...valid,notes:'x'.repeat(9000)},
    {...valid,setNumber:-1},
    {...valid,reps:null},
    {...valid,status:'deleted'}
  ]){
    await assert.rejects(enqueueOfflineOperation({
      session,operation:'gym.workout.set',payload:invalid,idempotencyKey:'test-event-0123456789'
    }),{code:'OFFLINE_WORKOUT_PAYLOAD_INVALID'});
  }
});

test('#797 replay never trusts a persisted URL/method/authority',()=>{
  const source=readFileSync(new URL('../frontend/src/services/pwaOfflineService.js',import.meta.url),'utf8');
  assert.match(source,/Object\.hasOwn\(OUTBOX_ALLOWLIST,\s*record\.operation\)/);
  assert.match(source,/resolveOfflinePath\(record\.operation,record\.payload\)/);
  assert.match(source,/assertCurrentOfflineSession\(session\)/);
  assert.match(source,/store\.add\(record\)/);
  assert.doesNotMatch(source,/record\.authority\.(method|path)/);
});
