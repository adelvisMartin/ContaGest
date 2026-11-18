import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Existing PWA regression technique: execute the exact module source with a
// controlled IndexedDB.open boundary. No real auth, network or shared storage.
const source=readFileSync(new URL('../frontend/src/services/pwaOfflineService.js',import.meta.url),'utf8')
  .replace(/^export /gm,'');

function deferred() {
  let release;
  const promise=new Promise(resolve=>{release=resolve;});
  return {promise,release};
}

function simulatedOpen() {
  const initial={tenantId:'tenant-A',user:{id:'user-A'}};
  let current=initial;
  const waiting=deferred();
  const entered=deferred();
  let transactions=0,closes=0;
  const database={
    transaction(){transactions++;throw new Error('IDB_TRANSACTION_SENTINEL');},
    close(){closes++;}
  };
  const storage={
    getItem(key){return key==='contagest_auth_session'?JSON.stringify(current):null;}
  };
  const open=async()=>{entered.release();await waiting.promise;return database;};
  const compile=new Function('localStorage','indexedDB','openOverride',
    source+'\nopenOutbox=openOverride;\nreturn {enqueueOfflineOperation,readOutbox,deleteOutboxRecord,updateGymOutboxFailure};');
  const api=compile(storage,{},open);
  return {
    api,session:initial,
    waitForOpen:()=>entered.promise,
    finishOpen:()=>waiting.release(),
    switchToOtherTenant:()=>{current={tenantId:'tenant-B',user:{id:'user-A'}};},
    logout:()=>{current=null;},
    get transactions(){return transactions;},
    get closes(){return closes;}
  };
}

const operations={
  enqueue: h=>h.api.enqueueOfflineOperation({
    session:h.session,operation:'analytics.event',
    payload:{kind:'race'},idempotencyKey:'race-event-00000001'
  }),
  read: h=>h.api.readOutbox(h.session),
  delete: h=>h.api.deleteOutboxRecord(h.session,'queued'),
  updateFailure: h=>h.api.updateGymOutboxFailure(h.session,'queued',new Error('offline'))
};

for(const [name,invoke] of Object.entries(operations)) {
  for(const switchAction of ['logout','switchToOtherTenant']){
    test(`#797 ${name} aborts after IndexedDB open on ${switchAction}`,async()=>{
      const h=simulatedOpen();
      const inFlight=invoke(h);
      await h.waitForOpen();
      h[switchAction]();
      h.finishOpen();
      await assert.rejects(inFlight,error=>error?.code==='OFFLINE_SESSION_CHANGED');
      assert.equal(h.transactions,0,'no stale session transaction may start');
      assert.equal(h.closes,1,'opened database handle must be closed');
    });
  }
}

test('#797 an unchanged active session is not falsely rejected after open',async()=>{
  const h=simulatedOpen();
  const inFlight=operations.enqueue(h);
  await h.waitForOpen();
  h.finishOpen();
  await assert.rejects(inFlight,/IDB_TRANSACTION_SENTINEL/);
  assert.equal(h.transactions,1);
  assert.equal(h.closes,1);
});
