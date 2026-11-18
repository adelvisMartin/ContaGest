import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Reproduce a session change AFTER IndexedDB.open but BEFORE the transaction
// completion event. No browser storage, credentials, network or real tenants.
const source=readFileSync(new URL('../frontend/src/services/pwaOfflineService.js',import.meta.url),'utf8')
  .replace(/^export /gm,'');
const compiled=new Function('localStorage','indexedDB','openOverride',
  source+'\nopenOutbox=openOverride;\nreturn {sessionScope,enqueueOfflineOperation,readOutbox};');

function harness(operation){
  const session={tenantId:'qa-tenant-A',user:{id:'qa-user-A'}};
  let current=session,transaction,request,closes=0,addCount=0;
  let releaseStarted;
  const started=new Promise(resolve=>{releaseStarted=resolve;});
  const store={
    get(){request={};return request;},
    getAll(){request={};return request;},
    add(){addCount++;}
  };
  const database={
    transaction(){
      transaction={objectStore:()=>store,oncomplete:null,onerror:null,onabort:null};
      releaseStarted();
      return transaction;
    },
    close(){closes++;}
  };
  const localStorage={
    getItem(key){return key==='contagest_auth_session'&&current?JSON.stringify(current):null;}
  };
  const api=compiled(localStorage,{},async()=>database);
  const inFlight=operation==='enqueue'
    ? api.enqueueOfflineOperation({session,operation:'analytics.event',
        payload:{kind:'session-race'},idempotencyKey:'safe-event-00000001'})
    : api.readOutbox(session);
  async function complete(){
    assert.ok(request,'IndexedDB request must have started');
    if(operation==='read'){
      request.result=[{id:'old-record',scopeToken:api.sessionScope(session),payload:{id:'private'}}];
    }else request.result=undefined;
    assert.equal(typeof request.onsuccess,'function');
    request.onsuccess();
    // readOutbox must attach transaction.oncomplete after getAll resolves.
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(typeof transaction.oncomplete,'function');
    transaction.oncomplete();
  }
  return {
    session,inFlight,started,complete,
    logout(){current=null;},
    switchTenant(){current={tenantId:'qa-tenant-B',user:{id:'qa-user-A'}};},
    get closes(){return closes;},get addCount(){return addCount;}
  };
}

for(const operation of ['read','enqueue']){
  for(const action of ['logout','switchTenant']){
    test(`#797 ${operation} rejects stale completion after ${action}`,async()=>{
      const h=harness(operation);
      await h.started;
      h[action]();
      await h.complete();
      await assert.rejects(h.inFlight,error=>error?.code==='OFFLINE_SESSION_CHANGED');
      assert.equal(h.closes,1,'IDB handle must be closed on session change');
    });
  }
  test(`#797 ${operation} completes for unchanged active identity`,async()=>{
    const h=harness(operation);
    await h.started;
    await h.complete();
    const value=await h.inFlight;
    if(operation==='read')assert.equal(value[0]?.id,'old-record');
    else{
      assert.equal(value.operation,'analytics.event');
      assert.equal(h.addCount,1);
    }
    assert.equal(h.closes,1);
  });
}
